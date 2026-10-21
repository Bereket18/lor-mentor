#!/usr/bin/env node
/**
 * F-8 email-delivery probe.
 *
 * Calls the forgot-password endpoint and confirms the API accepted the
 * request. This proves the API is reachable and configured to attempt sending;
 * it CANNOT prove inbox delivery. The operator must still check:
 *   1. the non-owner mailbox that received (or did not receive) the message
 *   2. the Resend dashboard -> Emails log for Delivered / Bounced / Failed
 *
 * Usage:
 *   node scripts/f8-email-check.mjs --email test@example.com
 *   node scripts/f8-email-check.mjs --api https://api.example.com --email test@example.com
 */
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const valueOf = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const api = valueOf('--api', 'http://localhost:4000').replace(/\/$/, '');
const email = valueOf('--email', '');
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('FAIL: pass a valid --email (a non-owner mailbox)');
  process.exit(1);
}

const apiEnvPath = path.resolve('apps/api/.env');
let smtpFrom = '';
if (fs.existsSync(apiEnvPath)) {
  const match = fs
    .readFileSync(apiEnvPath, 'utf8')
    .match(/^\s*SMTP_FROM\s*=\s*(.*)$/m);
  if (match) smtpFrom = match[1].trim();
}
if (smtpFrom) {
  const address = smtpFrom.match(/<([^>]+)>/)?.[1]?.trim() ?? smtpFrom;
  if (/@resend\.dev$/i.test(address)) {
    console.warn(
      'WARN: SMTP_FROM still points at resend.dev. Only the Resend account owner can receive these messages (F-8 is not fixed yet).',
    );
  } else {
    console.log(`SMTP_FROM uses domain: ${address.split('@')[1]}`);
  }
}

try {
  const health = await fetch(`${api}/api/v1/health`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!health.ok) {
    console.error(`FAIL: API health returned ${health.status}`);
    process.exit(1);
  }

  const response = await fetch(`${api}/api/v1/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.text();

  console.log(`POST /api/v1/auth/forgot-password -> ${response.status}`);
  console.log(body);
  if (!response.ok) {
    console.error('FAIL: the API did not accept the reset request');
    process.exit(1);
  }

  console.log(
    '\nAPI accepted the request. Now verify the non-owner mailbox AND the Resend Emails log, then record the result.',
  );
} catch (error) {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
