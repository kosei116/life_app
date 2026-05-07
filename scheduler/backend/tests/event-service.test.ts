import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { events, eventOverrides } from '../src/db/schema.js';
import {
  createManualEvent,
  updateEvent,
  deleteEvent,
  upsertOverride,
  listEventsInRange,
} from '../src/services/event-service.js';
import { bulkReplace } from '../src/services/source-sync-service.js';
import { resetDb, seedSourcesIfMissing } from './helpers/db.js';

beforeAll(async () => {
  await seedSourcesIfMissing();
});

beforeEach(async () => {
  await resetDb();
});

describe('createManualEvent', () => {
  it('creates a single event without recurrence', async () => {
    const created = await createManualEvent({
      title: 'Solo',
      start: '2026-05-05T01:00:00Z',
      end: '2026-05-05T02:00:00Z',
      all_day: false,
    });
    expect(created).toHaveLength(1);
    expect(created[0]!.source).toBe('manual');
    expect(created[0]!.recurrence_group_id).toBeNull();
  });

  it('expands weekly recurrence with count', async () => {
    // 2026-05-05 is Tuesday (JST weekday 2)
    const created = await createManualEvent({
      title: 'Weekly',
      start: '2026-05-05T01:00:00Z',
      end: '2026-05-05T02:00:00Z',
      all_day: false,
      recurrence: { freq: 'weekly', weekdays: [2], count: 4 },
    });
    expect(created).toHaveLength(4);
    const groupId = created[0]!.recurrence_group_id;
    expect(groupId).not.toBeNull();
    expect(created.every((e) => e.recurrence_group_id === groupId)).toBe(true);
    expect(created.map((e) => e.recurrence_index)).toEqual([0, 1, 2, 3]);

    const days = created.map((e) => new Date(e.start_at).toISOString().slice(0, 10));
    expect(days).toEqual(['2026-05-05', '2026-05-12', '2026-05-19', '2026-05-26']);
  });

  it('expands daily recurrence with count', async () => {
    const created = await createManualEvent({
      title: 'Daily',
      start: '2026-05-05T01:00:00Z',
      end: '2026-05-05T02:00:00Z',
      all_day: false,
      recurrence: { freq: 'daily', count: 5 },
    });
    expect(created).toHaveLength(5);
    const days = created.map((e) => new Date(e.start_at).toISOString().slice(0, 10));
    expect(days).toEqual([
      '2026-05-05',
      '2026-05-06',
      '2026-05-07',
      '2026-05-08',
      '2026-05-09',
    ]);
  });

  it('expands monthly recurrence with count (same day-of-month JST)', async () => {
    // 2026-05-03 JST 10:00 = 2026-05-03T01:00:00Z
    const created = await createManualEvent({
      title: 'Monthly',
      start: '2026-05-03T01:00:00Z',
      end: '2026-05-03T02:00:00Z',
      all_day: false,
      recurrence: { freq: 'monthly', count: 4 },
    });
    expect(created).toHaveLength(4);
    const days = created.map((e) => new Date(e.start_at).toISOString().slice(0, 10));
    expect(days).toEqual(['2026-05-03', '2026-06-03', '2026-07-03', '2026-08-03']);
  });

  it('skips months without the start day-of-month for monthly', async () => {
    // 2026-01-31 JST -> Feb has no 31 -> skip
    const created = await createManualEvent({
      title: 'M31',
      start: '2026-01-30T15:00:00Z', // 2026-01-31 00:00 JST
      end: '2026-01-30T16:00:00Z',
      all_day: false,
      recurrence: { freq: 'monthly', count: 3 },
    });
    expect(created).toHaveLength(3);
    const days = created.map((e) =>
      new Date(new Date(e.start_at).getTime() + 9 * 3600_000).toISOString().slice(0, 10)
    );
    // Feb skipped (no 31), Apr skipped (no 31)
    expect(days).toEqual(['2026-01-31', '2026-03-31', '2026-05-31']);
  });

  it('expands recurrence with multiple weekdays', async () => {
    // Tue start, weekdays=[1,3] (Mon,Wed), count=4
    // From 2026-05-05 Tue, day0=Tue (skip), day1=Wed (5/6), day2=Thu, ... day6=Mon (5/11), day8=Wed (5/13), ...
    const created = await createManualEvent({
      title: 'MW',
      start: '2026-05-05T01:00:00Z',
      end: '2026-05-05T02:00:00Z',
      all_day: false,
      recurrence: { freq: 'weekly', weekdays: [1, 3], count: 4 },
    });
    expect(created).toHaveLength(4);
    const days = created.map((e) => new Date(e.start_at).toISOString().slice(0, 10));
    expect(days).toEqual(['2026-05-06', '2026-05-11', '2026-05-13', '2026-05-18']);
  });
});

