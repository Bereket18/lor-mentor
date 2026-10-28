import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import * as Sentry from '@sentry/node';
import { AppModule } from './app.module';
import { applyTrustProxy } from './config/trust-proxy';

async function bootstrap() {
  // ── Sentry error tracking ─────────────────────
  // Optional: only initializes if SENTRY_DSN is set. Once enabled, unhandled
  // exceptions and logged errors are reported to Sentry for triage.
  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV ?? 'development',
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    });
  }

  // rawBody: true preserves the unparsed request body (req.rawBody) so the
  // Chapa webhook can verify its HMAC-SHA256 signature against exact bytes.
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // ── Trusted reverse proxy ─────────────────────
  // The API sits behind nginx (and optionally Cloudflare). Trust only the
  // configured number of hops so req.ip is the real client address instead of
  // the proxy's loopback address. TRUST_PROXY defaults to 1 in production and
  // 0 elsewhere; env validation rejects anything that is not a hop count.
  applyTrustProxy(app);

  // ── Security headers ──────────────────────────
  // helmet adds HTTP headers that protect against
  // common attacks like XSS and clickjacking
  app.use(helmet());

  // ── Cookie parser ─────────────────────────────
  // Allows us to read cookies from incoming requests
  // We use cookies to store JWT tokens securely
  app.use(cookieParser());

  // ── CORS ──────────────────────────────────────
  // Allows our frontend to talk to our backend. Supports a comma-separated
  // list so staging/prod/preview origins can coexist. In production
  // env.validation.ts guarantees CORS_ORIGIN is set to a real origin.
  const corsOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: corsOrigins,
    credentials: true, // Required for cookies to work cross-origin
  });

  // ── Global validation ─────────────────────────
  // Automatically validates every incoming request body
  // against our DTO classes using class-validator
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip fields not in the DTO
      forbidNonWhitelisted: true, // Reject unexpected fields outright (defense in depth)
      transform: true, // Auto-convert types (e.g. string "1" to number 1)
    }),
  );

  // ── API prefix ────────────────────────────────
  // All routes start with /api/v1
  // Example: /api/v1/auth/login
  app.setGlobalPrefix('api/v1');

  // ── Graceful shutdown ─────────────────────────
  // On SIGTERM/SIGINT (deploys, scale-down) run onModuleDestroy hooks so
  // Prisma disconnects and BullMQ workers drain in-flight AI jobs instead
  // of losing them mid-processing.
  app.enableShutdownHooks();

  const port = process.env.PORT ?? 4000;
  await app.listen(port);

  console.log(`
  ╔══════════════════════════════════════╗
  ║   Lor Mentor API is running          ║
  ║   http://localhost:${port}/api/v1      ║
  ╚══════════════════════════════════════╝
  `);
}

bootstrap().catch((err: unknown) => {
  console.error('Failed to start application:', err);
  process.exit(1);
});
