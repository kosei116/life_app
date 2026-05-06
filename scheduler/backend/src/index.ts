import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { startScheduler } from './sync/scheduler.js';

const port = Number(process.env.PORT ?? 3000);
const app = createApp();

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`scheduler-api listening on http://localhost:${info.port}`);
  if (process.env.SYNC_ENABLED === 'true') {
    startScheduler();
  } else {
    console.log('[sync] disabled (set SYNC_ENABLED=true to enable)');
  }
});
