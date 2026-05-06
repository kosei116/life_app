import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import { classDays, semesters } from '../db/schema.js';
import { scheduleClassSync } from '../services/class-push.js';
import {
  classDaysReplaceSchema,
  classDayToggleSchema,
  uuidSchema,
  dateString,
} from '../validators/index.js';

export const classDaysRoute = new Hono();

classDaysRoute.get(
  '/',
  zValidator('query', z.object({ semesterId: uuidSchema })),
  async (c) => {
    const { semesterId } = c.req.valid('query');
    const rows = await db
      .select()
      .from(classDays)
      .where(eq(classDays.semesterId, semesterId))
      .orderBy(classDays.date);
    return c.json({ data: rows });
  }
);

// 学期の授業日を一括置き換え
classDaysRoute.put(
  '/bulk/:semester_id',
  zValidator('json', classDaysReplaceSchema),
  async (c) => {
    const semesterId = c.req.param('semester_id');
    const dates = c.req.valid('json');
    const result = await db.transaction(async (tx) => {
      await tx.delete(classDays).where(eq(classDays.semesterId, semesterId));
      if (dates.length === 0) return [];
      return tx
        .insert(classDays)
        .values(dates.map((d) => ({ semesterId, date: d })))
        .returning();
    });
    scheduleClassSync(semesterId);
    return c.json({ data: result });
  }
);

// 曜日一括: 月内の特定曜日を授業日 ON/OFF
const weekdayBulkSchema = z.object({
  semesterId: uuidSchema,
  year: z.number().int(),
  month: z.number().int().min(1).max(12), // 1-indexed
  jsWeekday: z.number().int().min(0).max(6), // 0=Sun ... 6=Sat
  setHoliday: z.boolean(), // true = 休日にする, false = 授業日に戻す
});
classDaysRoute.post('/weekday-bulk', zValidator('json', weekdayBulkSchema), async (c) => {
  const { semesterId, year, month, jsWeekday, setHoliday } = c.req.valid('json');
  const sem = await db
    .select()
    .from(semesters)
    .where(eq(semesters.id, semesterId))
    .limit(1);
  if (sem.length === 0) return c.json({ error: { code: 'NOT_FOUND', message: 'Semester not found' } }, 404);
  const s = sem[0]!;

  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0);
  const semStart = new Date(s.startDate);
  const semEnd = new Date(s.endDate);
  const start = monthStart > semStart ? monthStart : semStart;
  const end = monthEnd < semEnd ? monthEnd : semEnd;

  const dates: string[] = [];
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    if (d.getDay() === jsWeekday) {
      dates.push(d.toISOString().slice(0, 10));
    }
  }

  if (dates.length === 0) return c.json({ data: { affected: 0 } });

  await db.transaction(async (tx) => {
    if (setHoliday) {
      // 休日にする = class_days から削除
      for (const date of dates) {
        await tx
          .delete(classDays)
          .where(and(eq(classDays.semesterId, semesterId), eq(classDays.date, date)));
      }
    } else {
      // 授業日に戻す = class_days に追加（既存は無視）
      for (const date of dates) {
        await tx.insert(classDays).values({ semesterId, date }).onConflictDoNothing();
      }
    }
  });

  scheduleClassSync(semesterId);
  return c.json({ data: { affected: dates.length } });
});

// 全平日を授業日にリセット（旧 combi の resetAllWeekdays）
classDaysRoute.post(
  '/reset/:semester_id',
  async (c) => {
    const semesterId = c.req.param('semester_id');
    const sem = await db.select().from(semesters).where(eq(semesters.id, semesterId)).limit(1);
    if (sem.length === 0) return c.json({ error: { code: 'NOT_FOUND', message: 'Semester not found' } }, 404);
    const s = sem[0]!;
    const start = new Date(s.startDate);
    const end = new Date(s.endDate);
    const dates: { semesterId: string; date: string }[] = [];
    for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dow = d.getDay();
      if (dow >= 1 && dow <= 5) {
        dates.push({ semesterId, date: d.toISOString().slice(0, 10) });
      }
    }
    await db.transaction(async (tx) => {
      await tx.delete(classDays).where(eq(classDays.semesterId, semesterId));
      if (dates.length > 0) await tx.insert(classDays).values(dates);
    });
    scheduleClassSync(semesterId);
    return c.json({ data: { count: dates.length } });
  }
);

// 1日の授業日を toggle (追加/削除)
classDaysRoute.post('/toggle', zValidator('json', classDayToggleSchema), async (c) => {
  const { semesterId, date } = c.req.valid('json');
  const existing = await db
    .select()
    .from(classDays)
    .where(and(eq(classDays.semesterId, semesterId), eq(classDays.date, date)))
    .limit(1);
  if (existing.length > 0) {
    await db
      .delete(classDays)
      .where(and(eq(classDays.semesterId, semesterId), eq(classDays.date, date)));
    scheduleClassSync(semesterId);
    return c.json({ data: { date, exists: false } });
  } else {
    await db.insert(classDays).values({ semesterId, date });
    scheduleClassSync(semesterId);
    return c.json({ data: { date, exists: true } });
  }
});
