/**
 * combi (Firebase Realtime DB) から study (Postgres) にデータ移行する。
 *
 * 使い方:
 *   cd study/backend
 *   pnpm tsx --env-file=.env scripts/migrate-from-combi.ts
 *
 * 仕様:
 * - Firebase RTDB から /semesters, /subjects, /tabler を fetch
 * - 旧 sem_*, sub_* ID → 新 UUID にマッピング
 * - 時限は デフォ 1〜5限の固定時刻でセット
 * - timetable[5][5] (曜日 月〜金 × 1〜5限) を timetable_slots に展開
 * - classDays は class_day_exceptions ではなく無視（統計用だったため）
 * - tasks は type を小文字化してインポート
 * - 旧の subjectsByName 共有はそのまま（同一 sub_id を共有していたなら 1 subject）
 */

import postgres from 'postgres';
import { randomUUID } from 'node:crypto';

const FIREBASE_URL =
  'https://manager-8ac68-default-rtdb.asia-southeast1.firebasedatabase.app';
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL not set');

const DEFAULT_PERIODS = [
  { periodNumber: 1, startTime: '08:50', endTime: '10:30' },
  { periodNumber: 2, startTime: '10:40', endTime: '12:20' },
  { periodNumber: 3, startTime: '13:10', endTime: '14:50' },
  { periodNumber: 4, startTime: '15:05', endTime: '16:45' },
  { periodNumber: 5, startTime: '17:00', endTime: '18:40' },
];

type FbSemester = {
  name: string;
  startDate: string;
  endDate: string;
  classDays?: string[];
  timetable?: string[][]; // 5×5 of subjectId or ""
  createdAt?: number;
};

type FbSubject = {
  id: string;
  semesterId?: string;
  name: string;
  color: string;
  progress?: number;
  evaluation?: unknown;
};

