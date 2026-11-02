import { Module } from '@nestjs/common';
import { AnatomyAdminController } from './anatomy-admin.controller';
import { AnatomyController } from './anatomy.controller';
import { AnatomyReviewController } from './anatomy-review.controller';
import { AnatomyService } from './anatomy.service';
import { AnatomyReviewService } from './anatomy-review.service';
import { AnatomyReviewerGuard } from './anatomy-reviewer.guard';
import { AiModule } from '../ai/ai.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [SubscriptionsModule, AiModule, AuditModule, NotificationsModule],
  controllers: [
    AnatomyController,
    AnatomyAdminController,
    AnatomyReviewController,
  ],
  providers: [AnatomyService, AnatomyReviewService, AnatomyReviewerGuard],
  exports: [AnatomyService],
})
export class AnatomyModule {}
