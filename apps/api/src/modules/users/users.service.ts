import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

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
  }) {
    return this.prisma.user.create({
      data: {
        email: data.email,
        passwordHash: data.passwordHash,
        fullName: data.fullName,
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
}
