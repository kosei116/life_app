import { and, eq, gte, isNull, lt, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { events, eventOverrides } from '../db/schema.js';
import type { EventRow } from '../db/schema.js';
import type {
  CreateEventInput,
  UpdateEventInput,
  EventOverrideInput,
  EditScope,
} from '../validators/event-input.js';

export type EventDto = {
  id: string;
  source: string;
  source_event_id: string | null;
  title: string;
  start_at: string;
  end_at: string;
  all_day: boolean;
  location: string | null;
  description: string | null;
  category: string | null;
  color: string | null;
  reminders: number[];
  metadata: EventRow['metadata'];
  recurrence_group_id: string | null;
  recurrence_index: number | null;
  google_event_id: string | null;
  created_at: string;
  updated_at: string;
  override: {
    hidden: boolean | null;
    color_override: string | null;
    note: string | null;
  } | null;
};

type OverrideShape = {
  hidden: boolean | null;
  colorOverride: string | null;
  note: string | null;
} | null;

function toDto(row: EventRow, override: OverrideShape = null): EventDto {
  return {
    id: row.id,
    source: row.source,
    source_event_id: row.sourceEventId,
    title: row.title,
    start_at: row.startAt.toISOString(),
    end_at: row.endAt.toISOString(),
    all_day: row.allDay,
    location: row.location,
    description: row.description,
    category: row.category,
    color: row.color,
    reminders: (row.reminders ?? []) as number[],
    metadata: row.metadata,
    recurrence_group_id: row.recurrenceGroupId,
    recurrence_index: row.recurrenceIndex,
    google_event_id: row.googleEventId,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    override: override
      ? {
          hidden: override.hidden,
          color_override: override.colorOverride,
          note: override.note,
        }
      : null,
  };
}

export async function listEventsInRange(from: Date, to: Date): Promise<EventDto[]> {
  const rows = await db
    .select({ event: events, override: eventOverrides })
    .from(events)
    .leftJoin(eventOverrides, eq(eventOverrides.eventId, events.id))
    .where(and(isNull(events.deletedAt), lt(events.startAt, to), gte(events.endAt, from)))
    .orderBy(events.startAt);
  return rows.map((r) => toDto(r.event, r.override));
}

export async function getEventById(id: string): Promise<EventDto | null> {
  const rows = await db
    .select({ event: events, override: eventOverrides })
    .from(events)
    .leftJoin(eventOverrides, eq(eventOverrides.eventId, events.id))
    .where(and(eq(events.id, id), isNull(events.deletedAt)))
    .limit(1);
  return rows[0] ? toDto(rows[0].event, rows[0].override) : null;
}

const DAY_MS = 86_400_000;
const JST_OFFSET_MS = 9 * 3_600_000;

function jstWeekday(d: Date): number {
  return new Date(d.getTime() + JST_OFFSET_MS).getUTCDay();
}

type RecurrenceSpec =
  | { freq: 'daily'; count?: number; until?: Date }
  | { freq: 'weekly'; weekdays: number[]; count?: number; until?: Date }
  | { freq: 'monthly'; count?: number; until?: Date };

const MAX_OCCURRENCES = 520;

function addMonthsJst(d: Date, n: number): Date | null {
  const j = new Date(d.getTime() + JST_OFFSET_MS);
  const y = j.getUTCFullYear();
  const m = j.getUTCMonth();
  const day = j.getUTCDate();
  const totalMonths = m + n;
  const newY = y + Math.floor(totalMonths / 12);
  const newM = ((totalMonths % 12) + 12) % 12;
  const candidateJst = Date.UTC(
    newY,
    newM,
    day,
    j.getUTCHours(),
    j.getUTCMinutes(),
    j.getUTCSeconds(),
    j.getUTCMilliseconds()
  );
  const verify = new Date(candidateJst);
  if (verify.getUTCMonth() !== newM || verify.getUTCDate() !== day) return null;
  return new Date(candidateJst - JST_OFFSET_MS);
}

function expandRecurrence(
  start: Date,
  end: Date,
  spec: RecurrenceSpec
): { start: Date; end: Date }[] {
  const duration = end.getTime() - start.getTime();
  const out: { start: Date; end: Date }[] = [];
  const push = (s: Date) => out.push({ start: s, end: new Date(s.getTime() + duration) });
  const limit = spec.count ?? MAX_OCCURRENCES;

  if (spec.freq === 'daily') {
    for (let i = 0; out.length < limit; i++) {
      const cand = new Date(start.getTime() + i * DAY_MS);
      if (spec.until && cand.getTime() > spec.until.getTime()) break;
      push(cand);
      if (i > MAX_OCCURRENCES) break;
    }
    return out;
  }

  if (spec.freq === 'weekly') {
    const maxIterations = 365 * 5;
    for (let i = 0; i <= maxIterations && out.length < limit; i++) {
      const cand = new Date(start.getTime() + i * DAY_MS);
      if (spec.until && cand.getTime() > spec.until.getTime()) break;
      if (spec.weekdays.includes(jstWeekday(cand))) push(cand);
    }
    return out;
  }

  // monthly: same day-of-month in JST; skip months without that day
  for (let i = 0; out.length < limit; i++) {
    if (i > MAX_OCCURRENCES * 2) break; // safety against pathological skipping
    const cand = addMonthsJst(start, i);
    if (!cand) continue;
    if (spec.until && cand.getTime() > spec.until.getTime()) break;
    push(cand);
  }
  return out;
}

/**
 * 手動イベントを作成。recurrence 指定時は N 行をバルク INSERT し
 * recurrence_group_id を共有する。各行に対し sync_queue (upsert) を投入。
 */
export async function createManualEvent(input: CreateEventInput): Promise<EventDto[]> {
  const startDate = new Date(input.start);
  const endDate = new Date(input.end);

  const recurrence = input.recurrence;
  const occurrences = recurrence
    ? expandRecurrence(startDate, endDate, {
        ...recurrence,
        until: recurrence.until ? new Date(recurrence.until) : undefined,
      } as RecurrenceSpec)
    : [{ start: startDate, end: endDate }];

  if (occurrences.length === 0) {
    throw new Error('Recurrence produced zero occurrences');
  }

  return db.transaction(async (tx) => {
    const groupId = input.recurrence ? crypto.randomUUID() : null;
    const rows = occurrences.map((occ, idx) => ({
      source: 'manual',
      sourceEventId: null,
      title: input.title,
      startAt: occ.start,
      endAt: occ.end,
      allDay: input.all_day,
      location: input.location ?? null,
      description: input.description ?? null,
      category: input.category ?? null,
      color: input.color ?? null,
      reminders: input.reminders ?? [],
      recurrenceGroupId: groupId,
      recurrenceIndex: groupId ? idx : null,
    }));
    const inserted = await tx.insert(events).values(rows).returning();
    return inserted.map((row) => toDto(row));
  });
}

function buildScopeCondition(target: EventRow, scope: EditScope) {
  if (target.recurrenceGroupId === null || scope === 'this') {
    return eq(events.id, target.id);
  }
  if (scope === 'all') {
    return eq(events.recurrenceGroupId, target.recurrenceGroupId);
  }
  return and(
    eq(events.recurrenceGroupId, target.recurrenceGroupId),
    gte(events.recurrenceIndex, target.recurrenceIndex ?? 0)
  )!;
}

/**
 * イベントを更新。manual と google は編集可、それ以外のインポート系は READONLY。
 */
export async function updateEvent(
  id: string,
  input: UpdateEventInput
): Promise<{ updated: number; ids: string[] } | { error: 'NOT_FOUND' | 'READONLY' }> {
  return db.transaction(async (tx) => {
    const found = await tx
      .select()
      .from(events)
      .where(and(eq(events.id, id), isNull(events.deletedAt)))
      .limit(1);
    if (found.length === 0) return { error: 'NOT_FOUND' as const };
    const target = found[0]!;

    if (target.source !== 'manual' && target.source !== 'google') {
      return { error: 'READONLY' as const };
    }

    const scope = input.scope ?? 'this';
    const cond = buildScopeCondition(target, scope);

    const setValues: Partial<EventRow> = { updatedAt: new Date() };
    if (input.title !== undefined) setValues.title = input.title;
    if (input.start !== undefined) setValues.startAt = new Date(input.start);
    if (input.end !== undefined) setValues.endAt = new Date(input.end);
    if (input.all_day !== undefined) setValues.allDay = input.all_day;
    if (input.location !== undefined) setValues.location = input.location;
    if (input.description !== undefined) setValues.description = input.description;
    if (input.category !== undefined) setValues.category = input.category;
    if (input.color !== undefined) setValues.color = input.color;
    if (input.reminders !== undefined) setValues.reminders = input.reminders;

    const updated = await tx
      .update(events)
      .set(setValues)
      .where(cond)
      .returning({ id: events.id });

    return { updated: updated.length, ids: updated.map((r) => r.id) };
  });
}

/**
 * イベントを削除 (論理削除 + sync_queue.delete)。scope で繰り返し範囲を指定。
 */
export async function deleteEvent(
  id: string,
  scope: EditScope = 'this'
): Promise<{ deleted: number } | { error: 'NOT_FOUND' }> {
  return db.transaction(async (tx) => {
    const found = await tx
      .select()
      .from(events)
      .where(and(eq(events.id, id), isNull(events.deletedAt)))
      .limit(1);
    if (found.length === 0) return { error: 'NOT_FOUND' as const };
    const target = found[0]!;
    const cond = buildScopeCondition(target, scope);

    const deleted = await tx
      .update(events)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(cond)
      .returning({ id: events.id });

    return { deleted: deleted.length };
  });
}

/**
 * event_overrides に upsert (1イベントにつき1行)。
 */
export async function upsertOverride(
  eventId: string,
  input: EventOverrideInput
): Promise<{ ok: true } | { error: 'NOT_FOUND' }> {
  const target = await db
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.id, eventId), isNull(events.deletedAt)))
    .limit(1);
  if (target.length === 0) return { error: 'NOT_FOUND' as const };

  await db
    .insert(eventOverrides)
    .values({
      eventId,
      hidden: input.hidden ?? null,
      colorOverride: input.color_override ?? null,
      note: input.note ?? null,
    })
    .onConflictDoUpdate({
      target: eventOverrides.eventId,
      set: {
        hidden: input.hidden ?? null,
        colorOverride: input.color_override ?? null,
        note: input.note ?? null,
        updatedAt: new Date(),
      },
    });
  return { ok: true };
}
