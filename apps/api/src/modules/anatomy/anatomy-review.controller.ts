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
 * In-app faculty review surface (the anatomy lab).
 *
 * Ordinary TEACHER accounts may read the review library, edit teaching text,
 * and inspect revision history. Faculty sign-off and revocation additionally
 * require the explicit isAnatomyReviewer flag, enforced at method level by
 * AnatomyReviewerGuard and again in the service.
 *
 * Publication approval and publishing are NOT here: they live in the separate
 * admin controller so an administrator never needs anatomy-lab access, and a
 * reviewer can never publish without an administrator's approval. ADMIN and
 * SUPER_ADMIN are blocked at the role gate.
 */
@Controller('anatomy/review')
@UseGuards(JwtAuthGuard, RolesGuard, UserThrottlerGuard)
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
  getSystemStructures(
    @Param() params: ReviewSystemParamsDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.getSystemStructures(params.slug, user);
  }

  // PATCH /api/v1/anatomy/review/structures/:id
  // Ordinary teachers may edit; only reviewers may sign off (routes below).
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
  @UseGuards(AnatomyReviewerGuard)
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
  @UseGuards(AnatomyReviewerGuard)
  @HttpCode(HttpStatus.OK)
  reviewSystem(
    @Param() params: ReviewSystemParamsDto,
    @CurrentUser() user: RequestUser,
    @Body() dto: ReviewSystemDto,
  ) {
    return this.service.reviewSystem(user, params.slug, dto);
  }

  // POST /api/v1/anatomy/review/systems/:slug/unpublish
  // Reviewers may withdraw content; publishing requires administrator
  // approval and lives on the admin surface.
  @Throttle(WRITE_THROTTLE)
  @Post('systems/:slug/unpublish')
  @UseGuards(AnatomyReviewerGuard)
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
  @UseGuards(AnatomyReviewerGuard)
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
