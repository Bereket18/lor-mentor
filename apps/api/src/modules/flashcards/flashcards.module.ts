import { Module } from '@nestjs/common';
import { FlashcardsController } from './flashcards.controller';
import { FlashcardsService } from './flashcards.service';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';

@Module({
  imports: [SubscriptionsModule],
  controllers: [FlashcardsController],
  providers: [FlashcardsService, SubscriptionGuard],
})
export class FlashcardsModule {}
