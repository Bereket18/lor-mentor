import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

@Injectable()
export class UsersService {
  // PrismaService is injected automatically by NestJS
  // We do not create it with "new" — NestJS handles that
  constructor(private readonly prisma: PrismaService) {}

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
        avatarPath: true,
        isActive: true,
        isEmailVerified: true,
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
        passwordResetToken: null,
        passwordResetExpiry: null,
      },
    });
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
  }) {
    const { page, limit, search, role, sortBy } = options;
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
          createdAt: true,
          updatedAt: true,
          departmentId: true,
          department: { select: { id: true, name: true } },
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

    // Delete in correct FK order
    await this.prisma.progressRecord.deleteMany({
      where: { userId: { in: ids } },
    });
    await this.prisma.notification.deleteMany({
      where: { userId: { in: ids } },
    });
    await this.prisma.aiHistory.deleteMany({ where: { userId: { in: ids } } });
    await this.prisma.user.deleteMany({ where: { id: { in: ids } } });

    return {
      message: `Deleted ${ids.length} inactive account(s)`,
      deleted: ids.length,
      users: inactive,
    };
  }

  // Change a user's role — admin action
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async changeRole(userId: string, role: string, _actorId: string) {
    const validRoles = ['STUDENT', 'TEACHER', 'ADMIN', 'SUPER_ADMIN'];
    if (!validRoles.includes(role)) {
      throw new Error('Invalid role provided');
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { role: role as 'STUDENT' | 'TEACHER' | 'ADMIN' | 'SUPER_ADMIN' },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
      },
    });

    return { message: `Role updated to ${role}`, user };
  }

  // Activate or deactivate a user — admin action
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async changeStatus(userId: string, isActive: boolean, _actorId: string) {
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

    const status = isActive ? 'activated' : 'deactivated';
    return { message: `Account ${status}`, user };
  }

  // Delete a single user by ID — role-restricted
  // SUPER_ADMIN: can delete ADMIN, TEACHER, STUDENT, GUEST (not other SUPER_ADMINs)
  // ADMIN: can only delete STUDENT and GUEST accounts
  async deleteUser(userId: string, actorRole: string) {
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, fullName: true, email: true },
    });

    if (!target) throw new Error('User not found');

    // Prevent deleting any SUPER_ADMIN account
    if (target.role === 'SUPER_ADMIN') {
      throw new Error('Super admin accounts cannot be deleted');
    }

    // Admins can only delete students/guests
    if (
      actorRole === 'ADMIN' &&
      !['STUDENT', 'GUEST'].includes(target.role)
    ) {
      throw new Error('Admins can only delete student or guest accounts');
    }

    // Delete in FK-safe order
    await this.prisma.progressRecord.deleteMany({ where: { userId } });
    await this.prisma.notification.deleteMany({ where: { userId } });
    await this.prisma.aiHistory.deleteMany({ where: { userId } });
    await this.prisma.user.delete({ where: { id: userId } });

    return { message: `Account deleted`, deletedUser: target };
  }

  // Create a teacher or admin account — admin action
  async createStaff(data: {
    fullName: string;
    email: string;
    role: 'TEACHER' | 'ADMIN';
    departmentId?: string;
  }) {
    const existing = await this.findByEmail(data.email);
    if (existing) {
      throw new BadRequestException(
        'An account with this email already exists',
      );
    }

    // Validate department if provided
    if (data.departmentId) {
      const dept = await this.prisma.department.findUnique({
        where: { id: data.departmentId },
      });
      if (!dept || dept.isArchived) {
        throw new BadRequestException('Selected department is not valid');
      }
    }

    const temporaryPassword = crypto.randomBytes(6).toString('hex');
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);

    const user = await this.prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        fullName: data.fullName,
        role: data.role,
        isEmailVerified: true,
        ...(data.departmentId ? { departmentId: data.departmentId } : {}),
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        departmentId: true,
      },
    });

    return { user, temporaryPassword };
  }

  // Student updates their own profile
  async updateProfile(userId: string, data: { fullName?: string }) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        email: true,
        fullName: true,
        avatarPath: true,
      },
    });

    return { message: 'Profile updated', user };
  }
}
