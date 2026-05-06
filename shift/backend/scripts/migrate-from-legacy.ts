/**
 * part-time-legacy (Firebase RTDB) から shift (Postgres) にデータ移行。
 * データは実は combi 同じ Firebase プロジェクト (manager-8ac68) にある。
 */
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';

const FIREBASE_URL = 'https://manager-8ac68-default-rtdb.asia-southeast1.firebasedatabase.app';
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL not set');

type FbWorkplace = { name: string; color: string; rate: number };
type FbShift = {
  date: string;
  start: string;
  end: string;
  startTime?: string;
  endTime?: string;
  workplaceId?: string;
  workplaceName?: string;
  rate?: number;
  notes?: string;
  description?: string;
};

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${FIREBASE_URL}${path}.json`);
  if (!res.ok) throw new Error(`fetch ${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

function parseShiftDateTimes(s: FbShift): { startAt: Date; endAt: Date } | null {
  // startTime/endTime が ISO ローカル形式（例: 2025-11-03T18:00）の場合はそれを優先
  // 無ければ date + start/end から構築
  const buildFromParts = (date: string, time: string): Date => {
    const [y, mo, d] = date.split('-').map(Number);
    const [hh, mm] = time.split(':').map(Number);
    return new Date(y!, mo! - 1, d!, hh!, mm!);
  };
  if (!s.date || !s.start || !s.end) return null;
  const startAt = buildFromParts(s.date, s.start);
  let endAt = buildFromParts(s.date, s.end);
  if (endAt <= startAt) endAt.setDate(endAt.getDate() + 1); // 日跨ぎ
  return { startAt, endAt };
}

async function main() {
  const sql = postgres(DATABASE_URL!);

  console.log('Fetching from Firebase...');
  const [workplaces, shifts] = await Promise.all([
    fetchJson<Record<string, FbWorkplace>>('/workplaces'),
    fetchJson<Record<string, FbShift>>('/shifts'),
  ]);

  const wpIdMap = new Map<string, string>();

  await sql.begin(async (tx) => {
    // 1) workplaces
    for (const [oldId, wp] of Object.entries(workplaces)) {
      if (!wp || !wp.name) continue;
      const newId = randomUUID();
      wpIdMap.set(oldId, newId);
      await tx`
        INSERT INTO workplaces (id, name, color, hourly_rate)
        VALUES (${newId}, ${wp.name}, ${wp.color || '#3b82f6'}, ${Math.round(wp.rate ?? 1100)})
      `;
      console.log(`  ✓ workplace: ${wp.name} (¥${wp.rate})`);
    }

    // 2) shifts
    let count = 0, skipped = 0;
    for (const [, sh] of Object.entries(shifts)) {
      if (!sh || sh.workplaceId == null) { skipped++; continue; }
      const newWpId = wpIdMap.get(sh.workplaceId);
      if (!newWpId) { skipped++; continue; }
      const dt = parseShiftDateTimes(sh);
      if (!dt) { skipped++; continue; }

      const rateOverride = sh.rate && workplaces[sh.workplaceId] && sh.rate !== workplaces[sh.workplaceId]!.rate
        ? Math.round(sh.rate)
        : null;
      const notes = sh.notes || sh.description || null;

      await tx`
        INSERT INTO shifts (workplace_id, start_at, end_at, rate_override, notes)
        VALUES (${newWpId}, ${dt.startAt.toISOString()}, ${dt.endAt.toISOString()},
                ${rateOverride}, ${notes})
      `;
      count++;
    }
    console.log(`  ✓ ${count} shifts imported (${skipped} skipped)`);
  });

  await sql.end();
  console.log('\nDone.');
}

main().catch((err) => { console.error(err); process.exit(1); });
