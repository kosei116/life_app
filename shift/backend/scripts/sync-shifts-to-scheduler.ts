/**
 * 既存の shift を一括で scheduler に push する。
 * 直近 6ヶ月先のみ（過去のは GCal に流し込む必要が低いため）。
 */
import postgres from 'postgres';
import { computeShiftWage } from '../src/lib/wage.js';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL not set');

const SCHEDULER_API_URL = process.env.SCHEDULER_API_URL ?? 'http://localhost:3030';
const SOURCE_ID = process.env.SCHEDULER_SOURCE_ID ?? 'shift';

async function main() {
  const sql = postgres(DATABASE_URL!);

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 1);
  const horizon = new Date();
  horizon.setMonth(horizon.getMonth() + 6);

  const rows = await sql<
    {
      id: string; workplace_id: string; start_at: Date; end_at: Date;
      rate_override: number | null; notes: string | null; created_at: Date; updated_at: Date;
      wp_id: string; wp_name: string; wp_color: string; wp_hourly_rate: number;
      wp_break_threshold_minutes: number; wp_break_minutes: number;
      wp_night_start_hour: number; wp_night_end_hour: number; wp_night_multiplier: string;
      wp_created_at: Date; wp_updated_at: Date;
    }[]
  >`
    SELECT s.*, w.id as wp_id, w.name as wp_name, w.color as wp_color, w.hourly_rate as wp_hourly_rate,
           w.break_threshold_minutes as wp_break_threshold_minutes,
           w.break_minutes as wp_break_minutes,
           w.night_start_hour as wp_night_start_hour, w.night_end_hour as wp_night_end_hour,
           w.night_multiplier as wp_night_multiplier,
           w.created_at as wp_created_at, w.updated_at as wp_updated_at
    FROM shifts s
    JOIN workplaces w ON w.id = s.workplace_id
    WHERE s.start_at >= ${cutoff.toISOString()} AND s.start_at <= ${horizon.toISOString()}
    ORDER BY s.start_at
  `;

  console.log(`Pushing ${rows.length} shifts to scheduler (range: ${cutoff.toISOString().slice(0, 10)} - ${horizon.toISOString().slice(0, 10)})...`);
  let ok = 0, fail = 0;
  for (const r of rows) {
    const shift = {
      id: r.id, workplaceId: r.workplace_id, startAt: r.start_at, endAt: r.end_at,
      rateOverride: r.rate_override, notes: r.notes,
      createdAt: r.created_at, updatedAt: r.updated_at,
    };
    const workplace = {
      id: r.wp_id, name: r.wp_name, color: r.wp_color, hourlyRate: r.wp_hourly_rate,
      breakThresholdMinutes: r.wp_break_threshold_minutes, breakMinutes: r.wp_break_minutes,
      nightStartHour: r.wp_night_start_hour, nightEndHour: r.wp_night_end_hour,
      nightMultiplier: r.wp_night_multiplier,
      createdAt: r.wp_created_at, updatedAt: r.wp_updated_at,
    };
    const calc = computeShiftWage(shift as any, workplace as any);
    const ev = {
      source: SOURCE_ID,
      source_event_id: `shift:${r.id}`,
      title: `${r.wp_name}（¥${calc.totalPay.toLocaleString()}）`,
      start: r.start_at.toISOString(),
      end: r.end_at.toISOString(),
      all_day: false,
      description: r.notes ?? undefined,
      category: 'shift',
      color: r.wp_color,
      metadata: { raw: { shiftId: r.id, workplaceId: r.wp_id, totalPay: calc.totalPay } },
    };
    const res = await fetch(`${SCHEDULER_API_URL}/api/sources/${SOURCE_ID}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ev),
    });
    if (res.ok) ok++;
    else { fail++; console.error(`  ✗ ${r.wp_name} ${r.start_at}: ${res.status}`); }
  }
  console.log(`Done: ${ok} pushed, ${fail} failed`);
  await sql.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
