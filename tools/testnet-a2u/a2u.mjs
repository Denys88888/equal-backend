/**
 * App-to-User payments from the Equal TESTNET app.
 *
 * Why this exists: Pi will not issue Equal a mainnet app wallet — and without
 * one, mainnet payments cannot work — until the paired Testnet app has made
 * App-to-User transfers to 5 unique wallets. This sends those transfers.
 *
 * Ported from stayfind-api's sendA2UPayment, which Pi has accepted on testnet.
 *
 * The overriding rule: this must never move real Pi. The network a payment
 * lands on follows the API key's app registration, not anything in this code,
 * so a mainnet key pasted by mistake would create a MAINNET payment. Three
 * independent guards stand between that and a real transfer:
 *   1. the app wallet must exist on the Pi Testnet ledger before anything runs;
 *   2. the payment Pi creates must report network "Pi Testnet", or it is
 *      cancelled before anything is signed;
 *   3. the transaction is always built for the Testnet passphrase and
 *      submitted to Testnet Horizon, so even a signed mistake is invalid on
 *      mainnet.
 */

export const PI_API = 'https://api.minepi.com/v2';
export const TESTNET_HORIZON = 'https://api.testnet.minepi.com';
export const TESTNET_PASSPHRASE = 'Pi Testnet';
export const MAX_AMOUNT = 1;

/** The transfer is on-chain but Pi was not told. Never retry — it would pay twice. */
export class SentButUnconfirmed extends Error {
  constructor(txid, detail) {
    super(`sent on-chain (txid ${txid}) but Pi's /complete failed: ${detail}`);
    this.name = 'SentButUnconfirmed';
    this.txid = txid;
  }
}

export class RefusedNotTestnet extends Error {
  constructor(detail) {
    super(`REFUSED — not the Testnet app: ${detail}. Nothing was sent.`);
    this.name = 'RefusedNotTestnet';
  }
}

/**
 * @param deps  { fetch, StellarSdk } — injected so the guards can be tested
 *              without touching the network.
 */
export function makeA2U({ apiKey, walletSeed, fetch, StellarSdk }) {
  if (!apiKey) throw new Error('PI_TESTNET_API_KEY is not set');
  if (!walletSeed) throw new Error('PI_TESTNET_WALLET_SEED is not set');

  const auth = { Authorization: `Key ${apiKey}`, 'Content-Type': 'application/json' };
  const server = new StellarSdk.Server(TESTNET_HORIZON);
  const keypair = StellarSdk.Keypair.fromSecret(walletSeed);

  async function piJson(res) {
    const text = await res.text();
    try { return JSON.parse(text); } catch { return { raw: text }; }
  }

  /** Guard 1: the wallet must be a Pi Testnet account. */
  async function preflight() {
    let account;
    try {
      account = await server.loadAccount(keypair.publicKey());
    } catch (err) {
      throw new RefusedNotTestnet(
        `app wallet ${keypair.publicKey()} does not exist on Pi Testnet (${err?.response?.status ?? err.message})`,
      );
    }
    const native = account.balances.find((b) => b.asset_type === 'native');
    return { address: keypair.publicKey(), balance: native ? Number(native.balance) : 0 };
  }

  async function cancel(identifier) {
    const res = await fetch(`${PI_API}/payments/${identifier}/cancel`, { method: 'POST', headers: auth });
    return res.ok;
  }

  async function send({ uid, amount = 0.01, memo = 'Equal testnet payout' }) {
    if (!uid) throw new Error('uid is required');
    if (!(amount > 0) || amount > MAX_AMOUNT) {
      throw new Error(`amount must be > 0 and <= ${MAX_AMOUNT} test-Pi`);
    }

    // 1) Pi creates the A2U payment record and tells us the recipient.
    const createRes = await fetch(`${PI_API}/payments`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ payment: { amount, memo, metadata: { purpose: 'testnet-a2u' }, uid } }),
    });
    const payment = await piJson(createRes);
    if (!createRes.ok) throw new Error(`Pi refused to create the payment: ${JSON.stringify(payment)}`);

    // 2) Guard 2: the payment must be on testnet. Cancel it otherwise, so a
    //    mistaken mainnet payment does not sit there blocking the user.
    if (payment.network !== TESTNET_PASSPHRASE) {
      const cancelled = await cancel(payment.identifier).catch(() => false);
      throw new RefusedNotTestnet(
        `Pi created it on "${payment.network}" — this API key belongs to a non-Testnet app ` +
          `(payment ${payment.identifier} ${cancelled ? 'cancelled' : 'could NOT be cancelled — cancel it by hand'})`,
      );
    }

    // 3) Guard 3: always Testnet Horizon + Testnet passphrase, never taken
    //    from the payment.
    const account = await server.loadAccount(keypair.publicKey());
    const fee = await server.fetchBaseFee().catch(() => 100000);
    const tx = new StellarSdk.TransactionBuilder(account, { fee: String(fee), networkPassphrase: TESTNET_PASSPHRASE })
      .addOperation(
        StellarSdk.Operation.payment({
          destination: payment.recipient,
          asset: StellarSdk.Asset.native(),
          amount: String(payment.amount),
        }),
      )
      .addMemo(StellarSdk.Memo.text(payment.identifier))
      .setTimeout(180)
      .build();
    tx.sign(keypair);

    const submitted = await server.submitTransaction(tx);
    const txid = submitted.hash;

    // 4) Tell Pi. The test-Pi has already moved by now.
    const completeRes = await fetch(`${PI_API}/payments/${payment.identifier}/complete`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ txid }),
    });
    if (!completeRes.ok) throw new SentButUnconfirmed(txid, JSON.stringify(await piJson(completeRes)));

    return { uid, identifier: payment.identifier, txid, amount: payment.amount };
  }

  async function incomplete() {
    const res = await fetch(`${PI_API}/payments/incomplete_server_payments`, { headers: auth });
    const body = await piJson(res);
    if (!res.ok) throw new Error(`could not list incomplete payments: ${JSON.stringify(body)}`);
    return body.incomplete_server_payments ?? [];
  }

  return { preflight, send, cancel, incomplete };
}
