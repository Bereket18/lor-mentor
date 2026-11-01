import {
  Injectable,
  Logger,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import {
  canCreateRole,
  canChangeRole,
  canDeleteRole,
  canManageReviewerAccess,
  isPrivileged,
} from './role.util';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  // PrismaService is injected automatically by NestJS
  // We do not create it with "new" — NestJS handles that
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  private publicWebBase(): string {
    const base =
      this.config.get<string>('WEB_PUBLIC_URL') ??
      this.config.get<string>('APP_URL') ??
      'http://localhost:3000';
    return base.replace(/\/$/, '');
  }

  // Find a user by their email address
  // Used during login to check if the user exists
  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  // Find a user by their ID
  // Used to get the current logged-in user's profile
  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      // Never return the password hash to the frontend
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        phoneNumber: true,
        avatarPath: true,
        isActive: true,
        isEmailVerified: true,
        isAnatomyReviewer: true,
        createdAt: true,
      },
    });
  }

  // Create a new user in the database
  // Called during registration
  async create(data: {
    email: string;
    passwordHash: string;
    fullName: string;
    departmentId: string;
    academicYearId: string;
    phoneNumber: string;
  }) {
    return this.prisma.user.create({
      data: {
        email: data.email,
        passwordHash: data.passwordHash,
        fullName: data.fullName,
        departmentId: data.departmentId,
        academicYearId: data.academicYearId,
        phoneNumber: data.phoneNumber,
      },
    });
  }

  // Save the email verification token
  // Called after registration to store the token we emailed
  async saveVerifyToken(userId: string, token: string, expiry: Date) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        emailVerifyToken: token,
        emailVerifyExpiry: expiry,
      },
    });
  }

  // Mark the user's email as verified
  // Called when user clicks the verification link
  async markEmailVerified(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        isEmailVerified: true,
        emailVerifyToken: null,
        emailVerifyExpiry: null,
      },
    });
  }

  // Save the password reset token
  // Called when user requests a password reset
  async saveResetToken(userId: string, token: string, expiry: Date) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordResetToken: token,
        passwordResetExpiry: expiry,
      },
    });
  }

  // Update the user's password
  // Called after they click the reset link and set a new password
  async updatePassword(userId: string, passwordHash: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        failedLoginCount: 0,
        lockoutUntil: null,
        passwordResetToken: null,
        passwordResetExpiry: null,
      },
    });
  }
  // Atomically claim a password-reset token and write the new hash in ONE
  // UPDATE statement. The WHERE clause filters on token value AND non-expired
  // expiry, so a replayed (already-cleared) or expired token returns count=0
  // without a prior SELECT — closes the TOCTOU race in the old 2-trip flow
  // where findByResetToken + updatePassword were separate round-trips that
  // caused "new password doesn't work after reset".
  async claimResetToken(
    token: string,
    passwordHash: string,
  ): Promise<string | null> {
    if (!token) return null;

    // Read the owner first only so the caller can revoke that account's
    // sessions. This read is NOT the gate: the atomic update below still
    // matches on the token and expiry, so a token consumed concurrently by
    // another request yields count === 0 and this returns null.
    // `passwordResetToken` is not a unique column, so this is findFirst.
    const owner = await this.prisma.user.findFirst({
      where: { passwordResetToken: token },
      select: { id: true },
    });
    if (!owner) return null;

    const result = await this.prisma.user.updateMany({
      where: {
        id: owner.id,
        passwordResetToken: token,
        passwordResetExpiry: { gt: new Date() },
      },
      data: {
        passwordHash,
        failedLoginCount: 0,
        lockoutUntil: null,
        passwordResetToken: null,
        passwordResetExpiry: null,
      },
    });
    return result.count === 1 ? owner.id : null;
  }

  // Find user by email verification token
  async findByVerifyToken(token: string) {
    return this.prisma.user.findFirst({
      where: { emailVerifyToken: token },
    });
  }

  // Find user by password reset token
  async findByResetToken(token: string) {
    return this.prisma.user.findFirst({
      where: { passwordResetToken: token },
    });
  }
  // Get paginated list of all users — admin dashboard
  async findAll(options: {
    page: number;
    limit: number;
    search: string;
    role: string;
    sortBy?: string;
    isActive?: string;
    departmentId?: string;
  }) {
    const { page, limit, search, role, sortBy, isActive, departmentId } =
      options;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {};

    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (role && Object.values(Role).includes(role as Role)) {
      where.role = role as Role;
    }

    // Account status is deliberately separate from subscription status:
    // isActive is the login gate (changed via PATCH :id/status), while access
    // to paid content is driven by the Subscription row.
    if (isActive === 'true' || isActive === 'false') {
      where.isActive = isActive === 'true';
    }

    if (departmentId) {
      where.departmentId = departmentId;
    }

    // Role sort order: SUPER_ADMIN > ADMIN > TEACHER > STUDENT > GUEST
    // Prisma doesn't support enum ordering natively, so we fetch all
    // and sort in memory only when sortBy=role is requested
    const orderBy: Prisma.UserOrderByWithRelationInput =
      sortBy === 'role' ? { role: 'asc' } : { createdAt: 'desc' };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          isActive: true,
          isEmailVerified: true,
          isAnatomyReviewer: true,
          createdAt: true,
          updatedAt: true,
          departmentId: true,
          academicYearId: true,
          department: { select: { id: true, name: true } },
          academicYear: { select: { id: true, label: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    // Custom role sort to get meaningful order
    const roleOrder: Record<string, number> = {
      SUPER_ADMIN: 0,
      ADMIN: 1,
      TEACHER: 2,
      STUDENT: 3,
      GUEST: 4,
    };
    if (sortBy === 'role') {
      users.sort((a, b) => (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9));
    }

    return {
      users,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // SUPER_ADMIN: delete accounts inactive for more than 12 months
  async deleteInactiveUsers() {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 12);

    // Find users who haven't updated their record in 12+ months AND are inactive
    const inactive = await this.prisma.user.findMany({
      where: {
        isActive: false,
        updatedAt: { lt: cutoff },
        // Never auto-delete staff or admins
        role: { in: ['STUDENT', 'GUEST'] },
      },
      select: { id: true, email: true, fullName: true },
    });

    if (inactive.length === 0) {
      return {
        message: 'No inactive accounts found older than 12 months',
        deleted: 0,
      };
    }

    const ids = inactive.map((u) => u.id);

    // Accounts with financial history are never swept away — same rule as
    // deleteUser(). This is a bulk, unattended operation, so it must be the
    // conservative one: skip (and leave deactivated) rather than destroy the
    // college's accounting record.
    const [paying, subscribed] = await Promise.all([
      this.prisma.payment.findMany({
        where: { userId: { in: ids } },
        select: { userId: true },
      }),
      this.prisma.subscription.findMany({
        where: { userId: { in: ids } },
        select: { userId: true },
      }),
    ]);
    const retained = new Set(
      [...paying, ...subscribed].map((row) => row.userId),
    );
    const removable = ids.filter((id) => !retained.has(id));
    const skipped = ids.length - removable.length;

    if (removable.length === 0) {
      return {
        message: `No inactive accounts older than 12 months can be deleted (${skipped} retained for financial history)`,
        deleted: 0,
        retained: skipped,
      };
    }

    // Delete each account with the full FK cascade in one transaction. The old
    // version only cleared progress/notification/aiHistory and then failed with
    // a foreign-key violation for any user that had quiz attempts, forum posts,
    // payments, subscriptions, etc.
    await this.prisma.$transaction(async (tx) => {
      for (const id of removable) {
        await this.cascadeDeleteUser(tx, id);
      }
    });

    return {
      message:
        `Deleted ${removable.length} inactive account(s)` +
        (skipped > 0 ? `; retained ${skipped} with financial history` : ''),
      deleted: removable.length,
      retained: skipped,
      users: inactive,
    };
  }

  // Change a user's role — admin action, subject to the role hierarchy.
  async changeRole(
    userId: string,
    role: string,
    actorId: string,
    actorRole: string,
  ) {
    const validRoles = ['STUDENT', 'TEACHER', 'ADMIN', 'SUPER_ADMIN'];
    if (!validRoles.includes(role)) {
      throw new BadRequestException('Invalid role provided');
    }
    if (userId === actorId) {
      throw new ForbiddenException('You cannot change your own role');
    }

    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!target) throw new NotFoundException('User not found');

    if (!canChangeRole(actorRole, target.role, role)) {
      throw new ForbiddenException(
        'You are not allowed to make this role change',
      );
    }

    // Every TEACHER account is an anatomy reviewer by default. The flag stays
    // explicit so an individual teacher can still be revoked with the
    // anatomy:reviewer CLI. Moving a user out of TEACHER clears it: ADMIN and
    // SUPER_ADMIN are never allowed to review anatomy.
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        role: role as 'STUDENT' | 'TEACHER' | 'ADMIN' | 'SUPER_ADMIN',
        isAnatomyReviewer: role === 'TEACHER',
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isAnatomyReviewer: true,
      },
    });

    return { message: `Role updated to ${role}`, user };
  }

  // Assign or re-assign a user's department and optionally academic year.
  // Admin action — allows fixing program assignment after account creation.
  // Students always require both fields; staff only require the department.
  // Admin accounts carry no program: the field has no functional use for them
  // (verified in the admin-dashboard audit — no course/student scoping reads
  // an admin's departmentId), so this is rejected for ADMIN/SUPER_ADMIN.
  async assignDepartment(
    userId: string,
    departmentId: string,
    academicYearId: string | undefined,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!user) throw new NotFoundException('User not found');

    if (isPrivileged(user.role)) {
      throw new BadRequestException(
        'Program assignment does not apply to admin accounts',
      );
    }

    const dept = await this.prisma.department.findUnique({
      where: { id: departmentId },
    });
    if (!dept || dept.isArchived) {
      throw new BadRequestException('Selected department is not valid');
    }

    if (academicYearId) {
      const year = await this.prisma.academicYear.findUnique({
        where: { id: academicYearId },
        select: { departmentId: true, isArchived: true },
      });
      if (!year || year.isArchived || year.departmentId !== departmentId) {
        throw new BadRequestException(
          'Selected academic year is not valid for this department',
        );
      }
    } else if (user.role === 'STUDENT') {
      throw new BadRequestException(
        'Students require an academic year assignment',
      );
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { departmentId, academicYearId: academicYearId ?? null },
      select: {
        id: true,
        fullName: true,
        departmentId: true,
        academicYearId: true,
        department: { select: { id: true, name: true } },
        academicYear: { select: { id: true, label: true } },
      },
    });

    return { message: 'Program assigned', user: updated };
  }

  // Activate or deactivate a user — admin action
  async changeStatus(userId: string, isActive: boolean, actorId: string) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { isActive },
      select: {
        id: true,
        email: true,
        fullName: true,
        isActive: true,
      },
    });

    // Account activation/deactivation is a security-relevant action — record
    // who did it and to whom, alongside the login lockout entries.
    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
        entityType: 'User',
        entityId: userId,
        meta: { isActive },
      },
    });

    const status = isActive ? 'activated' : 'deactivated';
    return { message: `Account ${status}`, user };
  }

  // Grant or revoke a teacher's anatomy reviewer access. This flag is the only
  // per-account gate on the anatomy review routes; approving individual
  // structures is a separate action. Every TEACHER gets the flag by default
  // (createUser / changeRole), and this is the admin-controlled way to take it
  // away again. Reviewer access is TEACHER-only, so the service rejects any
  // other target role even though the route already requires ADMIN/SUPER_ADMIN.
  async setAnatomyReviewer(
    userId: string,
    isAnatomyReviewer: boolean,
    actorId: string,
    actorRole: string,
  ) {
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isAnatomyReviewer: true,
      },
    });
    if (!target) throw new NotFoundException('User not found');

    if (!canManageReviewerAccess(actorRole, target.role)) {
      throw new ForbiddenException(
        'Anatomy reviewer access can only be changed for teacher accounts',
      );
    }

    // Idempotent: don't write a redundant audit entry for a no-op change.
    if (target.isAnatomyReviewer === isAnatomyReviewer) {
      return {
        message: isAnatomyReviewer
          ? 'Teacher already has anatomy reviewer access'
          : 'Teacher does not have anatomy reviewer access',
        changed: false,
        user: target,
      };
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { isAnatomyReviewer },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isAnatomyReviewer: true,
      },
    });

    // Grant/revoke is a permission change — record who did it and to whom,
    // reusing the action keys written by the anatomy:reviewer CLI so the
    // audit trail reads consistently.
    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: isAnatomyReviewer
          ? 'ANATOMY_REVIEWER_GRANT'
          : 'ANATOMY_REVIEWER_REVOKE',
        entityType: 'User',
        entityId: updated.id,
        meta: {
          email: updated.email,
          fullName: updated.fullName,
          isAnatomyReviewer: updated.isAnatomyReviewer,
          source: 'admin-reviewer-access',
        },
      },
    });

    return {
      message: isAnatomyReviewer
        ? 'Anatomy reviewer access granted'
        : 'Anatomy reviewer access revoked',
      changed: true,
      user: updated,
    };
  }

  // Create a user of any role the actor is permitted to create.
  // Students require department + academic year; staff are pre-verified.
  async createUser(actorRole: string, data: CreateUserDto) {
    if (!canCreateRole(actorRole, data.role)) {
      throw new ForbiddenException(
        'You are not allowed to create a user with that role',
      );
    }

    const existing = await this.findByEmail(data.email);
    if (existing) {
      throw new BadRequestException(
        'An account with this email already exists',
      );
    }

    if (data.role === 'STUDENT') {
      if (!data.departmentId || !data.academicYearId) {
        throw new BadRequestException(
          'Students require a department and academic year',
        );
      }
      await this.validateDepartmentYear(data.departmentId, data.academicYearId);
    } else if (data.departmentId) {
      // Admin accounts carry no program (same rule as assignDepartment).
      if (isPrivileged(data.role)) {
        throw new BadRequestException(
          'Program assignment does not apply to admin accounts',
        );
      }
      // Optional department for staff — validate if supplied
      const dept = await this.prisma.department.findUnique({
        where: { id: data.departmentId },
      });
      if (!dept || dept.isArchived) {
        throw new BadRequestException('Selected department is not valid');
      }
    }

    // Optional course pre-assignment for teachers. Validate the whole
    // selection BEFORE creating anything so a bad request leaves no partial
    // account behind, then assign inside the same transaction as the account
    // (the `teacherId: null` filter makes concurrent double-assignment safe:
    // if another admin just claimed one of the courses, the transaction rolls
    // back and no account is created).
    const courseIds = [
      ...new Set((data.courseIds ?? []).map((id) => id.trim()).filter(Boolean)),
    ];
    if (courseIds.length > 0) {
      if (data.role !== 'TEACHER') {
        throw new BadRequestException(
          'Courses can only be assigned to teacher accounts',
        );
      }
      const courses = await this.prisma.course.findMany({
        where: { id: { in: courseIds }, isArchived: false },
        select: { id: true, title: true, teacherId: true },
      });
      if (courses.length !== courseIds.length) {
        throw new BadRequestException(
          'One or more selected courses were not found',
        );
      }
      const taken = courses.find((course) => course.teacherId !== null);
      if (taken) {
        throw new BadRequestException(
          `Course "${taken.title}" already has a teacher assigned. Reassign it from the course page instead.`,
        );
      }
    }

    // No password is generated, and none is ever returned or logged.
    //
    // The account is created with a hash of a random value nobody knows, so it
    // cannot be signed into until the staff member sets a password. The
    // single-use, 48-hour setup token below is delivered by email; it reuses
    // the reset-token column and is invalidated by the same atomic claim, so
    // there is no second token mechanism to keep secure.
    const unusablePassword = crypto.randomBytes(32).toString('hex');
    const passwordHash = await bcrypt.hash(unusablePassword, 12);
    const setupToken = crypto.randomBytes(32).toString('hex');
    const setupExpiry = new Date(Date.now() + 48 * 60 * 60 * 1000);

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: data.email,
          passwordHash,
          fullName: data.fullName,
          role: data.role,
          // New teachers receive anatomy review access automatically. The
          // flag remains revocable per account; see the anatomy:reviewer CLI.
          ...(data.role === 'TEACHER' ? { isAnatomyReviewer: true } : {}),
          isEmailVerified: true,
          isActive: true,
          passwordResetToken: setupToken,
          passwordResetExpiry: setupExpiry,
          ...(data.departmentId ? { departmentId: data.departmentId } : {}),
          ...(data.academicYearId
            ? { academicYearId: data.academicYearId }
            : {}),
          ...(data.phoneNumber ? { phoneNumber: data.phoneNumber } : {}),
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          departmentId: true,
        },
      });

      if (courseIds.length > 0) {
        const assigned = await tx.course.updateMany({
          where: { id: { in: courseIds }, teacherId: null, isArchived: false },
          data: { teacherId: created.id },
        });
        if (assigned.count !== courseIds.length) {
          throw new BadRequestException(
            'The selected courses were just assigned to another teacher. Please try again.',
          );
        }
      }

      return created;
    });

    // Invite the staff member to set their own password. A mail outage must not
    // strand an account that already exists, so the fallback hands the
    // single-use link to the creating admin instead — still never a password,
    // still expiring, still consumed on first use.
    const setupUrl = `${this.publicWebBase()}/reset-password?token=${encodeURIComponent(setupToken)}`;
    let invitationSent = false;
    try {
      await this.mail.sendStaffInvitation(
        user.email,
        user.fullName,
        setupUrl,
        data.role,
      );
      invitationSent = true;
    } catch (error) {
      this.logger.warn(
        `Staff invitation email could not be sent for user ${user.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return {
      user,
      invitationSent,
      // Present only when the email could not be sent. The admin passes it on
      // out of band; it expires in 48 hours and stops working once used.
      ...(invitationSent ? {} : { setupUrl }),
    };
  }

  // Validate a department + academic-year pair (year must belong to dept).
  private async validateDepartmentYear(
    departmentId: string,
    academicYearId: string,
  ) {
    const dept = await this.prisma.department.findUnique({
      where: { id: departmentId },
    });
    if (!dept || dept.isArchived) {
      throw new BadRequestException('Selected department is not valid');
    }
    const year = await this.prisma.academicYear.findUnique({
      where: { id: academicYearId },
      select: { departmentId: true, isArchived: true },
    });
    if (!year || year.isArchived || year.departmentId !== departmentId) {
      throw new BadRequestException(
        'Selected academic year is not valid for this department',
      );
    }
  }

  // Hard-delete a user the actor is permitted to remove, cleaning up all
  // dependent rows in one transaction. Cannot delete self or the last super
  // admin.
  async deleteUser(userId: string, actorId: string, actorRole: string) {
    if (userId === actorId) {
      throw new ForbiddenException('You cannot delete your own account');
    }

    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!target) throw new NotFoundException('User not found');

    if (!canDeleteRole(actorRole, target.role)) {
      throw new ForbiddenException('You are not allowed to delete this user');
    }

    if (target.role === 'SUPER_ADMIN') {
      const supers = await this.prisma.user.count({
        where: { role: 'SUPER_ADMIN' },
      });
      if (supers <= 1) {
        throw new ForbiddenException('Cannot delete the last super admin');
      }
    }

    // Financial history is never destroyed with an account.
    //
    // AuditLog rows survive a delete (actorId is ON DELETE SET NULL), but
    // Payment and Subscription rows are the college's accounting record: they
    // back receipts already issued to the student and any reconciliation the
    // college has to perform later. There is no approved retention policy and
    // no archive table, so a hard delete would destroy that history with no
    // way back. Refuse the delete and point the admin at deactivation, which
    // already exists and keeps the account (and its records) intact.
    const [paymentCount, subscriptionCount] = await Promise.all([
      this.prisma.payment.count({ where: { userId } }),
      this.prisma.subscription.count({ where: { userId } }),
    ]);
    if (paymentCount > 0 || subscriptionCount > 0) {
      throw new ConflictException(
        `This account has financial history (${paymentCount} payment(s), ${subscriptionCount} subscription(s)) and cannot be deleted. Deactivate the account instead — financial records must be retained.`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await this.cascadeDeleteUser(tx, userId);
    });

    return { message: 'User deleted' };
  }

  // Remove every row that references this user, in FK-safe order, then the user
  // itself. Shared by deleteUser() and the 12-month inactive-account sweep.
  // Must run inside a transaction so a partial cleanup can never be committed.
  private async cascadeDeleteUser(
    tx: Prisma.TransactionClient,
    userId: string,
  ) {
    // Simple owned rows
    await tx.progressRecord.deleteMany({ where: { userId } });
    await tx.notification.deleteMany({ where: { userId } });
    await tx.aiHistory.deleteMany({ where: { userId } });
    await tx.flashcardReview.deleteMany({ where: { userId } });

    // Quiz answers depend on attempts
    const attempts = await tx.quizAttempt.findMany({
      where: { userId },
      select: { id: true },
    });
    const attemptIds = attempts.map((a) => a.id);
    if (attemptIds.length) {
      await tx.quizAnswer.deleteMany({
        where: { attemptId: { in: attemptIds } },
      });
    }
    await tx.quizAttempt.deleteMany({ where: { userId } });

    // Forum reactions/reports authored by the user
    await tx.reaction.deleteMany({ where: { userId } });
    await tx.report.deleteMany({ where: { reporterId: userId } });

    // The user's replies — clear reactions/reports on them first
    const replies = await tx.forumReply.findMany({
      where: { authorId: userId },
      select: { id: true },
    });
    const replyIds = replies.map((r) => r.id);
    if (replyIds.length) {
      await tx.reaction.deleteMany({ where: { replyId: { in: replyIds } } });
      await tx.report.deleteMany({ where: { replyId: { in: replyIds } } });
      await tx.forumReply.deleteMany({ where: { id: { in: replyIds } } });
    }

    // The user's posts — clear child replies + reactions/reports first
    const posts = await tx.forumPost.findMany({
      where: { authorId: userId },
      select: { id: true },
    });
    const postIds = posts.map((p) => p.id);
    if (postIds.length) {
      const childReplies = await tx.forumReply.findMany({
        where: { postId: { in: postIds } },
        select: { id: true },
      });
      const childReplyIds = childReplies.map((r) => r.id);
      if (childReplyIds.length) {
        await tx.reaction.deleteMany({
          where: { replyId: { in: childReplyIds } },
        });
        await tx.report.deleteMany({
          where: { replyId: { in: childReplyIds } },
        });
        await tx.forumReply.deleteMany({
          where: { id: { in: childReplyIds } },
        });
      }
      await tx.reaction.deleteMany({ where: { postId: { in: postIds } } });
      await tx.report.deleteMany({ where: { postId: { in: postIds } } });
      await tx.forumPost.deleteMany({ where: { id: { in: postIds } } });
    }

    // Billing
    await tx.payment.deleteMany({ where: { userId } });
    await tx.subscription.deleteMany({ where: { userId } });

    // Detach owned courses. AuditLog.actorId is ON DELETE SET NULL, so the
    // audit trail is preserved when the user row is removed.
    await tx.course.updateMany({
      where: { teacherId: userId },
      data: { teacherId: null },
    });

    await tx.user.delete({ where: { id: userId } });
  }

  // Full profile for the logged-in user — includes role-relevant relations
  // (department, academic year + semesters, subscription, recent payments,
  // and — for teachers — their assigned courses). Never selects passwordHash.
  async getFullProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        avatarPath: true,
        phoneNumber: true,
        isActive: true,
        isEmailVerified: true,
        createdAt: true,
        department: { select: { id: true, name: true } },
        academicYear: {
          select: {
            id: true,
            label: true,
            semesters: {
              where: { isArchived: false },
              orderBy: { name: 'asc' },
              select: { id: true, name: true },
            },
          },
        },
        subscription: {
          select: {
            status: true,
            startDate: true,
            endDate: true,
            plan: {
              select: { name: true, priceETB: true, durationMonths: true },
            },
          },
        },
        payments: {
          // Hide an online checkout that was opened but never completed, or an
          // initialization that failed before bank confirmation. A
          // Chapa-confirmed row (including an underpayment) has a chapaRef; an
          // approved row is always visible.
          where: {
            NOT: {
              method: 'CHAPA',
              chapaRef: null,
              status: { not: 'APPROVED' },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            status: true,
            createdAt: true,
            rejectionReason: true,
            plan: { select: { name: true, priceETB: true } },
          },
        },
        teacherCourses: {
          where: { isArchived: false },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            title: true,
            isPublished: true,
            _count: { select: { materials: true } },
          },
        },
      },
    });

    if (!user) throw new NotFoundException('User not found');
    return { user };
  }

  // Student updates their own profile
  async updateProfile(userId: string, data: { fullName?: string }) {
    // Allow-list. This route's body is a type-only annotation, not a DTO
    // class, so the global ValidationPipe (`whitelist` +
    // `forbidNonWhitelisted`) does not strip anything here — it skips
    // validation when it has no class metatype to validate against. Passing
    // the body straight to prisma.user.update would therefore let a caller set
    // any column, including `role`. Copy only the field this endpoint owns.
    const update: { fullName?: string } = {};
    if (typeof data?.fullName === 'string') {
      update.fullName = data.fullName;
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: update,
      select: {
        id: true,
        email: true,
        fullName: true,
        avatarPath: true,
      },
    });

    return { message: 'Profile updated', user };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const matches = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!matches) {
      throw new BadRequestException('Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.updatePassword(userId, passwordHash);
    return { message: 'Password changed successfully' };
  }
}
