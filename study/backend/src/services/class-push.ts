/**
 * 授業（timetable_slots × class_days）を scheduler に同期する。
 * 実装方針:
 *   - 学期内の各 class_day について、その曜日に当たる timetable_slot を全て展開
 *   - 各授業 = ImportEvent（start/end は period の time、source_event_id は class:slot:date）
 *   - source は別 source 'study-class' として bulk PUT で全置換
 */
import type { ImportEvent } from '@life-app/types';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { semesters, classDays, periods, subjects, timetableSlots } from '../db/schema.js';

const SCHEDULER_API_URL = process.env.SCHEDULER_API_URL ?? 'http://localhost:3030';
const ENABLED = process.env.SCHEDULER_PUSH_ENABLED === 'true';
const CLASS_SOURCE_ID = 'study-class';

// my schema の day_of_week 0=月..6=日 → JS getDay 0=日..6=土
function jsDayToMyDay(jsDay: number): number {
  return (jsDay + 6) % 7;
}

// "YYYY-MM-DD" + "HH:MM:SS" → ISO datetime in JST
function buildJstISO(date: string, time: string): string {
  return `${date}T${time.slice(0, 8)}+09:00`;
}

// 旧 combi の科目色は淡いパステル（例: #FDEAEA）でカレンダー上見えづらい。
// HSL 変換で彩度を上げ・明度を下げて視認性のある色にする。
function vividize(hex: string): string {
  const m = hex.match(/^#?([0-9a-f]{6})$/i);
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  const [h, s, l] = rgbToHsl(r, g, b);
  // パステル（s が低い or l が高い）を補正
  const newS = Math.min(1, Math.max(s, 0.6));
  const newL = Math.min(0.6, Math.max(0.4, l > 0.85 ? 0.5 : l));
  const [nr, ng, nb] = hslToRgb(h, newS, newL);
  return '#' + [nr, ng, nb].map((v) => v.toString(16).padStart(2, '0')).join('');
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
      case g: h = ((b - r) / d + 2); break;
      case b: h = ((r - g) / d + 4); break;
    }
    h /= 6;
  }
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2rgb = (t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [
    Math.round(hue2rgb(h + 1 / 3) * 255),
    Math.round(hue2rgb(h) * 255),
    Math.round(hue2rgb(h - 1 / 3) * 255),
  ];
}

export async function buildClassEvents(semesterId: string): Promise<ImportEvent[]> {
  const sem = await db.select().from(semesters).where(eq(semesters.id, semesterId)).limit(1);
  if (sem.length === 0) return [];

  const [days, slots, allSubjects, allPeriods] = await Promise.all([
    db.select().from(classDays).where(eq(classDays.semesterId, semesterId)),
    db.select().from(timetableSlots).where(eq(timetableSlots.semesterId, semesterId)),
    db.select().from(subjects).where(eq(subjects.semesterId, semesterId)),
    db.select().from(periods).where(eq(periods.semesterId, semesterId)),
  ]);

  const periodMap = new Map(allPeriods.map((p) => [p.id, p]));
  const subjectMap = new Map(allSubjects.map((s) => [s.id, s]));

  // dayOfWeek → slots[] へのインデックス
  const slotsByDay = new Map<number, typeof slots>();
  for (const s of slots) {
    if (!slotsByDay.has(s.dayOfWeek)) slotsByDay.set(s.dayOfWeek, []);
    slotsByDay.get(s.dayOfWeek)!.push(s);
  }

  const events: ImportEvent[] = [];
  for (const cd of days) {
    const myDow = jsDayToMyDay(new Date(cd.date).getDay());
    const todaySlots = slotsByDay.get(myDow) ?? [];
    for (const slot of todaySlots) {
      const period = periodMap.get(slot.periodId);
      const subject = subjectMap.get(slot.subjectId);
      if (!period || !subject) continue;
      events.push({
        source: CLASS_SOURCE_ID,
        source_event_id: `class:${slot.id}:${cd.date}`,
        title: subject.name,
        start: buildJstISO(cd.date, period.startTime),
        end: buildJstISO(cd.date, period.endTime),
        all_day: false,
        category: 'class',
        color: vividize(subject.color),
        metadata: {
          raw: {
            slotId: slot.id,
            subjectId: subject.id,
            periodNumber: period.periodNumber,
            date: cd.date,
          },
        },
      });
    }
  }
  return events;
}

let pending: Promise<void> | null = null;
let queued = false;

/**
 * 全学期の授業イベントを scheduler に bulk PUT で同期する。
 * 連続呼出は debounce（1秒）。
 */
export function scheduleClassSync(semesterId?: string): void {
  if (!ENABLED) return;
  // 直近の呼び出しがあれば後続をキューに乗せる
  if (pending) {
    queued = true;
    return;
  }
  pending = doSyncAll(semesterId)
    .catch((e) => console.error('[class-push]', e))
    .finally(() => {
      pending = null;
      if (queued) {
        queued = false;
        scheduleClassSync(semesterId);
      }
    });
}

async function doSyncAll(_semesterId?: string): Promise<void> {
  // 全学期のイベントを集約してまとめて bulk PUT
  const sems = await db.select({ id: semesters.id }).from(semesters);
  const all: ImportEvent[] = [];
  for (const s of sems) {
    all.push(...(await buildClassEvents(s.id)));
  }
  const res = await fetch(
    `${SCHEDULER_API_URL}/api/sources/${CLASS_SOURCE_ID}/events`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(all),
    }
  );
  if (!res.ok) {
    throw new Error(`class push failed: ${res.status} ${await res.text()}`);
  }
  console.log(`[class-push] synced ${all.length} class events`);
}
