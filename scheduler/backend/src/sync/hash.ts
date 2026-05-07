import { createHash } from 'node:crypto';
import type { EventRow } from '../db/schema.js';

/**
 * イベント内容のハッシュ。Google Calendar に push する全フィールドを安定順序で結合して SHA-1。
 * 計算順や reminders 配列の並びは入力に依存。reminders は number[] なので
 * 並びがブレることは現状無いが、念のためソートしてから join する。
 */
export function eventContentHash(ev: {
  title: string;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  location: string | null;
  description: string | null;
  reminders: number[] | null;
}): string {
  const reminders = (ev.reminders ?? []).slice().sort((a, b) => a - b).join(',');
  const parts = [
    ev.title,
    ev.startAt.toISOString(),
    ev.endAt.toISOString(),
    ev.allDay ? '1' : '0',
    ev.location ?? '',
    ev.description ?? '',
    reminders,
  ].join('\x1f'); // ASCII unit separator
  return createHash('sha1').update(parts).digest('hex');
}

export function rowContentHash(ev: EventRow): string {
  return eventContentHash({
    title: ev.title,
    startAt: ev.startAt,
    endAt: ev.endAt,
    allDay: ev.allDay,
    location: ev.location,
    description: ev.description,
    reminders: ev.reminders,
  });
}