describe('updateEvent', () => {
  it('updates a manual event (this only)', async () => {
    const [ev] = await createManualEvent({
      title: 'Old',
      start: '2026-05-05T01:00:00Z',
      end: '2026-05-05T02:00:00Z',
      all_day: false,
    });
    const result = await updateEvent(ev!.id, { title: 'New' });
    expect(result).toEqual({ updated: 1, ids: [ev!.id] });
    const after = (await db.select().from(events).where(eq(events.id, ev!.id)))[0]!;
    expect(after.title).toBe('New');
  });

  it('updates this_and_future scope for recurrence group', async () => {
    const created = await createManualEvent({
      title: 'Series',
      start: '2026-05-05T01:00:00Z',
      end: '2026-05-05T02:00:00Z',
      all_day: false,
      recurrence: { freq: 'weekly', weekdays: [2], count: 4 },
    });
    const result = await updateEvent(created[2]!.id, { title: 'Renamed', scope: 'this_and_future' });
    expect(result).toEqual({ updated: 2, ids: expect.any(Array) });

    const all = await db.select().from(events).orderBy(events.recurrenceIndex);
    expect(all[0]!.title).toBe('Series');
    expect(all[1]!.title).toBe('Series');
    expect(all[2]!.title).toBe('Renamed');
    expect(all[3]!.title).toBe('Renamed');
  });

  it('rejects edit on imported events (readonly)', async () => {
    await bulkReplace('study', [
      {
        source: 'study',
        source_event_id: 's-1',
        title: 'Imported',
        start: '2026-05-05T01:00:00Z',
        end: '2026-05-05T02:00:00Z',
        all_day: false,
      },
    ]);
    const ev = (await db.select().from(events).where(eq(events.source, 'study')))[0]!;
    const result = await updateEvent(ev.id, { title: 'Hacked' });
    expect(result).toEqual({ error: 'READONLY' });
  });
});

describe('deleteEvent', () => {
  it('deletes only this for default scope', async () => {
    const created = await createManualEvent({
      title: 'Series',
      start: '2026-05-05T01:00:00Z',
      end: '2026-05-05T02:00:00Z',
      all_day: false,
      recurrence: { freq: 'weekly', weekdays: [2], count: 3 },
    });
    const result = await deleteEvent(created[1]!.id);
    expect(result).toEqual({ deleted: 1 });

    const remaining = await db.select().from(events).where(isNull(events.deletedAt));
    expect(remaining).toHaveLength(2);
  });

  it('deletes all for recurrence group when scope=all', async () => {
    const created = await createManualEvent({
      title: 'Series',
      start: '2026-05-05T01:00:00Z',
      end: '2026-05-05T02:00:00Z',
      all_day: false,
      recurrence: { freq: 'weekly', weekdays: [2], count: 4 },
    });
    const result = await deleteEvent(created[2]!.id, 'all');
    expect(result).toEqual({ deleted: 4 });
    const remaining = await db.select().from(events).where(isNull(events.deletedAt));
    expect(remaining).toHaveLength(0);
  });

  it('deletes this_and_future for recurrence', async () => {
    const created = await createManualEvent({
      title: 'Series',
      start: '2026-05-05T01:00:00Z',
      end: '2026-05-05T02:00:00Z',
      all_day: false,
      recurrence: { freq: 'weekly', weekdays: [2], count: 4 },
    });
    const result = await deleteEvent(created[1]!.id, 'this_and_future');
    expect(result).toEqual({ deleted: 3 });
  });
});

describe('upsertOverride', () => {
  it('creates override row', async () => {
    const [ev] = await createManualEvent({
      title: 'X',
      start: '2026-05-05T01:00:00Z',
      end: '2026-05-05T02:00:00Z',
      all_day: false,
    });
    const result = await upsertOverride(ev!.id, { hidden: true, color_override: '#FF0000' });
    expect(result).toEqual({ ok: true });
    const overrides = await db.select().from(eventOverrides);
    expect(overrides).toHaveLength(1);
    expect(overrides[0]!.hidden).toBe(true);
    expect(overrides[0]!.colorOverride).toBe('#FF0000');
  });

  it('updates existing override', async () => {
    const [ev] = await createManualEvent({
      title: 'X',
      start: '2026-05-05T01:00:00Z',
      end: '2026-05-05T02:00:00Z',
      all_day: false,
    });
    await upsertOverride(ev!.id, { hidden: true });
    await upsertOverride(ev!.id, { hidden: false, note: 'memo' });
    const overrides = await db.select().from(eventOverrides);
    expect(overrides).toHaveLength(1);
    expect(overrides[0]!.hidden).toBe(false);
    expect(overrides[0]!.note).toBe('memo');
  });
});

describe('listEventsInRange', () => {
  it('returns only non-deleted events overlapping the range', async () => {
    await createManualEvent({
      title: 'In',
      start: '2026-05-05T01:00:00Z',
      end: '2026-05-05T02:00:00Z',
      all_day: false,
    });
    const [outOfRange] = await createManualEvent({
      title: 'Out',
      start: '2026-08-05T01:00:00Z',
      end: '2026-08-05T02:00:00Z',
      all_day: false,
    });
    expect(outOfRange).toBeDefined();

    const result = await listEventsInRange(
      new Date('2026-05-01T00:00:00Z'),
      new Date('2026-05-31T23:59:59Z')
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.title).toBe('In');
  });
});
