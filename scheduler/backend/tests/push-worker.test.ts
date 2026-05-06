import { describe, it, expect, beforeAll, beforeEach, vi, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { events, syncQueue, syncMapping } from '../src/db/schema.js';
import { runPushOnce } from '../src/sync/push-worker.js';
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

function gasOk(body: unknown = { success: true }) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function insertManualEvent(startAt: Date, endAt: Date) {
  const [row] = await db
    .insert(events)
    .values({ source: 'manual', title: 'X', startAt, endAt })
    .returning();
  return row!;
}

describe('runPushOnce', () => {
  it('returns zero result when queue is empty', async () => {
    const r = await runPushOnce();
    expect(r).toEqual({ attempted: 0, succeeded: 0, failed: 0, skipped: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends upsert mutation and marks queue processed + writes mapping', async () => {
    const ev = await insertManualEvent(
      new Date(Date.now() + 24 * 3_600_000),
      new Date(Date.now() + 25 * 3_600_000)
    );
    await db.insert(syncQueue).values({ eventId: ev.id, operation: 'upsert' });
    fetchMock.mockResolvedValue(gasOk({ success: true, results: [{ id: ev.id }] }));

    const r = await runPushOnce();
    expect(r.succeeded).toBe(1);

    const [body] = fetchMock.mock.calls[0]!;
    expect(body).toBe('http://gas.test/exec');
    const payload = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(payload.action).toBe('mutations');
    expect(payload.upserts).toHaveLength(1);

    const queue = await db.select().from(syncQueue).where(eq(syncQueue.eventId, ev.id));
    expect(queue[0]!.processedAt).not.toBeNull();

    const map = await db.select().from(syncMapping).where(eq(syncMapping.eventId, ev.id));
    expect(map[0]!.tombstone).toBe(false);
    expect(map[0]!.lastPushedAt).not.toBeNull();
  });

  it('skips events outside sync window without calling GAS', async () => {
    const farPast = new Date(Date.now() - 365 * 24 * 3_600_000);
    const ev = await insertManualEvent(farPast, new Date(farPast.getTime() + 3_600_000));
    await db.insert(syncQueue).values({ eventId: ev.id, operation: 'upsert' });

    const r = await runPushOnce();
    expect(r.skipped).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();

    const queue = await db.select().from(syncQueue).where(eq(syncQueue.eventId, ev.id));
    expect(queue[0]!.processedAt).not.toBeNull();
  });

  it('marks tombstone on delete operation', async () => {
    const ev = await insertManualEvent(
      new Date(Date.now() + 24 * 3_600_000),
      new Date(Date.now() + 25 * 3_600_000)
    );
    await db.insert(syncMapping).values({
      eventId: ev.id,
      googleEventId: 'g-123',
      googleCalendarId: 'primary',
      tombstone: false,
    });
    await db.insert(syncQueue).values({ eventId: ev.id, operation: 'delete' });
    fetchMock.mockResolvedValue(gasOk());

    const r = await runPushOnce();
    expect(r.succeeded).toBe(1);

    const map = await db.select().from(syncMapping).where(eq(syncMapping.eventId, ev.id));
    expect(map[0]!.tombstone).toBe(true);
  });

  it('skips delete when no mapping exists', async () => {
    const ev = await insertManualEvent(new Date(), new Date(Date.now() + 3_600_000));
    await db.insert(syncQueue).values({ eventId: ev.id, operation: 'delete' });

    const r = await runPushOnce();
    expect(r.skipped).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retries with backoff on 5xx; gives up on 4xx', async () => {
    const ev = await insertManualEvent(
      new Date(Date.now() + 24 * 3_600_000),
      new Date(Date.now() + 25 * 3_600_000)
    );
    await db.insert(syncQueue).values({ eventId: ev.id, operation: 'upsert' });
    fetchMock.mockResolvedValue(new Response('boom', { status: 500 }));

    const r1 = await runPushOnce();
    expect(r1.failed).toBe(1);
    let queue = await db.select().from(syncQueue).where(eq(syncQueue.eventId, ev.id));
    expect(queue[0]!.processedAt).toBeNull();
    expect(queue[0]!.retryCount).toBe(1);

    fetchMock.mockResolvedValue(new Response('bad', { status: 400 }));
    // make next attempt eligible immediately
    await db
      .update(syncQueue)
      .set({ scheduledAt: new Date(Date.now() - 1000) })
      .where(eq(syncQueue.eventId, ev.id));
    await runPushOnce();
    queue = await db.select().from(syncQueue).where(eq(syncQueue.eventId, ev.id));
    expect(queue[0]!.processedAt).not.toBeNull();
  });
});
