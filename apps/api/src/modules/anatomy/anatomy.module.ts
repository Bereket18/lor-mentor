import { Module } from '@nestjs/common';
import { AnatomyController } from './anatomy.controller';
import { AnatomyService } from './anatomy.service';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [SubscriptionsModule],
  controllers: [AnatomyController],
  providers: [AnatomyService],
  exports: [AnatomyService],
})
export class AnatomyModule {}
