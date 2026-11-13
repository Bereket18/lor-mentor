import { Module } from '@nestjs/common';
import { SupportController } from './support.controller';
import { AdminSupportController } from './admin-support.controller';
import { SupportService } from './support.service';
import { SupportAttachmentsService } from './support-attachments.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { MailModule } from '../mail/mail.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [NotificationsModule, MailModule, AuditModule],
  controllers: [SupportController, AdminSupportController],
  providers: [SupportService, SupportAttachmentsService],
  exports: [SupportService, SupportAttachmentsService],
})
export class SupportModule {}
