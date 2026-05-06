import type { ShiftRow, WorkplaceRow } from '../db/schema.js';

export type ShiftCalc = {
  rawDurationHours: number;
  breakHours: number;
  paidHours: number;
  nightHours: number;
  basePay: number;
  nightPay: number;
  totalPay: number;
};

// 旧 part-time の業務ルールを Workplace 設定で動かす版
export function computeShiftWage(shift: ShiftRow, workplace: WorkplaceRow): ShiftCalc {
  const rate = shift.rateOverride ?? workplace.hourlyRate;
  const startMs = shift.startAt.getTime();
  const endMs = shift.endAt.getTime();
  const rawDurationHours = Math.max(0, (endMs - startMs) / (1000 * 60 * 60));

  const breakHours =
    rawDurationHours * 60 >= workplace.breakThresholdMinutes
      ? workplace.breakMinutes / 60
      : 0;
  const paidHours = Math.max(0, rawDurationHours - breakHours);

  // 深夜時間（22:00-05:00 などの設定から計算）
  const nightHours = computeNightHours(
    shift.startAt,
    shift.endAt,
    workplace.nightStartHour,
    workplace.nightEndHour
  );
  const paidNightHours = Math.max(0, nightHours - breakHours / 2); // 休憩は半分が深夜帯と仮定（旧と同じく簡易）

  const basePay = paidHours * rate;
  const multiplier = Number(workplace.nightMultiplier);
  const nightPay = paidNightHours * rate * (multiplier - 1);
  const totalPay = Math.round(basePay + nightPay);

  return {
    rawDurationHours,
    breakHours,
    paidHours,
    nightHours,
    basePay: Math.round(basePay),
    nightPay: Math.round(nightPay),
    totalPay,
  };
}

// シフト期間と深夜帯（startHour..endHour、endHour < startHour なら日跨ぎ）の重なり時間
function computeNightHours(
  start: Date,
  end: Date,
  nightStartHour: number,
  nightEndHour: number
): number {
  let total = 0;
  const ms = 1000 * 60 * 60;
  // 1分単位でステップしてもよいが、各日の深夜帯と重ねるアプローチ
  const cursor = new Date(start);
  while (cursor < end) {
    // この cursor 日の深夜帯：当日 nightStartHour 〜 翌日 nightEndHour
    const dayStart = new Date(cursor);
    dayStart.setHours(nightStartHour, 0, 0, 0);
    const dayEnd = new Date(cursor);
    dayEnd.setDate(dayEnd.getDate() + 1);
    dayEnd.setHours(nightEndHour, 0, 0, 0);

    const overlapStart = Math.max(start.getTime(), dayStart.getTime());
    const overlapEnd = Math.min(end.getTime(), dayEnd.getTime());
    if (overlapEnd > overlapStart) {
      total += (overlapEnd - overlapStart) / ms;
    }
    // 次の日へ
    cursor.setDate(cursor.getDate() + 1);
    cursor.setHours(0, 0, 0, 0);
  }
  return total;
}
