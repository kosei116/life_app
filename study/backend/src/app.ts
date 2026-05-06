import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { health } from './routes/health.js';
import { semestersRoute } from './routes/semesters.js';
import { periodsRoute } from './routes/periods.js';
import { subjectsRoute } from './routes/subjects.js';
import { timetableRoute } from './routes/timetable.js';
import { classDaysRoute } from './routes/class-days.js';
import { tasksRoute } from './routes/tasks.js';
import { syncRoute } from './routes/sync.js';

export function createApp() {
  const app = new Hono();

  app.use('*', logger());
  app.use('/api/*', cors());

  app.route('/health', health);
  app.route('/api/semesters', semestersRoute);
  app.route('/api/periods', periodsRoute);
  app.route('/api/subjects', subjectsRoute);
  app.route('/api/timetable', timetableRoute);
  app.route('/api/class-days', classDaysRoute);
  app.route('/api/tasks', tasksRoute);
  app.route('/api/sync', syncRoute);

  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: err.message } }, 500);
  });

  app.notFound((c) =>
    c.json({ error: { code: 'NOT_FOUND', message: 'Route not found' } }, 404)
  );

  return app;
}
