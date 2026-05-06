import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { and, eq, gte, lt } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import { shifts, workplaces, monthlyTargets } from '../db/schema.js';
import { computeShiftWage } from '../lib/wage.js';
import { monthlyTargetSchema } from '../validators/index.js';

export const incomeRoute = new Hono();

const monthQuery = z.object({ yearMonth: z.string().regex(/^\d{4}-\d{2}$/) });
const yearQuery = z.object({ year: z.coerce.number().int() });

function monthBounds(yearMonth: string): { start: Date; end: Date } {
  const [y, m] = yearMonth.split('-').map(Number);
  const start = new Date(y!, m! - 1, 1);
  const end = new Date(y!, m!, 1);
  return { start, end };
}

incomeRoute.get('/month', zValidator('query', monthQuery), async (c) => {
  const { yearMonth } = c.req.valid('query');
  const { start, end } = monthBounds(yearMonth);
  const rows = await db
    .select()
    .from(shifts)
    .where(and(gte(shifts.startAt, start), lt(shifts.startAt, end)));
  const wpMap = new Map((await db.select().from(workplaces)).map((w) => [w.id, w]));
  let totalPay = 0;
  let paidHours = 0;
  let count = 0;
  for (const s of rows) {
    const wp = wpMap.get(s.workplaceId);
    if (!wp) continue;
    const calc = computeShiftWage(s, wp);
    totalPay += calc.totalPay;
    paidHours += calc.paidHours;
    count++;
  }
  const target = await db
    .select()
    .from(monthlyTargets)
    .where(eq(monthlyTargets.yearMonth, yearMonth))
    .limit(1);
  return c.json({
    data: {
      yearMonth,
      totalPay,
      paidHours,
      shiftCount: count,
      target: target[0]?.amount ?? 90000,
    },
  });
});

incomeRoute.get('/year', zValidator('query', yearQuery), async (c) => {
  const { year } = c.req.valid('query');
  const start = new Date(year, 0, 1);
  const end = new Date(year + 1, 0, 1);
  const rows = await db
    .select()
    .from(shifts)
    .where(and(gte(shifts.startAt, start), lt(shifts.startAt, end)));
  const wpMap = new Map((await db.select().from(workplaces)).map((w) => [w.id, w]));

  // 月別集計
  const months: { month: number; totalPay: number; hours: number; count: number }[] = Array.from(
    { length: 12 },
    (_, i) => ({ month: i + 1, totalPay: 0, hours: 0, count: 0 })
  );
  for (const s of rows) {
    const wp = wpMap.get(s.workplaceId);
    if (!wp) continue;
    const calc = computeShiftWage(s, wp);
    const m = s.startAt.getMonth();
    months[m]!.totalPay += calc.totalPay;
    months[m]!.hours += calc.paidHours;
    months[m]!.count++;
  }
  const totalPay = months.reduce((s, m) => s + m.totalPay, 0);
  const totalHours = months.reduce((s, m) => s + m.hours, 0);
  const totalCount = months.reduce((s, m) => s + m.count, 0);
  const activeMonths = months.filter((m) => m.count > 0);
  const avgMonthly = activeMonths.length > 0 ? totalPay / activeMonths.length : 0;
  const high = activeMonths.length > 0 ? activeMonths.reduce((a, b) => (a.totalPay > b.totalPay ? a : b)) : null;
  const low = activeMonths.length > 0 ? activeMonths.reduce((a, b) => (a.totalPay < b.totalPay ? a : b)) : null;
  return c.json({
    data: { year, months, totalPay, totalHours, totalCount, avgMonthly, high, low },
  });
});

// 月間目標
incomeRoute.put('/target', zValidator('json', monthlyTargetSchema), async (c) => {
  const body = c.req.valid('json');
  const [row] = await db
    .insert(monthlyTargets)
    .values(body)
    .onConflictDoUpdate({
      target: monthlyTargets.yearMonth,
      set: { amount: body.amount, updatedAt: new Date() },
    })
    .returning();
  return c.json({ data: row });
});

incomeRoute.get('/target', zValidator('query', monthQuery), async (c) => {
  const { yearMonth } = c.req.valid('query');
  const rows = await db
    .select()
    .from(monthlyTargets)
    .where(eq(monthlyTargets.yearMonth, yearMonth))
    .limit(1);
  return c.json({ data: rows[0] ?? { yearMonth, amount: 90000 } });
});
