# Core Flow Setup

This checklist covers the flows stabilized in the core-flow release: password
reset, PDF AI generation, and Chapa sandbox payments.

## Password Reset

Set these in the API environment:

- `WEB_PUBLIC_URL` — frontend URL used in reset links, for example `http://localhost:3000`.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.

`POST /api/v1/auth/forgot-password` always returns a generic success message.
For existing users, the API emails `/reset-password?token=...`.

## PDF AI Generation

PDF generation requires:

- `GEMINI_API_KEY`
- `REDIS_HOST`
- `REDIS_PORT`
- a running Redis server

Teacher/admin PDF uploads now create `uploads/materials` automatically, validate
that the uploaded file is a real PDF, create an AI status row immediately, and
queue the BullMQ job. Admin course materials show AI status and failed-job
messages through the existing material AI status endpoint.

## Chapa Sandbox

Set these in the API environment:

- `CHAPA_BASE_URL=https://api.chapa.co/v1`
- `CHAPA_SECRET_KEY`
- `CHAPA_WEBHOOK_SECRET`
- `API_PUBLIC_URL` — public tunnel/API URL for Chapa webhook delivery.
- `WEB_PUBLIC_URL` — frontend URL for browser return after checkout.

Register the webhook URL in Chapa as:

```text
<API_PUBLIC_URL>/api/v1/payments/chapa/webhook
```

The browser callback verifies with:

```text
GET /api/v1/payments/chapa/verify/:txRef
```

Approval remains idempotent and uses the shared payment finalization path, which
activates the subscription, writes notifications/audit logs, and generates the
PDF receipt.
