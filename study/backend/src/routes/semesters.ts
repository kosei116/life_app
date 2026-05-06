import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { semesters, periods, classDays } from '../db/schema.js';
import { semesterCreateSchema, semesterUpdateSchema } from '../validators/index.js';
import { scheduleClassSync } from '../services/class-push.js';

export const semestersRoute = new Hono();

const DEFAULT_PERIODS = [
  { periodNumber: 1, startTime: '08:50', endTime: '10:30' },
  { periodNumber: 2, startTime: '10:40', endTime: '12:20' },
  { periodNumber: 3, startTime: '13:10', endTime: '14:50' },
  { periodNumber: 4, startTime: '15:05', endTime: '16:45' },
  { periodNumber: 5, startTime: '17:00', endTime: '18:40' },
];

semestersRoute.get('/', async (c) => {
  const rows = await db.select().from(semesters).orderBy(semesters.startDate);
  return c.json({ data: rows });
});

semestersRoute.get('/:id', async (c) => {
  const row = await db.select().from(semesters).where(eq(semesters.id, c.req.param('id'))).limit(1);
  if (row.length === 0) return c.json({ error: { code: 'NOT_FOUND', message: 'Semester not found' } }, 404);
  return c.json({ data: row[0] });
});

semestersRoute.post('/', zValidator('json', semesterCreateSchema), async (c) => {
  const body = c.req.valid('json');
  const created = await db.transaction(async (tx) => {
    if (body.isCurrent) {
      await tx.update(semesters).set({ isCurrent: false });
    }
    const [row] = await tx.insert(semesters).values(body).returning();
    // 5限デフォルトを自動作成
    await tx
      .insert(periods)
      .values(DEFAULT_PERIODS.map((p) => ({ ...p, semesterId: row!.id })));
    // 月〜金の全日付を class_days に自動セット（旧 combi の generateDefaultClassDays 相当）
    const defaultDates: { semesterId: string; date: string }[] = [];
    const start = new Date(body.startDate);
    const end = new Date(body.endDate);
    for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dow = d.getDay(); // 0=Sun ... 6=Sat
      if (dow >= 1 && dow <= 5) {
        defaultDates.push({
          semesterId: row!.id,
          date: d.toISOString().slice(0, 10),
        });
      }
    }
    if (defaultDates.length > 0) {
      await tx.insert(classDays).values(defaultDates);
    }
    return row!;
  });
  scheduleClassSync(created.id);
  return c.json({ data: created }, 201);
});

semestersRoute.patch('/:id', zValidator('json', semesterUpdateSchema), async (c) => {
  const id = c.req.param('id');
  const body = c.req.valid('json');
  const updated = await db.transaction(async (tx) => {
    if (body.isCurrent) {
      await tx.update(semesters).set({ isCurrent: false });
    }
    const rows = await tx
      .update(semesters)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(semesters.id, id))
      .returning();
    return rows[0];
  });
  if (!updated) return c.json({ error: { code: 'NOT_FOUND', message: 'Semester not found' } }, 404);
  scheduleClassSync(updated.id);
  return c.json({ data: updated });
});

semestersRoute.delete('/:id', async (c) => {
  const deleted = await db.delete(semesters).where(eq(semesters.id, c.req.param('id'))).returning();
  if (deleted.length === 0) return c.json({ error: { code: 'NOT_FOUND', message: 'Semester not found' } }, 404);
  scheduleClassSync();
  return c.body(null, 204);
});
