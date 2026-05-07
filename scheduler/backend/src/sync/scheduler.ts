import cron from 'node-cron';
import { runSync } from './run-sync.js';
import { runPull } from './run-pull.js';
import { runWindowBatch } from './window-batch.js';

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
  cron.schedule('*/5 * * * *', () => void safeRun('push', runSync));
  // every 30 min
  cron.schedule('*/30 * * * *', () => void safeRun('pull', runPull));
  // daily at 04:00 JST = 19:00 UTC
  cron.schedule('0 19 * * *', () => void safeRun('window', runWindowBatch));

  console.log('[sync] scheduler started: push 5min / pull 30min / window daily');
}
