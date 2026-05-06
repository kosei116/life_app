import type { Subject, TimetableSlot, ClassDay } from './types.js';

// 旧 combi の getCurrentWeekForSubject:
// その科目が時間割に最初に登場する曜日について、今日以前の授業日数を返す（最低1）。
function jsDayOfWeek(d: Date): number {
  return d.getDay();
}

// dayOfWeek は my schema の 0=月..4=金 → js の getDay 1..5 に変換
function myDayToJsDay(myDow: number): number {
  // 0=月→1, 1=火→2, ..., 4=金→5, 5=土→6, 6=日→0
  return myDow === 6 ? 0 : myDow + 1;
}

function pastClassDaysOnJsWeekday(
  classDays: ClassDay[],
  jsWeekday: number,
  todayISO: string
): number {
  let count = 0;
  for (const cd of classDays) {
    if (cd.date > todayISO) continue;
    const d = new Date(cd.date);
    if (jsDayOfWeek(d) === jsWeekday) count++;
  }
  return count;
}

// 旧 combi: 最初の slot のみ参照
function findFirstSlotForSubject(
  subjectId: string,
  slots: TimetableSlot[]
): TimetableSlot | undefined {
  // periodNumber → day の順で探したいが、ここでは period_id を持っていないため
  // dayOfWeek の昇順で最小のものを返す（旧 combi は period→day 順 = 同じ science のためOK）
  return slots
    .filter((sl) => sl.subjectId === subjectId)
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek)[0];
}

export function getCurrentWeekForSubject(
  subjectId: string,
  slots: TimetableSlot[],
  classDays: ClassDay[],
  todayISO: string = new Date().toISOString().slice(0, 10)
): number {
  const slot = findFirstSlotForSubject(subjectId, slots);
  if (!slot) return 1;
  const jsWd = myDayToJsDay(slot.dayOfWeek);
  return Math.max(1, pastClassDaysOnJsWeekday(classDays, jsWd, todayISO));
}

export type SubjectStat = {
  subject: Subject;
  currentWeek: number; // 分母（経過授業日数 ≥ 1）
  percent: number;
  deficit: number; // currentWeek - lecturesAttended（正なら遅れ）
};

export function computeSubjectStats(args: {
  subjects: Subject[];
  slots: TimetableSlot[];
  classDays: ClassDay[];
}): SubjectStat[] {
  const today = new Date().toISOString().slice(0, 10);
  return args.subjects.map((s) => {
    const cw = getCurrentWeekForSubject(s.id, args.slots, args.classDays, today);
    const percent = Math.max(
      0,
      Math.min(100, Math.floor((cw ? s.lecturesAttended / cw : 0) * 100))
    );
    const deficit = cw - s.lecturesAttended;
    return { subject: s, currentWeek: cw, percent, deficit };
  });
}

// 旧 combi の computeProgressColorClass: 純粋な pct 閾値
export function progressColorClass(percent: number): string {
  if (percent === 0) return 'pct-0';
  if (percent < 25) return 'pct-1';
  if (percent < 50) return 'pct-2';
  if (percent < 75) return 'pct-3';
  return 'pct-4';
}

export function currentWeekNumber(startISO: string): number {
  // 旧 combi: 全曜日の中で max の経過授業数（updateWeekDisplay の挙動）
  // ここでは学期開始からの週数で簡易計算
  const start = new Date(startISO);
  const now = new Date();
  if (now < start) return 0;
  const diffDays = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return Math.floor(diffDays / 7) + 1;
}

// 旧 combi の updateWeekDisplay: 全平日の中で max の経過授業数
export function maxElapsedWeekFromClassDays(
  classDays: ClassDay[],
  todayISO: string = new Date().toISOString().slice(0, 10)
): number {
  let max = 0;
  for (let wd = 1; wd <= 5; wd++) {
    const count = pastClassDaysOnJsWeekday(classDays, wd, todayISO);
    if (count > max) max = count;
  }
  return max;
}

// ローカル日付を YYYY-MM-DD で（toISOString は UTC 変換で日付がズレるので NG）
export function formatDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 旧 combi の formatDueDate
export function formatDueDate(dueDate: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const diff = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return `${-diff}日超過`;
  if (diff === 0) return '今日';
  if (diff === 1) return '明日';
  return `あと${diff}日`;
}

export function classifyTaskDueDate(dueDate: string): 'overdue' | 'today' | 'soon' | 'normal' {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const diff = (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  if (diff <= 3) return 'soon';
  return 'normal';
}
