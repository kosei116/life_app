export function pad(n: number): string { return n.toString().padStart(2, '0'); }
export function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function ymdHm(d: Date): string {
  return `${ymd(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function yenFormat(n: number): string {
  return `¥${n.toLocaleString()}`;
}
export function jsDayMon0(d: Date): number {
  return (d.getDay() + 6) % 7;
}
// JST 想定: ローカル時刻の "YYYY-MM-DDTHH:MM" を Date に
export function localDateTimeToDate(s: string): Date {
  return new Date(s);
}
// Date → "YYYY-MM-DDTHH:MM" (datetime-local input 用)
export function dateToLocalInput(d: Date): string {
  return `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
