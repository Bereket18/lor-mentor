import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AnatomyService } from './anatomy.service';
import { AnatomyStructureParamsDto } from './dto/anatomy-structure-params.dto';
import { ExplainStructureDto } from './dto/explain-structure.dto';
import { GetSystemParamsDto } from './dto/get-system-params.dto';

import type { RequestUser } from '../../common/types/request-user';

// Every anatomy route requires a logged-in user. The subscription check is
// intentionally done inside the service on the detail route so sample systems
// can stay open to unsubscribed students without weakening normal systems.
@Controller('anatomy')
@UseGuards(JwtAuthGuard)
export class AnatomyController {
  constructor(private readonly service: AnatomyService) {}

  // GET /api/v1/anatomy/systems
  @Get('systems')
  listSystems() {
    return this.service.listSystems();
  }

  // GET /api/v1/anatomy/systems/:slug
  @Get('systems/:slug')
  getSystem(
    @Param() params: GetSystemParamsDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.getSystem(user, params.slug);
  }

  // POST /api/v1/anatomy/systems/:slug/structures/:structureSlug/explain
  @Post('systems/:slug/structures/:structureSlug/explain')
  explainStructure(
    @Param() params: AnatomyStructureParamsDto,
    @CurrentUser() user: RequestUser,
    @Body() dto: ExplainStructureDto,
  ) {
    return this.service.explainStructure(
      user,
      params.slug,
      params.structureSlug,
      dto,
    );
  }

  // POST /api/v1/anatomy/systems/:slug/structures/:structureSlug/quiz
  @Post('systems/:slug/structures/:structureSlug/quiz')
  generateQuiz(
    @Param() params: AnatomyStructureParamsDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.generateStructureQuiz(
      user,
      params.slug,
      params.structureSlug,
    );
  }
}
