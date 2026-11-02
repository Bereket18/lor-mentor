import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { SkipAudit } from '../../common/decorators/audit.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserThrottlerGuard } from '../../common/guards/user-throttler.guard';
import { AnatomyReviewService } from './anatomy-review.service';
import {
  ReviewSettingsDto,
  ReviewSystemDto,
  ReviewSystemParamsDto,
} from './dto/anatomy-review.dto';

import type { RequestUser } from '../../common/types/request-user';

const WRITE_THROTTLE = { default: { limit: 30, ttl: 60_000 } };

/**
 * Administrative anatomy publication workflow.
 *
 * Deliberately separate from the anatomy lab: administrators approve and
 * publish here without opening `/anatomy` or gaining lab data access. The
 * service still enforces the unsigned-structure gate, so this surface cannot
 * bypass faculty sign-off. TEACHER accounts are rejected by RolesGuard, and the
 * anatomy review controller rejects ADMIN/SUPER_ADMIN in the opposite
 * direction.
 */
@Controller('admin/anatomy')
@UseGuards(JwtAuthGuard, RolesGuard, UserThrottlerGuard)
@Roles('ADMIN', 'SUPER_ADMIN')
export class AnatomyAdminController {
  constructor(private readonly service: AnatomyReviewService) {}

  // GET /api/v1/admin/anatomy/systems
  @Get('systems')
  listSystems() {
    return this.service.listSystems();
  }

  // GET /api/v1/admin/anatomy/systems/:slug
  @Get('systems/:slug')
  getSystem(@Param() params: ReviewSystemParamsDto) {
    return this.service.getSystemStructures(params.slug);
  }

  // POST /api/v1/admin/anatomy/systems/:slug/approve
  // Records the approving administrator, timestamp, and approved revision.
  @Throttle(WRITE_THROTTLE)
  @Post('systems/:slug/approve')
  @SkipAudit()
  @HttpCode(HttpStatus.OK)
  approvePublication(
    @Param() params: ReviewSystemParamsDto,
    @CurrentUser() user: RequestUser,
    @Body() dto: ReviewSystemDto,
  ) {
    return this.service.approvePublication(user, params.slug, dto);
  }

  // POST /api/v1/admin/anatomy/systems/:slug/publish
  @Throttle(WRITE_THROTTLE)
  @Post('systems/:slug/publish')
  @SkipAudit()
  @HttpCode(HttpStatus.OK)
  publishSystem(
    @Param() params: ReviewSystemParamsDto,
    @CurrentUser() user: RequestUser,
    @Body() dto: ReviewSystemDto,
  ) {
    return this.service.publishSystem(user, params.slug, dto);
  }

  // POST /api/v1/admin/anatomy/systems/:slug/unpublish
  @Throttle(WRITE_THROTTLE)
  @Post('systems/:slug/unpublish')
  @SkipAudit()
  @HttpCode(HttpStatus.OK)
  unpublishSystem(
    @Param() params: ReviewSystemParamsDto,
    @CurrentUser() user: RequestUser,
    @Body() dto: ReviewSystemDto,
  ) {
    return this.service.unpublishSystem(user, params.slug, dto);
  }

  // GET /api/v1/admin/anatomy/settings
  @Get('settings')
  getSettings() {
    return this.service.getSettings();
  }

  // PATCH /api/v1/admin/anatomy/settings
  @Throttle(WRITE_THROTTLE)
  @Patch('settings')
  @SkipAudit()
  updateSettings(
    @CurrentUser() user: RequestUser,
    @Body() dto: ReviewSettingsDto,
  ) {
    return this.service.updateSettings(user, dto);
  }
}
