import { Module } from '@nestjs/common';
import { AnatomyController } from './anatomy.controller';
import { AnatomyService } from './anatomy.service';
import { AiModule } from '../ai/ai.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [SubscriptionsModule, AiModule],
  controllers: [AnatomyController],
  providers: [AnatomyService],
  exports: [AnatomyService],
})
export class AnatomyModule {}
