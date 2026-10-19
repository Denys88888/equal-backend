/**
 * The last gift send, on /v1/health — like payments_last for payments.
 *
 * A refused paid gift reaches the user as a toast; why it was refused (no
 * payment id, payment not completed, amount below the price, Pi unreachable)
 * would otherwise only be in Render's logs. No user data: the gift kind, the
 * outcome, the server's reason and the last 6 characters of the payment id.
 */
export type GiftEvent = {
  at: string;
  kind: string;
  outcome: 'ok' | 'rejected';
  reason?: string;
  paymentRef?: string;
};

let last: GiftEvent | null = null;

export function recordGift(kind: unknown, outcome: GiftEvent['outcome'], reason?: string, paymentId?: string) {
  last = {
    at: new Date().toISOString(),
    kind: typeof kind === 'string' ? kind.slice(0, 20) : String(kind),
    outcome,
    ...(reason ? { reason: reason.slice(0, 160) } : {}),
    ...(paymentId ? { paymentRef: paymentId.slice(-6) } : {}),
  };
}

export function giftDiagnostics(): GiftEvent | null {
  return last;
}
