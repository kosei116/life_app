import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import { timetableSlots } from '../db/schema.js';
import {
  timetableSlotUpsertSchema,
  timetableSlotDeleteQuerySchema,
  uuidSchema,
} from '../validators/index.js';
import { scheduleClassSync } from '../services/class-push.js';

export const timetableRoute = new Hono();

timetableRoute.get(
  '/',
  zValidator('query', z.object({ semesterId: uuidSchema })),
  async (c) => {
    const { semesterId } = c.req.valid('query');
    const rows = await db
      .select()
      .from(timetableSlots)
      .where(eq(timetableSlots.semesterId, semesterId));
    return c.json({ data: rows });
  }
);

// 1セルを upsert（既存セルがあれば subject 差し替え）
timetableRoute.put(
  '/',
  zValidator('json', timetableSlotUpsertSchema),
  async (c) => {
    const body = c.req.valid('json');
    const result = await db.transaction(async (tx) => {
      await tx
        .delete(timetableSlots)
        .where(
          and(
            eq(timetableSlots.semesterId, body.semesterId),
            eq(timetableSlots.dayOfWeek, body.dayOfWeek),
            eq(timetableSlots.periodId, body.periodId)
          )
        );
      const [row] = await tx.insert(timetableSlots).values(body).returning();
      return row!;
    });
    scheduleClassSync(body.semesterId);
    return c.json({ data: result });
  }
);

timetableRoute.delete(
  '/',
  zValidator('query', timetableSlotDeleteQuerySchema),
  async (c) => {
    const { semesterId, dayOfWeek, periodId } = c.req.valid('query');
    const deleted = await db
      .delete(timetableSlots)
      .where(
        and(
          eq(timetableSlots.semesterId, semesterId),
          eq(timetableSlots.dayOfWeek, dayOfWeek),
          eq(timetableSlots.periodId, periodId)
        )
      )
      .returning();
    if (deleted.length === 0) return c.json({ error: { code: 'NOT_FOUND', message: 'Slot not found' } }, 404);
    scheduleClassSync(semesterId);
    return c.body(null, 204);
  }
);
