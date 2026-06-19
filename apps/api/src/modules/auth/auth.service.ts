import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  // NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  // ── REGISTER ──────────────────────────────────────────
  async register(dto: RegisterDto) {
    // 1. Check if email is already taken
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new BadRequestException(
        'An account with this email already exists',
      );
    }

    // 2. Verify the department exists
    const department = await this.prisma.department.findUnique({
      where: { id: dto.departmentId },
    });
    if (!department || department.isArchived) {
      throw new BadRequestException('Selected department is not valid');
    }

    // 3. Verify the academic year exists AND belongs to that department
    // This prevents a student submitting a mismatched departmentId/academicYearId
    // pair by manipulating the request directly (Zero Trust — never trust client data)
    const academicYear = await this.prisma.academicYear.findUnique({
      where: { id: dto.academicYearId },
    });
    if (
      !academicYear ||
      academicYear.isArchived ||
      academicYear.departmentId !== dto.departmentId
    ) {
      throw new BadRequestException(
        'Selected academic year does not belong to the selected department',
      );
    }

    // 4. Hash the password
    const passwordHash = await bcrypt.hash(dto.password, 12);

    // 5. Create the user in the database
    const user = await this.usersService.create({
      email: dto.email,
      passwordHash,
      fullName: dto.fullName,
      departmentId: dto.departmentId,
      academicYearId: dto.academicYearId,
      phoneNumber: dto.phoneNumber,
    });

    // 4. Generate email verification token
    // crypto.randomBytes creates a random string
    // It is impossible to guess
    const token = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // 5. Save the token to the database
    await this.usersService.saveVerifyToken(user.id, token, expiry);

    // 6. TODO: Send verification email (Sprint 1 Step 2)
    // For now we return the token so we can test manually
    console.log(`Verification token for ${user.email}: ${token}`);

    return {
      message:
        'Registration successful. Please check your email to verify your account.',
      // Remove this in production — only for testing
      verifyToken: token,
    };
  }

  // ── VERIFY EMAIL ──────────────────────────────────────
  async verifyEmail(token: string) {
    // Find the user with this exact token
    // We have to use prisma directly here for a custom query
    // UsersService does not have this method yet
    const user = await this.usersService.findByVerifyToken(token);

    if (!user) {
      throw new BadRequestException('Invalid or expired verification link');
    }

    // Check the token has not expired
    if (user.emailVerifyExpiry && user.emailVerifyExpiry < new Date()) {
      throw new BadRequestException(
        'Verification link has expired. Please request a new one.',
      );
    }

    // Mark email as verified
    await this.usersService.markEmailVerified(user.id);

    return { message: 'Email verified successfully. You can now log in.' };
  }

  // ── LOGIN ─────────────────────────────────────────────
  async login(dto: LoginDto) {
    // 1. Find the user by email
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      // Important: same message for wrong email OR wrong password
      // Never tell an attacker which one was wrong
      throw new UnauthorizedException('Invalid email or password');
    }

    // 2. Check the account is active
    if (!user.isActive) {
      throw new UnauthorizedException(
        'Your account has been deactivated. Contact support.',
      );
    }

    // 3. Check email is verified
    if (!user.isEmailVerified) {
      throw new UnauthorizedException(
        'Please verify your email address before logging in.',
      );
    }

    // 4. Compare the password with the stored hash
    const passwordMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatch) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // 5. Create the JWT tokens
    const tokens = await this.generateTokens(user.id, user.email, user.role);

    return {
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
      ...tokens,
    };
  }

  // ── REFRESH TOKEN ─────────────────────────────────────
  async refreshTokens(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return this.generateTokens(userId, user.email, user.role);
  }

  // Verify a refresh token and return its payload
  // Used by the refresh controller route
  verifyRefreshToken(token: string): { sub: string } {
    try {
      return this.jwtService.verify(token, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  // ── FORGOT PASSWORD ───────────────────────────────────
  async forgotPassword(email: string) {
    const user = await this.usersService.findByEmail(email);

    // Always return success even if email not found
    // This prevents attackers from discovering which emails exist
    if (!user) {
      return { message: 'If that email exists, a reset link has been sent.' };
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.usersService.saveResetToken(user.id, token, expiry);

    // TODO: Send reset email (Sprint 1 Step 2)
    console.log(`Reset token for ${user.email}: ${token}`);

    return {
      message: 'If that email exists, a reset link has been sent.',
      // Remove this in production
      resetToken: token,
    };
  }

  // ── RESET PASSWORD ────────────────────────────────────
  async resetPassword(token: string, newPassword: string) {
    const user = await this.usersService.findByResetToken(token);

    if (!user) {
      throw new BadRequestException('Invalid or expired reset link');
    }

    if (user.passwordResetExpiry && user.passwordResetExpiry < new Date()) {
      throw new BadRequestException(
        'Reset link has expired. Please request a new one.',
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.usersService.updatePassword(user.id, passwordHash);

    return { message: 'Password reset successful. You can now log in.' };
  }

  // ── PRIVATE: Generate JWT Tokens ──────────────────────
  private async generateTokens(userId: string, email: string, role: string) {
    // The payload is the data stored inside the token
    // Keep it small — only what we need to identify the user
    const payload = { sub: userId, email, role };

    // Access token — short lived (15 minutes)
    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.config.get('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get('JWT_ACCESS_EXPIRES_IN') ?? '15m',
    });

    // Refresh token — longer lived (7 days)
    const refreshToken = await this.jwtService.signAsync(
      { sub: userId },
      {
        secret: this.config.get('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN') ?? '7d',
      },
    );

    return { accessToken, refreshToken };
  }
}
