import { formatInTimeZone, toZonedTime, fromZonedTime } from 'date-fns-tz';
import {
  addDays,
  addMonths,
  addWeeks,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  startOfDay,
  endOfDay,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
} from 'date-fns';

export const TZ = 'Asia/Tokyo';

export const formatJst = (date: Date | string, fmt: string): string =>
  formatInTimeZone(typeof date === 'string' ? new Date(date) : date, TZ, fmt);

export const toJstDate = (date: Date | string): Date =>
  toZonedTime(typeof date === 'string' ? new Date(date) : date, TZ);

export const jstToUtc = (date: Date): Date => fromZonedTime(date, TZ);

export function getMonthGridDays(anchor: Date): Date[] {
  const monthStart = startOfMonth(anchor);
  const monthEnd = endOfMonth(anchor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  return eachDayOfInterval({ start: gridStart, end: gridEnd });
}

export function jstStartOfDayUtc(day: Date): Date {
  return fromZonedTime(startOfDay(toZonedTime(day, TZ)), TZ);
}

export function getWeekDays(anchor: Date): Date[] {
  const start = startOfWeek(anchor, { weekStartsOn: 0 });
  const end = endOfWeek(anchor, { weekStartsOn: 0 });
  return eachDayOfInterval({ start, end });
}

export { addDays, addMonths, addWeeks, startOfDay, endOfDay, isSameDay, isSameMonth };
