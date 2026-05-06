import type { ImportEvent } from '@life-app/types';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { workplaces, type ShiftRow } from '../db/schema.js';
import { computeShiftWage } from '../lib/wage.js';

const SCHEDULER_API_URL = process.env.SCHEDULER_API_URL ?? 'http://localhost:3030';
const SOURCE_ID = process.env.SCHEDULER_SOURCE_ID ?? 'shift';
const ENABLED = process.env.SCHEDULER_PUSH_ENABLED === 'true';

async function fetchWorkplace(id: string) {
  const rows = await db.select().from(workplaces).where(eq(workplaces.id, id)).limit(1);
  return rows[0] ?? null;
}

function shiftToImportEvent(
  shift: ShiftRow,
  workplaceName: string,
  workplaceColor: string,
  totalPay: number
): ImportEvent {
  return {
    source: SOURCE_ID,
    source_event_id: `shift:${shift.id}`,
    title: `${workplaceName}（¥${totalPay.toLocaleString()}）`,
    start: shift.startAt.toISOString(),
    end: shift.endAt.toISOString(),
    all_day: false,
    description: shift.notes ?? undefined,
    category: 'shift',
    color: workplaceColor,
    metadata: {
      raw: { shiftId: shift.id, workplaceId: shift.workplaceId, totalPay },
    },
  };
}

export async function pushShiftToScheduler(shift: ShiftRow): Promise<void> {
  if (!ENABLED) return;
  const wp = await fetchWorkplace(shift.workplaceId);
  if (!wp) return;
  const calc = computeShiftWage(shift, wp);
  const ev = shiftToImportEvent(shift, wp.name, wp.color, calc.totalPay);
  const res = await fetch(`${SCHEDULER_API_URL}/api/sources/${SOURCE_ID}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ev),
  });
  if (!res.ok) throw new Error(`scheduler push failed: ${res.status} ${await res.text()}`);
}

export async function deleteShiftFromScheduler(shiftId: string): Promise<void> {
  if (!ENABLED) return;
  const res = await fetch(
    `${SCHEDULER_API_URL}/api/sources/${SOURCE_ID}/events/shift:${shiftId}`,
    { method: 'DELETE' }
  );
  if (!res.ok && res.status !== 404) {
    throw new Error(`scheduler delete failed: ${res.status} ${await res.text()}`);
  }
}
