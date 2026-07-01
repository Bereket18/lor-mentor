import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { ChapaService } from './chapa.service';
import { ReceiptService } from './receipt.service';
import { ReceiptVerifierService } from './receipt-verifier.service';

@Module({
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    ChapaService,
    ReceiptService,
    ReceiptVerifierService,
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
