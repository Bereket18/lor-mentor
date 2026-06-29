import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  // rawBody: true preserves the unparsed request body (req.rawBody) so the
  // Chapa webhook can verify its HMAC-SHA256 signature against exact bytes.
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // ── Security headers ──────────────────────────
  // helmet adds HTTP headers that protect against
  // common attacks like XSS and clickjacking
  app.use(helmet());

  // ── Cookie parser ─────────────────────────────
  // Allows us to read cookies from incoming requests
  // We use cookies to store JWT tokens securely
  app.use(cookieParser());

  // ── CORS ──────────────────────────────────────
  // Allows our frontend (localhost:3000) to talk
  // to our backend (localhost:4000)
  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
    credentials: true, // Required for cookies to work cross-origin
  });

  // ── Global validation ─────────────────────────
  // Automatically validates every incoming request body
  // against our DTO classes using class-validator
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip fields not in the DTO
      forbidNonWhitelisted: false,
      transform: true, // Auto-convert types (e.g. string "1" to number 1)
    }),
  );

  // ── API prefix ────────────────────────────────
  // All routes start with /api/v1
  // Example: /api/v1/auth/login
  app.setGlobalPrefix('api/v1');

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
