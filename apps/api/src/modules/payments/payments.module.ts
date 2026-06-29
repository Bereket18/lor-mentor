import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { ChapaService } from './chapa.service';
import { ReceiptService } from './receipt.service';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, ChapaService, ReceiptService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
