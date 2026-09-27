#!/usr/bin/env node
/**
 * node payout.mjs check                   wallet address, test-Pi balance, key works
 * node payout.mjs send <uid> [<uid>...]   pay each unique uid 0.01 test-Pi
 * node payout.mjs incomplete              list stuck server payments
 * node payout.mjs cancel <paymentId>      cancel one of them
 *
 * Credentials come from .env.testnet next to this file (gitignored) or the
 * environment: PI_TESTNET_API_KEY, PI_TESTNET_WALLET_SEED. They are never
 * printed.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import StellarSdk from 'stellar-sdk';
import { makeA2U, SentButUnconfirmed, RefusedNotTestnet } from './a2u.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const envFile = join(here, '.env.testnet');
const logFile = join(here, 'payouts.log.json');

if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

const log = existsSync(logFile) ? JSON.parse(readFileSync(logFile, 'utf8')) : [];
const paidUids = new Set(log.map((e) => e.uid));
const GOAL = 5;

const a2u = makeA2U({
  apiKey: process.env.PI_TESTNET_API_KEY,
  walletSeed: process.env.PI_TESTNET_WALLET_SEED,
  fetch,
  StellarSdk,
});

const [cmd, ...args] = process.argv.slice(2);

try {
  if (cmd === 'check') {
    const w = await a2u.preflight();
    const stuck = await a2u.incomplete();
    console.log(`app wallet: ${w.address}`);
    console.log(`balance:    ${w.balance} test-Pi (Pi Testnet)`);
    console.log(`API key:    accepted by Pi — ${stuck.length} incomplete server payment(s)`);
    console.log(`progress:   ${paidUids.size}/${GOAL} unique wallets paid`);
  } else if (cmd === 'send') {
    const amountIdx = args.indexOf('--amount');
    const amount = amountIdx > -1 ? Number(args[amountIdx + 1]) : 0.01;
    const uids = [...new Set(args.filter((a, i) => a !== '--amount' && args[i - 1] !== '--amount'))];
    if (!uids.length) throw new Error('give at least one uid');

    await a2u.preflight();
    for (const uid of uids) {
      if (paidUids.has(uid)) {
        console.log(`skip ${uid} — already paid (it counts once toward the ${GOAL})`);
        continue;
      }
      try {
        const r = await a2u.send({ uid, amount });
        log.push({ ...r, at: new Date().toISOString() });
        paidUids.add(uid);
        writeFileSync(logFile, JSON.stringify(log, null, 2));
        console.log(`paid ${uid}: ${r.amount} test-Pi, txid ${r.txid}`);
      } catch (err) {
        if (err instanceof SentButUnconfirmed) {
          // Record it as paid: the test-Pi left the wallet, so resending would pay twice.
          log.push({ uid, txid: err.txid, unconfirmed: true, at: new Date().toISOString() });
          paidUids.add(uid);
          writeFileSync(logFile, JSON.stringify(log, null, 2));
        }
        console.error(`FAILED ${uid}: ${err.message}`);
        if (err instanceof RefusedNotTestnet) process.exit(2);
      }
    }
    console.log(`\nprogress: ${paidUids.size}/${GOAL} unique wallets paid`);
    if (paidUids.size >= GOAL) console.log('Done — the mainnet app wallet form should now unlock.');
  } else if (cmd === 'incomplete') {
    const stuck = await a2u.incomplete();
    if (!stuck.length) console.log('none');
    for (const p of stuck) {
      console.log(`${p.identifier}  uid=${p.user_uid}  ${p.amount}  txid=${p.transaction?.txid ?? '—'}`);
    }
  } else if (cmd === 'cancel') {
    if (!args[0]) throw new Error('give a payment id');
    console.log((await a2u.cancel(args[0])) ? 'cancelled' : 'Pi refused to cancel it');
  } else {
    console.log('usage: node payout.mjs check | send <uid>... [--amount 0.01] | incomplete | cancel <id>');
    process.exit(1);
  }
} catch (err) {
  console.error(err.message);
  process.exit(err instanceof RefusedNotTestnet ? 2 : 1);
}
