import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SubscriptionsService } from './subscriptions.service';

interface AuthUser {
  id: string;
}

@Controller('subscriptions')
@UseGuards(JwtAuthGuard)
export class SubscriptionsController {
  constructor(private readonly service: SubscriptionsService) {}

  @Get('me')
  getMine(@CurrentUser() user: AuthUser) {
    return this.service.getForUser(user.id);
  }
}