type FbTask = {
  semesterId: string;
  subjectId?: string;
  type: 'Assignment' | 'Report' | 'Test' | string;
  content?: string;
  title?: string;
  dueDate: string;
  completed?: boolean;
  completedAt?: number;
  createdAt?: number;
};

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${FIREBASE_URL}${path}.json`);
  if (!res.ok) throw new Error(`fetch ${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

function mapTaskType(t: string): 'assignment' | 'report' | 'test' | 'other' {
  const lower = t.toLowerCase();
  if (lower === 'assignment') return 'assignment';
  if (lower === 'report') return 'report';
  if (lower === 'test') return 'test';
  return 'other';
}

async function main() {
  const sql = postgres(DATABASE_URL!);

  console.log('Fetching from Firebase...');
  const [semesters, subjectsByOldSem, tabler] = await Promise.all([
    fetchJson<Record<string, FbSemester>>('/semesters'),
    fetchJson<Record<string, Record<string, FbSubject> | FbSubject[]>>('/subjects'),
    fetchJson<{
      currentSemesterId?: string;
      tasks?: Record<string, FbTask>;
      timetable?: unknown;
    }>('/tabler'),
  ]);

  console.log(`Found ${Object.keys(semesters).length} semesters`);

  const semIdMap = new Map<string, string>(); // oldSemId → newSemUuid
  const subIdMap = new Map<string, string>(); // oldSubId → newSubUuid
  const periodMap = new Map<string, Map<number, string>>(); // newSemId → (periodNumber → newPeriodUuid)

  await sql.begin(async (tx) => {
    // 1) semesters
    for (const [oldId, sem] of Object.entries(semesters)) {
      if (!sem || typeof sem !== 'object' || !sem.name) continue;
      const newId = randomUUID();
      semIdMap.set(oldId, newId);
      const isCurrent = tabler.currentSemesterId === oldId;
      await tx`
        INSERT INTO semesters (id, name, start_date, end_date, is_current)
        VALUES (${newId}, ${sem.name}, ${sem.startDate}, ${sem.endDate}, ${isCurrent})
      `;
      console.log(`  ✓ semester: ${sem.name} (${oldId} → ${newId})`);

      // 2) periods (default 1-5)
      const pMap = new Map<number, string>();
      for (const p of DEFAULT_PERIODS) {
        const pid = randomUUID();
        await tx`
          INSERT INTO periods (id, semester_id, period_number, start_time, end_time)
          VALUES (${pid}, ${newId}, ${p.periodNumber}, ${p.startTime}, ${p.endTime})
        `;
        pMap.set(p.periodNumber, pid);
      }
      periodMap.set(newId, pMap);
    }

    // 3) subjects
    for (const [oldSemId, subEntry] of Object.entries(subjectsByOldSem)) {
      if (oldSemId === '0' || !semIdMap.has(oldSemId)) continue; // skip legacy/orphan
      const newSemId = semIdMap.get(oldSemId)!;
      const subDict: Record<string, FbSubject> = Array.isArray(subEntry)
        ? Object.fromEntries((subEntry as FbSubject[]).map((s, i) => [s.id ?? String(i), s]))
        : (subEntry as Record<string, FbSubject>);
      for (const [oldSubId, sub] of Object.entries(subDict)) {
        if (!sub || typeof sub !== 'object' || !sub.name) continue;
        const newSubId = randomUUID();
        subIdMap.set(oldSubId, newSubId);
        const lecturesAttended = Math.max(0, Math.floor(sub.progress ?? 0));
        const status =
          lecturesAttended === 0 ? 'not_started' : 'in_progress';
        await tx`
          INSERT INTO subjects (id, semester_id, name, color, lectures_attended, status, evaluation)
          VALUES (${newSubId}, ${newSemId}, ${sub.name}, ${sub.color || '#cccccc'},
                  ${lecturesAttended}, ${status}, ${sub.evaluation ? JSON.stringify(sub.evaluation) : null})
        `;
      }
    }
    console.log(`  ✓ ${subIdMap.size} subjects imported`);

    // 4) timetable_slots (only Mon-Fri × 1-5)
    let slotCount = 0;
    for (const [oldSemId, sem] of Object.entries(semesters)) {
      if (!semIdMap.has(oldSemId) || !sem.timetable) continue;
      const newSemId = semIdMap.get(oldSemId)!;
      const pMap = periodMap.get(newSemId)!;
      // timetable[periodIdx][dayIdx]? or [dayIdx][periodIdx]? sample: row 0 had
      // ['sub_..._b3yyore', 'sub_..._dkg3dct', '', 'sub_..._9pc904r', ''] → looks like
      // a row of 5 cells, each cell = a day. So timetable[period][day]. Let's assume:
      //   rows = periods (0=1限 ... 4=5限)
      //   cols = days (0=月 ... 4=金)
      for (let pIdx = 0; pIdx < sem.timetable.length; pIdx++) {
        const row = sem.timetable[pIdx]!;
        const periodNumber = pIdx + 1;
        const periodId = pMap.get(periodNumber);
        if (!periodId) continue;
        for (let d = 0; d < row.length; d++) {
          const oldSubId = row[d];
          if (!oldSubId) continue;
          const newSubId = subIdMap.get(oldSubId);
          if (!newSubId) continue;
          await tx`
            INSERT INTO timetable_slots (semester_id, day_of_week, period_id, subject_id)
            VALUES (${newSemId}, ${d}, ${periodId}, ${newSubId})
            ON CONFLICT DO NOTHING
          `;
          slotCount++;
        }
      }
    }
    console.log(`  ✓ ${slotCount} timetable slots imported`);

    // 5) tasks
    let taskCount = 0;
    for (const [, task] of Object.entries(tabler.tasks ?? {})) {
      if (!task || typeof task !== 'object') continue;
      const newSemId = semIdMap.get(task.semesterId);
      if (!newSemId) continue;
      const newSubId = task.subjectId ? subIdMap.get(task.subjectId) ?? null : null;
      const type = mapTaskType(task.type);
      const title = (task.title || task.content || '(無題)').trim() || '(無題)';
      const completedAt =
        task.completed && task.completedAt ? new Date(task.completedAt) : null;
      await tx`
        INSERT INTO tasks (semester_id, subject_id, type, title, due_date, completed, completed_at)
        VALUES (${newSemId}, ${newSubId}, ${type}, ${title}, ${task.dueDate},
                ${!!task.completed}, ${completedAt})
      `;
      taskCount++;
    }
    console.log(`  ✓ ${taskCount} tasks imported`);
  });

  await sql.end();
  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
