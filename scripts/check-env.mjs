#!/usr/bin/env node
/**
 * Production env preflight.
 *
 * Detects duplicate keys (silently last-wins in dotenv) and, with --strict,
 * rejects empty values, placeholders, localhost URLs and insecure email
 * senders. It never prints values.
 *
 * Usage:
 *   npm run check:env -- .env.production
 *   npm run check:env -- .env.production --strict
 */
import fs from 'node:fs';

const file = process.argv[2] ?? '.env.production';
const strict = process.argv.includes('--strict');
const errors = [];

if (!fs.existsSync(file)) {
  console.error(`FAIL: ${file} does not exist`);
  process.exit(1);
}

const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
const entries = new Map();
const occurrences = new Map();

lines.forEach((line, index) => {
  const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (!match) return;
  const key = match[1];
  const rawValue = match[2].trim();
  const value =
    (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
    (rawValue.startsWith("'") && rawValue.endsWith("'"))
      ? rawValue.slice(1, -1)
      : rawValue;
  entries.set(key, value);
  if (!occurrences.has(key)) occurrences.set(key, []);
  occurrences.get(key).push(index + 1);
});

for (const [key, lineNumbers] of occurrences) {
  if (lineNumbers.length > 1) {
    errors.push(
      `Duplicate key "${key}" at lines ${lineNumbers.join(', ')} (last one silently wins)`,
    );
  }
}

const required = [
  'NODE_ENV',
  'DATABASE_URL',
  'POSTGRES_USER',
  'POSTGRES_PASSWORD',
  'POSTGRES_DB',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'SMTP_HOST',
  'SMTP_USER',
  'SMTP_PASS',
  'SMTP_FROM',
  'API_PUBLIC_URL',
  'WEB_PUBLIC_URL',
  'CORS_ORIGIN',
  'RECEIPT_VERIFIER_TOKEN',
  'REDIS_HOST',
  'REDIS_PORT',
];
for (const key of required) {
  if (!entries.has(key)) errors.push(`Missing required key "${key}"`);
}

const chapaKeys = ['CHAPA_SECRET_KEY', 'CHAPA_WEBHOOK_SECRET'];
const anyChapa = chapaKeys.some((key) => Boolean(entries.get(key)));
if (anyChapa) {
  for (const key of chapaKeys) {
    if (!entries.get(key)) errors.push(`Missing "${key}" because Chapa is enabled`);
  }
}

const failMode = entries.get('REDIS_FAIL_MODE');
if (failMode && !['closed', 'open'].includes(failMode.toLowerCase())) {
  errors.push('REDIS_FAIL_MODE must be "closed" (default) or "open"');
}

if (strict) {
  const isPlaceholder = (value) =>
    !value ||
    /^change[_-]?me/i.test(value) ||
    /^your[_-]/i.test(value) ||
    /^<.*>$/.test(value);

  for (const key of required) {
    const value = entries.get(key) ?? '';
    if (isPlaceholder(value)) errors.push(`"${key}" is empty or a placeholder`);
  }

  if (/change[_-]?me/i.test(entries.get('DATABASE_URL') ?? '')) {
    errors.push('DATABASE_URL must not contain a placeholder');
  }

  if (entries.get('NODE_ENV') !== 'production') {
    errors.push('NODE_ENV must be "production" for a production deploy');
  }

  const jwtAccess = entries.get('JWT_ACCESS_SECRET') ?? '';
  const jwtRefresh = entries.get('JWT_REFRESH_SECRET') ?? '';
  if (jwtAccess.length < 32) errors.push('JWT_ACCESS_SECRET must be at least 32 characters');
  if (jwtRefresh.length < 32) errors.push('JWT_REFRESH_SECRET must be at least 32 characters');
  if (jwtAccess && jwtAccess === jwtRefresh) {
    errors.push('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ');
  }

  for (const key of ['API_PUBLIC_URL', 'WEB_PUBLIC_URL', 'CORS_ORIGIN']) {
    if (/localhost|127\.0\.0\.1/i.test(entries.get(key) ?? '')) {
      errors.push(`"${key}" must not point at localhost in production`);
    }
  }

  const smtpFrom = entries.get('SMTP_FROM') ?? '';
  const address = smtpFrom.match(/<([^>]+)>/)?.[1]?.trim() ?? smtpFrom.trim();
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address)) {
    errors.push('SMTP_FROM must contain a valid email address');
  }
  if (/@resend\.dev$/i.test(address)) {
    errors.push('SMTP_FROM must use a verified domain, not resend.dev (F-8)');
  }
}

if (errors.length > 0) {
  console.error(`FAIL: ${file}`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(
  `OK: ${file} has ${entries.size} keys, no duplicate keys${strict ? ', no placeholders' : ''}`,
);
