import { Hono } from 'hono';
import { scheduleClassSync } from '../services/class-push.js';

export const syncRoute = new Hono();

// 手動: 全学期の授業を scheduler に再同期
syncRoute.post('/classes', (c) => {
  scheduleClassSync();
  return c.json({ data: { queued: true } });
});
