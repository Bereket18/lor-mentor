import {
  Controller,
  Get,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { CurrentUser } from './common/decorators/current-user.decorator';
import { PrismaService } from './prisma/prisma.service';

import type { RequestUser } from './common/types/request-user';

@Controller()
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  // Liveness — process is up. No dependency checks (used by orchestrators to
  // decide whether to restart the pod).
  // GET /api/v1/health
  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      app: 'Lor Mentor API',
      timestamp: new Date().toISOString(),
    };
  }

  // Readiness — can this instance actually serve traffic? Verifies the DB is
  // reachable so a pod with a dead connection is pulled from the load balancer
  // instead of being marked Ready and served real requests.
  // GET /api/v1/health/ready
  @Get('health/ready')
  async getReadiness() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({
        status: 'unavailable',
        database: 'down',
      });
    }
    return { status: 'ready', database: 'up' };
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
