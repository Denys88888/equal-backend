/**
 * What happened on the last approve / complete — exposed on /v1/health.
 *
 * A failed server approval reaches the user only as Pi's "the developer failed
 * to approve the payment": the frontend swallows the error by design (the SDK
 * retries), and our console.error lines live in Render logs nobody can read
 * from here. This keeps the one fact that matters — what Pi actually answered —
 * readable with a curl after a single test payment.
 *
 * /v1/health is public, so this stores no user data: never a successful Pi
 * response (those carry uids and wallet addresses), never a full payment id.
 */
export type PaymentStage = 'approve' | 'complete';

export type PaymentEvent = {
  at: string;
  outcome: 'ok' | 'pi_error' | 'pi_unreachable' | 'forbidden';
  /** Last 6 characters of the Pi payment id — enough to match a test attempt. */
  paymentRef: string;
  piStatus?: number;
  /** Pi's ERROR body only, truncated. */
  piError?: string;
  /** On a Pi error: can this API key see the payment at all? false = key belongs to another app. */
  paymentVisibleToKey?: boolean | null;
  /** On success: was our DB row found and linked? */
  linked?: boolean;
};

const last: Record<PaymentStage, PaymentEvent | null> = { approve: null, complete: null };

export function recordPayment(stage: PaymentStage, event: Omit<PaymentEvent, 'at' | 'paymentRef'> & { paymentId: string }) {
  const { paymentId, piError, ...rest } = event;
  last[stage] = {
    at: new Date().toISOString(),
    paymentRef: paymentId.slice(-6),
    ...rest,
    ...(piError !== undefined ? { piError: piError.slice(0, 200) } : {}),
  };
}

export function paymentDiagnostics(): Record<PaymentStage, PaymentEvent | null> {
  return { approve: last.approve, complete: last.complete };
}

/** For tests only. */
export function resetPaymentDiagnostics() {
  last.approve = null;
  last.complete = null;
}
