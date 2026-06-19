import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt  from 'bcrypt'
import * as crypto  from 'crypto'

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
  }) {
    const { page, limit, search, role } = options;
    const skip = (page - 1) * limit;

    // Use Prisma's generated type — it knows role must be Role enum
    const where: Prisma.UserWhereInput = {};

    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Cast role string to Role enum — safe because we validate it
    if (role && Object.values(Role).includes(role as Role)) {
      where.role = role as Role;
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          isActive: true,
          isEmailVerified: true,
          createdAt: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      users,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
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
  // Create a teacher or admin account directly — admin action only
  // The new account gets a random temporary password
  // In production this will email them an invite link (future sprint)
  async createStaffAccount(
    data: { fullName: string; email: string; role: 'TEACHER' | 'ADMIN' },
    _actorId: string,
  ) {
    const existing = await this.prisma.user.findUnique({
      where: { email: data.email },
    });
    if (existing) {
      throw new Error(`An account with ${data.email} already exists`);
    }

    // Generate a temporary password
    const tempPassword = crypto.randomBytes(8).toString('hex');
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const user = await this.prisma.user.create({
      data: {
        email: data.email,
        fullName: data.fullName,
        passwordHash,
        role: data.role,
        isEmailVerified: true, // Staff accounts are pre-verified
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
      },
    });

    // TODO Sprint 7: email the temp password instead of returning it
    // For now return it so admin can communicate it manually
    return {
      message: `${data.role} account created`,
      user,
      temporaryPassword: tempPassword,
    };
  }
}
