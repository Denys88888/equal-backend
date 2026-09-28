import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentsCron } from './payments.cron';

// PrismaService comes from the global PrismaModule; listing it here as well
// used to open a second connection pool just for payments.
@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentsCron],
})
export class PaymentsModule {}
