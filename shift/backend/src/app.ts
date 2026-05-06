import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { health } from './routes/health.js';
import { workplacesRoute } from './routes/workplaces.js';
import { shiftsRoute } from './routes/shifts.js';
import { incomeRoute } from './routes/income.js';

export function createApp() {
  const app = new Hono();
  app.use('*', logger());
  app.use('/api/*', cors());

  app.route('/health', health);
  app.route('/api/workplaces', workplacesRoute);
  app.route('/api/shifts', shiftsRoute);
  app.route('/api/income', incomeRoute);

  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: err.message } }, 500);
  });
  app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'Route not found' } }, 404));
  return app;
}
