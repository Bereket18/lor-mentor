import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  // ── Health check endpoint ─────────────────────
  // GET /api/v1/health
  // Returns { status: 'ok' } if the server is running
  // Used by monitoring tools to check if the app is alive
  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      app: 'Lor Mentor API',
      timestamp: new Date().toISOString(),
    };
  }
}
