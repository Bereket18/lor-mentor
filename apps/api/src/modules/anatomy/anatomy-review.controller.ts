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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserThrottlerGuard } from '../../common/guards/user-throttler.guard';
import { AnatomyReviewService } from './anatomy-review.service';
import { AnatomyReviewerGuard } from './anatomy-reviewer.guard';
import {
  ReviewStructureDto,
  ReviewStructureParamsDto,
  ReviewSystemDto,
  ReviewSystemParamsDto,
  UpdateAnatomyStructureDto,
} from './dto/anatomy-review.dto';

import type { RequestUser } from '../../common/types/request-user';

const WRITE_THROTTLE = { default: { limit: 30, ttl: 60_000 } };

/**
 * In-app faculty review surface. The offline review packet stays available,
 * but these routes let a flagged teacher edit, review, and revoke text without
 * touching the database directly.
 *
 * The guard order is deliberate: authentication, then TEACHER role, then the
 * explicit reviewer flag, then the per-user throttle. ADMIN/SUPER_ADMIN are
 * blocked by the role gate even if someone sets isAnatomyReviewer by hand.
 */
@Controller('anatomy/review')
@UseGuards(JwtAuthGuard, RolesGuard, AnatomyReviewerGuard, UserThrottlerGuard)
@Roles('TEACHER')
export class AnatomyReviewController {
  constructor(private readonly service: AnatomyReviewService) {}

  // GET /api/v1/anatomy/review/systems
  @Get('systems')
  listSystems() {
    return this.service.listSystems();
  }

  // GET /api/v1/anatomy/review/systems/:slug/structures
  @Get('systems/:slug/structures')
  getSystemStructures(@Param() params: ReviewSystemParamsDto) {
    return this.service.getSystemStructures(params.slug);
  }

  // PATCH /api/v1/anatomy/review/structures/:id
  @Throttle(WRITE_THROTTLE)
  @Patch('structures/:id')
  updateStructure(
    @Param() params: ReviewStructureParamsDto,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateAnatomyStructureDto,
  ) {
    return this.service.updateStructure(user, params.id, dto);
  }

  // POST /api/v1/anatomy/review/structures/:id/review
  @Throttle(WRITE_THROTTLE)
  @Post('structures/:id/review')
  @HttpCode(HttpStatus.OK)
  reviewStructure(
    @Param() params: ReviewStructureParamsDto,
    @CurrentUser() user: RequestUser,
    @Body() dto: ReviewStructureDto,
  ) {
    return this.service.reviewStructure(user, params.id, dto);
  }

  // POST /api/v1/anatomy/review/systems/:slug/review
  @Throttle(WRITE_THROTTLE)
  @Post('systems/:slug/review')
  @HttpCode(HttpStatus.OK)
  reviewSystem(
    @Param() params: ReviewSystemParamsDto,
    @CurrentUser() user: RequestUser,
    @Body() dto: ReviewSystemDto,
  ) {
    return this.service.reviewSystem(user, params.slug, dto);
  }

  // POST /api/v1/anatomy/review/systems/:slug/publish
  @Throttle(WRITE_THROTTLE)
  @Post('systems/:slug/publish')
  @HttpCode(HttpStatus.OK)
  publishSystem(
    @Param() params: ReviewSystemParamsDto,
    @CurrentUser() user: RequestUser,
    @Body() dto: ReviewSystemDto,
  ) {
    return this.service.publishSystem(user, params.slug, dto);
  }

  // POST /api/v1/anatomy/review/systems/:slug/unpublish
  @Throttle(WRITE_THROTTLE)
  @Post('systems/:slug/unpublish')
  @HttpCode(HttpStatus.OK)
  unpublishSystem(
    @Param() params: ReviewSystemParamsDto,
    @CurrentUser() user: RequestUser,
    @Body() dto: ReviewSystemDto,
  ) {
    return this.service.unpublishSystem(user, params.slug, dto);
  }

  // POST /api/v1/anatomy/review/structures/:id/revoke
  @Throttle(WRITE_THROTTLE)
  @Post('structures/:id/revoke')
  @HttpCode(HttpStatus.OK)
  revokeStructure(
    @Param() params: ReviewStructureParamsDto,
    @CurrentUser() user: RequestUser,
    @Body() dto: ReviewStructureDto,
  ) {
    return this.service.revokeStructure(user, params.id, dto);
  }

  // GET /api/v1/anatomy/review/structures/:id/revisions
  @Get('structures/:id/revisions')
  listRevisions(@Param() params: ReviewStructureParamsDto) {
    return this.service.listRevisions(params.id);
  }
}
