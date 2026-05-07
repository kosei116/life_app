import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { events, syncMapping } from '../src/db/schema.js';
import { runSync } from '../src/sync/run-sync.js';
import { resetDb, seedSourcesIfMissing } from './helpers/db.js';

const ORIGINAL_FETCH = globalThis.fetch;
const fetchMock = vi.fn();

beforeAll(async () => {
  await seedSourcesIfMissing();
  process.env.GAS_WEBAPP_URL = 'http://gas.test/exec';
});

beforeEach(async () => {
  await resetDb();
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

function gasOk(body: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ success: true, ...body }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function insertManualEvent(opts: { title?: string; daysFromNow?: number } = {}) {
  const start = new Date(Date.now() + (opts.daysFromNow ?? 1) * 24 * 3_600_000);
  const end = new Date(start.getTime() + 60 * 60_000);
  const [row] = await db
    .insert(events)
    .values({
      source: 'manual',
      title: opts.title ?? 'X',
      startAt: start,
      endAt: end,
    })
    .returning();
  return row!;
}

describe('runSync', () => {
  it('does nothing when there are no events', async () => {
    const r = await runSync();
    expect(r.scanned).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('inserts event with no mapping → sends upsert and writes mapping with content_hash', async () => {
    const ev = await insertManualEvent({ title: 'New' });
    fetchMock.mockResolvedValue(
      gasOk({ results: [{ id: ev.id, googleEventId: 'gcal-1' }] })
    );

    const r = await runSync();
    expect(r.inserted).toBe(1);
    expect(r.updated).toBe(0);

    const map = (await db.select().from(syncMapping).where(eq(syncMapping.eventId, ev.id)))[0]!;
    expect(map.googleEventId).toBe('gcal-1');
    expect(map.contentHash).toBeTruthy();
    expect(map.lastPushedAt).not.toBeNull();
  });

  it('skips events whose hash matches the stored mapping (no GAS call)', async () => {
    const ev = await insertManualEvent({ title: 'Stable' });
    // 1 回目: insert
    fetchMock.mockResolvedValue(
      gasOk({ results: [{ id: ev.id, googleEventId: 'gcal-1' }] })
    );
    await runSync();
    fetchMock.mockReset();

    // 2 回目: イベントは何も変わってない → GAS 呼ばれない
    const r2 = await runSync();
    expect(r2.inserted).toBe(0);
    expect(r2.updated).toBe(0);
    expect(r2.skipped).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('detects content change → sends update', async () => {
    const ev = await insertManualEvent({ title: 'Old' });
    fetchMock.mockResolvedValue(
      gasOk({ results: [{ id: ev.id, googleEventId: 'gcal-1' }] })
    );
    await runSync();

    await db.update(events).set({ title: 'New', updatedAt: new Date() }).where(eq(events.id, ev.id));

    fetchMock.mockReset();
    fetchMock.mockResolvedValue(
      gasOk({ results: [{ id: ev.id, googleEventId: 'gcal-1' }] })
    );
    const r = await runSync();
    expect(r.updated).toBe(1);

    const sentBody = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(sentBody.upserts).toHaveLength(1);
    expect(sentBody.upserts[0].title).toBe('New');
    expect(sentBody.upserts[0].googleEventId).toBe('gcal-1');
  });

  it('sends delete when event is logically deleted and mapping not yet tombstoned', async () => {
    const ev = await insertManualEvent();
    fetchMock.mockResolvedValue(
      gasOk({ results: [{ id: ev.id, googleEventId: 'gcal-1' }] })
    );
    await runSync();

    await db.update(events).set({ deletedAt: new Date() }).where(eq(events.id, ev.id));

    fetchMock.mockReset();
    fetchMock.mockResolvedValue(gasOk({ results: [] }));
    const r = await runSync();
    expect(r.deleted).toBe(1);

    const sentBody = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(sentBody.deletes).toHaveLength(1);
    expect(sentBody.deletes[0].googleEventId).toBe('gcal-1');

    const map = (await db.select().from(syncMapping).where(eq(syncMapping.eventId, ev.id)))[0]!;
    expect(map.tombstone).toBe(true);
  });

  it('does not push events outside the sync window', async () => {
    const longAgo = new Date(Date.now() - 365 * 24 * 3_600_000);
    await db
      .insert(events)
      .values({ source: 'manual', title: 'Old', startAt: longAgo, endAt: new Date(longAgo.getTime() + 3_600_000) });

    const r = await runSync();
    expect(r.scanned).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps content_hash unchanged on transient failure (will retry next time)', async () => {
    const ev = await insertManualEvent({ title: 'Try' });
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: false, message: 'down' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const r = await runSync();
    expect(r.failedTransient).toBe(1);

    const map = await db.select().from(syncMapping).where(eq(syncMapping.eventId, ev.id));
    expect(map).toHaveLength(0); // mapping not created → next sync retries
  });

  it('marks permanent error as resolved (content_hash matched, no future retry)', async () => {
    const ev = await insertManualEvent({ title: 'Recurring' });
    fetchMock.mockResolvedValue(
      gasOk({
        results: [],
        errors: [{ id: ev.id, reason: 'recurring_master' }],
      })
    );
    const r = await runSync();
    expect(r.failedPermanent).toBe(1);

    const map = (await db.select().from(syncMapping).where(eq(syncMapping.eventId, ev.id)))[0]!;
    expect(map.contentHash).toBeTruthy();

    // 次回 sync では hash 一致で skip されるはず
    fetchMock.mockReset();
    const r2 = await runSync();
    expect(r2.skipped).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
