import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AnatomyService } from './anatomy.service';
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
}
