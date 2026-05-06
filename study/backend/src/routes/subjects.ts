import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import { subjects } from '../db/schema.js';
import {
  subjectCreateSchema,
  subjectUpdateSchema,
  lecturesAttendedDeltaSchema,
  uuidSchema,
} from '../validators/index.js';
import { scheduleClassSync } from '../services/class-push.js';

export const subjectsRoute = new Hono();

subjectsRoute.get(
  '/',
  zValidator('query', z.object({ semesterId: uuidSchema })),
  async (c) => {
    const { semesterId } = c.req.valid('query');
    const rows = await db
      .select()
      .from(subjects)
      .where(eq(subjects.semesterId, semesterId))
      .orderBy(subjects.name);
    return c.json({ data: rows });
  }
);

subjectsRoute.get('/:id', async (c) => {
  const rows = await db.select().from(subjects).where(eq(subjects.id, c.req.param('id'))).limit(1);
  if (rows.length === 0) return c.json({ error: { code: 'NOT_FOUND', message: 'Subject not found' } }, 404);
  return c.json({ data: rows[0] });
});

subjectsRoute.post('/', zValidator('json', subjectCreateSchema), async (c) => {
  const [row] = await db.insert(subjects).values(c.req.valid('json')).returning();
  return c.json({ data: row }, 201);
});

subjectsRoute.patch('/:id', zValidator('json', subjectUpdateSchema), async (c) => {
  const body = c.req.valid('json');
  const rows = await db
    .update(subjects)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(subjects.id, c.req.param('id')))
    .returning();
  if (rows.length === 0) return c.json({ error: { code: 'NOT_FOUND', message: 'Subject not found' } }, 404);
  // 名前/色が変わった場合は授業イベントの表示も更新が必要
  if (body.name !== undefined || body.color !== undefined) {
    scheduleClassSync(rows[0]!.semesterId);
  }
  return c.json({ data: rows[0] });
});

// 「理解した」ボタン用: lectures_attended に delta 加算
subjectsRoute.post(
  '/:id/lectures-attended',
  zValidator('json', lecturesAttendedDeltaSchema),
  async (c) => {
    const id = c.req.param('id');
    const { delta } = c.req.valid('json');
    const rows = await db
      .update(subjects)
      .set({
        lecturesAttended: sql`GREATEST(0, ${subjects.lecturesAttended} + ${delta})`,
        updatedAt: new Date(),
      })
      .where(eq(subjects.id, id))
      .returning();
    if (rows.length === 0) return c.json({ error: { code: 'NOT_FOUND', message: 'Subject not found' } }, 404);
    return c.json({ data: rows[0] });
  }
);

subjectsRoute.delete('/:id', async (c) => {
  // 削除前に semesterId を取得しておく
  const before = await db.select({ semesterId: subjects.semesterId })
    .from(subjects).where(eq(subjects.id, c.req.param('id'))).limit(1);

  const deleted = await db.delete(subjects).where(eq(subjects.id, c.req.param('id'))).returning();
  if (deleted.length === 0) return c.json({ error: { code: 'NOT_FOUND', message: 'Subject not found' } }, 404);
  if (before[0]) scheduleClassSync(before[0].semesterId);
  return c.body(null, 204);
});
