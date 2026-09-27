import { test } from 'node:test';
import assert from 'node:assert/strict';
import StellarSdk from 'stellar-sdk';
import { makeA2U, RefusedNotTestnet, SentButUnconfirmed, TESTNET_HORIZON, TESTNET_PASSPHRASE } from './a2u.mjs';

// A real, valid keypair so Keypair.fromSecret works; it holds nothing anywhere.
const SEED = StellarSdk.Keypair.random().secret();
const RECIPIENT = StellarSdk.Keypair.random().publicKey();

function res(status, body) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
}

/** Fake Stellar SDK: real TransactionBuilder, fake network I/O. */
function fakeStellar({ accountExists = true } = {}) {
  const calls = { submitted: [], servers: [] };
  class Server {
    constructor(url) { calls.servers.push(url); }
    async loadAccount(address) {
      if (!accountExists) {
        const e = new Error('Not Found'); e.response = { status: 404 }; throw e;
      }
      return new StellarSdk.Account(address, '100');
    }
    async fetchBaseFee() { return 100000; }
    async submitTransaction(tx) { calls.submitted.push(tx); return { hash: 'TXHASH123' }; }
  }
  return { sdk: { ...StellarSdk, Server }, calls };
}

function fakeFetch({ network = TESTNET_PASSPHRASE, completeOk = true } = {}) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url, method: init.method ?? 'GET', body: init.body });
    if (url.endsWith('/payments') && init.method === 'POST') {
      return res(200, { identifier: 'pay_1', recipient: RECIPIENT, amount: 0.01, network });
    }
    if (url.endsWith('/cancel')) return res(200, {});
    if (url.endsWith('/complete')) return completeOk ? res(200, {}) : res(500, { error: 'boom' });
    return res(404, {});
  };
  fn.calls = calls;
  return fn;
}

test('sends on testnet: create -> sign for Testnet -> submit -> complete', async () => {
  const { sdk, calls } = fakeStellar();
  const fetch = fakeFetch();
  const a2u = makeA2U({ apiKey: 'k', walletSeed: SEED, fetch, StellarSdk: sdk });

  const r = await a2u.send({ uid: 'u1' });

  assert.equal(r.txid, 'TXHASH123');
  assert.equal(calls.submitted.length, 1);
  assert.equal(calls.submitted[0].networkPassphrase, TESTNET_PASSPHRASE);
  assert.ok(calls.servers.every((u) => u === TESTNET_HORIZON));
  assert.ok(fetch.calls.some((c) => c.url.endsWith('/pay_1/complete')));
});

test('GUARD: a payment Pi creates on mainnet is cancelled and NOTHING is signed', async () => {
  const { sdk, calls } = fakeStellar();
  const fetch = fakeFetch({ network: 'Pi Network' });
  const a2u = makeA2U({ apiKey: 'mainnet-key-by-mistake', walletSeed: SEED, fetch, StellarSdk: sdk });

  await assert.rejects(a2u.send({ uid: 'u1' }), RefusedNotTestnet);

  // This is the whole point of the tool's safety: no real Pi moves.
  assert.equal(calls.submitted.length, 0);
  assert.ok(fetch.calls.some((c) => c.url.endsWith('/pay_1/cancel')));
  assert.ok(!fetch.calls.some((c) => c.url.endsWith('/complete')));
});

test('GUARD: a wallet that does not exist on Pi Testnet is refused by preflight', async () => {
  const { sdk } = fakeStellar({ accountExists: false });
  const a2u = makeA2U({ apiKey: 'k', walletSeed: SEED, fetch: fakeFetch(), StellarSdk: sdk });

  await assert.rejects(a2u.preflight(), RefusedNotTestnet);
});

test('GUARD: the amount is capped', async () => {
  const { sdk } = fakeStellar();
  const fetch = fakeFetch();
  const a2u = makeA2U({ apiKey: 'k', walletSeed: SEED, fetch, StellarSdk: sdk });

  await assert.rejects(a2u.send({ uid: 'u1', amount: 50 }), /amount/);
  assert.equal(fetch.calls.length, 0);
});

test('a failed /complete after submit is SentButUnconfirmed with the txid, never a plain failure', async () => {
  const { sdk, calls } = fakeStellar();
  const a2u = makeA2U({ apiKey: 'k', walletSeed: SEED, fetch: fakeFetch({ completeOk: false }), StellarSdk: sdk });

  await assert.rejects(a2u.send({ uid: 'u1' }), (err) => {
    assert.ok(err instanceof SentButUnconfirmed);
    assert.equal(err.txid, 'TXHASH123');
    return true;
  });
  assert.equal(calls.submitted.length, 1);
});

test('refuses to start without credentials', () => {
  const { sdk } = fakeStellar();
  assert.throws(() => makeA2U({ apiKey: '', walletSeed: SEED, fetch: fakeFetch(), StellarSdk: sdk }), /API_KEY/);
  assert.throws(() => makeA2U({ apiKey: 'k', walletSeed: '', fetch: fakeFetch(), StellarSdk: sdk }), /WALLET_SEED/);
});
