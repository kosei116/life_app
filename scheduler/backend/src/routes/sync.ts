import { Hono } from 'hono';
import { runPushOnce } from '../sync/push-worker.js';
import { runPullOnce } from '../sync/pull-worker.js';
import { runWindowBatch } from '../sync/window-batch.js';
import { reconcilePush } from '../sync/reconcile.js';

export const syncRouter = new Hono();

syncRouter.post('/push', async (c) => {
  // 押下毎に「あるべき状態と差分」を queue に積み直してから push を回す。
  // これでカレンダーに表示されてる予定が漏れなく Google Calendar に反映される。
  const reconciled = await reconcilePush();
  // queue が膨らんだ場合に備えて複数回 push を回す（最大 10 バッチ = 500 件）。
  let totalAttempted = 0, totalSucceeded = 0, totalFailed = 0, totalSkipped = 0;
  for (let i = 0; i < 10; i++) {
    const r = await runPushOnce();
    totalAttempted += r.attempted;
    totalSucceeded += r.succeeded;
    totalFailed += r.failed;
    totalSkipped += r.skipped;
    if (r.attempted === 0) break;
  }
  return c.json({
    data: {
      reconciled,
      attempted: totalAttempted,
      succeeded: totalSucceeded,
      failed: totalFailed,
      skipped: totalSkipped,
    },
  });
});

syncRouter.post('/pull', async (c) => {
  const result = await runPullOnce();
  return c.json({ data: result });
});

syncRouter.post('/window', async (c) => {
  const result = await runWindowBatch();
  return c.json({ data: result });
});
