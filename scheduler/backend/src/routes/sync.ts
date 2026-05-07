import { Hono } from 'hono';
import { runSync } from '../sync/run-sync.js';
import { runPull } from '../sync/run-pull.js';
import { runWindowBatch } from '../sync/window-batch.js';

export const syncRouter = new Hono();

syncRouter.post('/push', async (c) => {
  const result = await runSync();
  return c.json({ data: result });
});

syncRouter.post('/pull', async (c) => {
  const result = await runPull();
  return c.json({ data: result });
});

syncRouter.post('/window', async (c) => {
  const result = await runWindowBatch();
  return c.json({ data: result });
});
