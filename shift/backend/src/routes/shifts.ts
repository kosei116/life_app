import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { and, eq, gte, lte } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import { shifts, workplaces } from '../db/schema.js';
import { shiftCreateSchema, shiftUpdateSchema, isoDateTime } from '../validators/index.js';
import { computeShiftWage } from '../lib/wage.js';
import { pushShiftToScheduler, deleteShiftFromScheduler } from '../services/scheduler-push.js';

export const shiftsRoute = new Hono();

const queryRangeSchema = z.object({
  from: isoDateTime.optional(),
  to: isoDateTime.optional(),
  workplaceId: z.string().uuid().optional(),
});

shiftsRoute.get('/', zValidator('query', queryRangeSchema), async (c) => {
  const { from, to, workplaceId } = c.req.valid('query');
  const conditions = [
    from ? gte(shifts.startAt, new Date(from)) : undefined,
    to ? lte(shifts.startAt, new Date(to)) : undefined,
    workplaceId ? eq(shifts.workplaceId, workplaceId) : undefined,
  ].filter(Boolean) as any[];
  const rows = await db
    .select()
    .from(shifts)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(shifts.startAt);

  // 賃金を計算して付与
  const wpMap = new Map(
    (await db.select().from(workplaces)).map((w) => [w.id, w])
  );
  const data = rows.map((s) => {
    const wp = wpMap.get(s.workplaceId);
    return wp ? { ...s, calc: computeShiftWage(s, wp) } : s;
  });
  return c.json({ data });
});

shiftsRoute.post('/', zValidator('json', shiftCreateSchema), async (c) => {
  const body = c.req.valid('json');
  const [row] = await db
    .insert(shifts)
    .values({
      workplaceId: body.workplaceId,
      startAt: new Date(body.startAt),
      endAt: new Date(body.endAt),
      rateOverride: body.rateOverride ?? null,
      notes: body.notes ?? null,
    })
    .returning();
  pushShiftToScheduler(row!).catch((e) => console.error('[scheduler-push]', e));
  return c.json({ data: row }, 201);
});

shiftsRoute.patch('/:id', zValidator('json', shiftUpdateSchema), async (c) => {
  const body = c.req.valid('json');
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (body.workplaceId !== undefined) patch.workplaceId = body.workplaceId;
  if (body.startAt !== undefined) patch.startAt = new Date(body.startAt);
  if (body.endAt !== undefined) patch.endAt = new Date(body.endAt);
  if (body.rateOverride !== undefined) patch.rateOverride = body.rateOverride;
  if (body.notes !== undefined) patch.notes = body.notes;
  const rows = await db
    .update(shifts)
    .set(patch)
    .where(eq(shifts.id, c.req.param('id')))
    .returning();
  if (rows.length === 0) return c.json({ error: { code: 'NOT_FOUND', message: 'Shift not found' } }, 404);
  pushShiftToScheduler(rows[0]!).catch((e) => console.error('[scheduler-push]', e));
  return c.json({ data: rows[0] });
});

shiftsRoute.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const deleted = await db.delete(shifts).where(eq(shifts.id, id)).returning();
  if (deleted.length === 0) return c.json({ error: { code: 'NOT_FOUND', message: 'Shift not found' } }, 404);
  deleteShiftFromScheduler(id).catch((e) => console.error('[scheduler-push]', e));
  return c.body(null, 204);
});
