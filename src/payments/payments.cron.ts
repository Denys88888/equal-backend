import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PaymentsService } from './payments.service';

@Injectable()
export class PaymentsCron {
  constructor(private readonly payments: PaymentsService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async reconcile() {
    // PI_API_KEY missing throws from the getter; the next run tries again.
    await this.payments.reconcileStale().catch((err) => console.error('[payments] reconcile run failed', err));
  }
}
