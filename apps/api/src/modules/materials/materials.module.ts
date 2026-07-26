import { Module } from '@nestjs/common';
import { MaterialsController } from './materials.controller';
import { MaterialsService } from './materials.service';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { AiModule } from '../ai/ai.module';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';

@Module({
  imports: [SubscriptionsModule, AiModule],
  controllers: [MaterialsController],
  providers: [MaterialsService, SubscriptionGuard],
  exports: [MaterialsService],
})
export class MaterialsModule {}
