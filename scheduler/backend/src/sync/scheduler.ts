import cron from 'node-cron';
import { runPushOnce } from './push-worker.js';
import { runPullOnce } from './pull-worker.js';
import { runWindowBatch } from './window-batch.js';
import { reconcilePush } from './reconcile.js';

async function reconcileAndPush() {
  const reconciled = await reconcilePush();
  const r = await runPushOnce();
  return { reconciled, ...r };
}

let running = {
  push: false,
  pull: false,
  window: false,
};

async function safeRun(name: keyof typeof running, fn: () => Promise<unknown>) {
  if (running[name]) {
    console.log(`[sync:${name}] already running, skipping tick`);
    return;
  }
  running[name] = true;
  const startedAt = Date.now();
  try {
    const res = await fn();
    console.log(`[sync:${name}] ok ${Date.now() - startedAt}ms`, res);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[sync:${name}] failed: ${msg}`);
  } finally {
    running[name] = false;
  }
}

export function startScheduler() {
  if (!process.env.GAS_WEBAPP_URL) {
    console.warn('[sync] GAS_WEBAPP_URL not set; scheduler disabled');
    return;
  }

  // every 5 min
  cron.schedule('*/5 * * * *', () => void safeRun('push', reconcileAndPush));
  // every 30 min
  cron.schedule('*/30 * * * *', () => void safeRun('pull', runPullOnce));
  // daily at 04:00 JST = 19:00 UTC
  cron.schedule('0 19 * * *', () => void safeRun('window', runWindowBatch));

  console.log('[sync] scheduler started: push 5min / pull 30min / window daily');
}
