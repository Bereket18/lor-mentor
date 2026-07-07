import { Module } from '@nestjs/common';
import { TutorController } from './tutor.controller';
import { TutorService } from './tutor.service';
import { AiModule } from '../ai/ai.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [AiModule, SubscriptionsModule],
  controllers: [TutorController],
  providers: [TutorService],
})
export class TutorModule {}
