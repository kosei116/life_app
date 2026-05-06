import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { health } from './routes/health.js';
import { sourcesRoute } from './routes/sources.js';
import { eventsRoute } from './routes/events.js';
import { syncRouter } from './routes/sync.js';

export function createApp() {
  const app = new Hono();

  app.use('*', logger());
  app.use('/api/*', cors());

  app.route('/health', health);
  app.route('/api/sources', sourcesRoute);
  app.route('/api/events', eventsRoute);
  app.route('/api/sync', syncRouter);

  app.onError((err, c) => {
    console.error(err);
    return c.json(
      { error: { code: 'INTERNAL_ERROR', message: err.message } },
      500
    );
  });

  app.notFound((c) =>
    c.json({ error: { code: 'NOT_FOUND', message: 'Route not found' } }, 404)
  );

  return app;
}
