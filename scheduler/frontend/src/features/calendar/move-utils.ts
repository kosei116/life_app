import type { Event } from '@life-app/types';
import { formatJst } from '../../lib/date-utils';

/**
 * 元のイベントの「JST での日付部分」を targetDay に差し替えた新しい start/end を返す。
 * 時刻部分・期間は保持する。終日イベントなら 00:00 起点で1日扱い。
 */
export function shiftEventToDay(event: Event, targetDay: Date): { start: string; end: string } {
  const targetDateStr = formatJst(targetDay, 'yyyy-MM-dd');

  if (event.all_day) {
    const startUtc = new Date(`${targetDateStr}T00:00:00+09:00`);
    const durationMs = new Date(event.end_at).getTime() - new Date(event.start_at).getTime();
    const endUtc = new Date(startUtc.getTime() + durationMs);
    return { start: startUtc.toISOString(), end: endUtc.toISOString() };
  }

  const startTimeStr = formatJst(event.start_at, 'HH:mm:ss');
  const newStart = new Date(`${targetDateStr}T${startTimeStr}+09:00`);
  const durationMs = new Date(event.end_at).getTime() - new Date(event.start_at).getTime();
  const newEnd = new Date(newStart.getTime() + durationMs);
  return { start: newStart.toISOString(), end: newEnd.toISOString() };
}
