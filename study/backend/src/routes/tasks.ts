import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import { tasks } from '../db/schema.js';
import { taskCreateSchema, taskUpdateSchema, uuidSchema } from '../validators/index.js';
import { pushTaskToScheduler, deleteTaskFromScheduler } from '../services/scheduler-push.js';

export const tasksRoute = new Hono();

tasksRoute.get(
  '/',
  zValidator(
    'query',
    z.object({
      semesterId: uuidSchema.optional(),
      subjectId: uuidSchema.optional(),
      completed: z
        .enum(['true', 'false'])
        .optional()
        .transform((v) => (v === undefined ? undefined : v === 'true')),
    })
  ),
  async (c) => {
    const q = c.req.valid('query');
    const conditions = [
      q.semesterId ? eq(tasks.semesterId, q.semesterId) : undefined,
      q.subjectId ? eq(tasks.subjectId, q.subjectId) : undefined,
      q.completed !== undefined ? eq(tasks.completed, q.completed) : undefined,
    ].filter(Boolean) as any[];
    const rows = await db
      .select()
      .from(tasks)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(tasks.dueDate);
    return c.json({ data: rows });
  }
);

tasksRoute.post('/', zValidator('json', taskCreateSchema), async (c) => {
  const [row] = await db.insert(tasks).values(c.req.valid('json')).returning();
  // scheduler push（best effort・失敗してもタスク作成は成功扱い）
  pushTaskToScheduler(row!).catch((err) => console.error('[scheduler-push]', err));
  return c.json({ data: row }, 201);
});

tasksRoute.patch('/:id', zValidator('json', taskUpdateSchema), async (c) => {
  const id = c.req.param('id');
  const body = c.req.valid('json');
  const patch: Record<string, unknown> = { ...body, updatedAt: new Date() };
  if (body.completed === true) patch.completedAt = new Date();
  if (body.completed === false) patch.completedAt = null;

  const rows = await db.update(tasks).set(patch).where(eq(tasks.id, id)).returning();
  if (rows.length === 0) return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
  pushTaskToScheduler(rows[0]!).catch((err) => console.error('[scheduler-push]', err));
  return c.json({ data: rows[0] });
});

tasksRoute.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const deleted = await db.delete(tasks).where(eq(tasks.id, id)).returning();
  if (deleted.length === 0) return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
  deleteTaskFromScheduler(id).catch((err) => console.error('[scheduler-push]', err));
  return c.body(null, 204);
});
