import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { CurrentUser } from './common/decorators/current-user.decorator';

import type { RequestUser } from './common/types/request-user';

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
  getMe(@CurrentUser() user: RequestUser) {
    return {
      message: 'You are authenticated',
      user,
    };
  }
}
