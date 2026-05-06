import { Hono } from 'hono';
import { runPushOnce } from '../sync/push-worker.js';
import { runPullOnce } from '../sync/pull-worker.js';
import { runWindowBatch } from '../sync/window-batch.js';

export const syncRouter = new Hono();

syncRouter.post('/push', async (c) => {
  const result = await runPushOnce();
  return c.json({ data: result });
});

syncRouter.post('/pull', async (c) => {
  const result = await runPullOnce();
  return c.json({ data: result });
});

syncRouter.post('/window', async (c) => {
  const result = await runWindowBatch();
  return c.json({ data: result });
});
