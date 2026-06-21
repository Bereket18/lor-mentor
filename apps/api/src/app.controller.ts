import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { CurrentUser } from './common/decorators/current-user.decorator';

interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  isActive: boolean;
  isEmailVerified: boolean;
  createdAt: Date;
  department?: { id: string; name: string } | null;
  academicYear?: { id: string; label: string } | null;
}

@Controller()
export class AppController {
  // Public route — no login needed
  // GET /api/v1/health
  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      app: 'Lor Mentor API',
      timestamp: new Date().toISOString(),
    };
  }

  // Protected route — login required
  // GET /api/v1/me
  // Returns the currently logged-in user's profile
  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@CurrentUser() user: AuthUser) {
    return {
      message: 'You are authenticated',
      user,
    };
  }
}
