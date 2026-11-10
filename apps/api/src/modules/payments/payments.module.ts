import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { ChapaService } from './chapa.service';
import { ChekiService } from './cheki.service';
import { ReceiptService } from './receipt.service';
import { ReceiptVerifierService } from './receipt-verifier.service';
import { PaymentStateMachine } from './payment-state-machine';

@Module({
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    ChapaService,
    ChekiService,
    ReceiptService,
    ReceiptVerifierService,
    PaymentStateMachine,
  ],
  exports: [PaymentsService, PaymentStateMachine],
})
export class PaymentsModule {}
