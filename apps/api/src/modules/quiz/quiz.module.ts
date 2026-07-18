import { Module } from '@nestjs/common';
import { QuizController } from './quiz.controller';
import { QuizService } from './quiz.service';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';

@Module({
  imports: [SubscriptionsModule],
  controllers: [QuizController],
  providers: [QuizService, SubscriptionGuard],
})
export class QuizModule {}
