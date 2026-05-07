import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { events } from '../src/db/schema.js';
import {
  bulkReplace,
  upsertOne,
  deleteOne,
} from '../src/services/source-sync-service.js';
import { resetDb, seedSourcesIfMissing } from './helpers/db.js';
import type { ImportEventInput } from '../src/validators/import-event.js';

beforeAll(async () => {
  await seedSourcesIfMissing();
});

beforeEach(async () => {
  await resetDb();
});

function makeEvent(overrides: Partial<ImportEventInput> = {}): ImportEventInput {
  return {
    source: 'study',
    source_event_id: 'math-1',
    title: '数学',
    start: '2026-05-05T01:00:00Z',
    end: '2026-05-05T02:30:00Z',
    all_day: false,
    ...overrides,
  };
}

describe('bulkReplace', () => {
  it('inserts new events', async () => {
    const result = await bulkReplace('study', [
      makeEvent({ source_event_id: 'a' }),
      makeEvent({ source_event_id: 'b', title: 'B' }),
    ]);
    expect(result).toEqual({ upserted: 2, deleted: 0 });

    const rows = await db.select().from(events);
    expect(rows).toHaveLength(2);
  });

  it('updates existing events on second call (idempotent on source_event_id)', async () => {
    await bulkReplace('study', [makeEvent({ source_event_id: 'a', title: 'Old' })]);
    await bulkReplace('study', [makeEvent({ source_event_id: 'a', title: 'New' })]);

    const rows = await db
      .select()
      .from(events)
      .where(and(eq(events.source, 'study'), isNull(events.deletedAt)));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toBe('New');
  });

  it('logically deletes events missing from new payload', async () => {
    await bulkReplace('study', [
      makeEvent({ source_event_id: 'a' }),
      makeEvent({ source_event_id: 'b' }),
    ]);
    const result = await bulkReplace('study', [makeEvent({ source_event_id: 'a' })]);

    expect(result).toEqual({ upserted: 1, deleted: 1 });

    const remaining = await db
      .select()
      .from(events)
      .where(and(eq(events.source, 'study'), isNull(events.deletedAt)));
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.sourceEventId).toBe('a');

    const allRows = await db.select().from(events);
    expect(allRows).toHaveLength(2);
    const deletedRow = allRows.find((r) => r.sourceEventId === 'b');
    expect(deletedRow?.deletedAt).not.toBeNull();
  });
});

describe('upsertOne', () => {
  it('inserts a new event', async () => {
    await upsertOne('shift', makeEvent({ source: 'shift', source_event_id: 's-1' }));
    const rows = await db.select().from(events);
    expect(rows).toHaveLength(1);
  });
});

describe('deleteOne', () => {
  it('logically deletes the event', async () => {
    await upsertOne('study', makeEvent({ source_event_id: 'a' }));
    const result = await deleteOne('study', 'a');
    expect(result).toEqual({ deleted: 1 });

    const row = (await db.select().from(events).where(eq(events.sourceEventId, 'a')))[0]!;
    expect(row.deletedAt).not.toBeNull();
  });

  it('returns 0 when event does not exist', async () => {
    const result = await deleteOne('study', 'missing');
    expect(result).toEqual({ deleted: 0 });
  });
});

describe('re-import after delete', () => {
  it('resurrects (does not duplicate) when bulkReplace re-adds a deleted source_event_id', async () => {
    await upsertOne('study', makeEvent({ source_event_id: 'r-1', title: '1' }));
    await deleteOne('study', 'r-1');
    await bulkReplace('study', [makeEvent({ source_event_id: 'r-1', title: '2' })]);

    const all = await db.select().from(events).where(eq(events.sourceEventId, 'r-1'));
    expect(all).toHaveLength(1);
    expect(all[0]!.deletedAt).toBeNull();
    expect(all[0]!.title).toBe('2');
  });

  it('resurrects when upsertOne re-adds a deleted source_event_id', async () => {
    await upsertOne('study', makeEvent({ source_event_id: 'r-2', title: '1' }));
    await deleteOne('study', 'r-2');
    await upsertOne('study', makeEvent({ source_event_id: 'r-2', title: '2' }));

    const all = await db.select().from(events).where(eq(events.sourceEventId, 'r-2'));
    expect(all).toHaveLength(1);
    expect(all[0]!.deletedAt).toBeNull();
    expect(all[0]!.title).toBe('2');
  });
});
