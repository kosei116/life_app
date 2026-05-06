import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { events, syncMapping } from '../src/db/schema.js';
import { runPullOnce } from '../src/sync/pull-worker.js';
import { resetDb, seedSourcesIfMissing } from './helpers/db.js';

const ORIGINAL_FETCH = globalThis.fetch;
const fetchMock = vi.fn();

beforeAll(async () => {
  await seedSourcesIfMissing();
  process.env.GAS_WEBAPP_URL = 'http://gas.test/exec';
  await db.execute(
    // ensure 'google' source exists for inserts
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    (await import('drizzle-orm')).sql`INSERT INTO sources (id, name, color, priority) VALUES ('google', 'Google', '#DB4437', 9) ON CONFLICT DO NOTHING`
  );
});

beforeEach(async () => {
  await resetDb();
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

function gasFetchOk(items: Array<Partial<{
  scheduleMgrId: string | null;
  googleEventId: string;
  title: string;
  description: string;
  location: string;
  allDay: boolean;
  startDateTime: string;
  endDateTime: string;
  lastUpdated: string | null;
  reminderMinutes: number | null;
}>>) {
  return new Response(
    JSON.stringify({
      success: true,
      fetchedAt: new Date().toISOString(),
      range: { start: '', end: '' },
      events: items.map((i) => ({
        scheduleMgrId: null,
        googleEventId: 'g-' + Math.random(),
        title: 'X',
        description: '',
        location: '',
        allDay: false,
        startDateTime: '2026-05-10T01:00:00Z',
        endDateTime: '2026-05-10T02:00:00Z',
        lastUpdated: null,
        reminderMinutes: null,
        ...i,
      })),
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

describe('runPullOnce', () => {
  it('creates new google-source events for tag-less Calendar events', async () => {
    fetchMock.mockResolvedValue(
      gasFetchOk([{ googleEventId: 'g-1', title: 'External' }])
    );
    const r = await runPullOnce();
    expect(r.created).toBe(1);

    const rows = await db
      .select()
      .from(events)
      .where(and(eq(events.source, 'google'), isNull(events.deletedAt)));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toBe('External');
  });

  it('skips events created by the app (has scheduleMgrId tag)', async () => {
    const fakeId = '11111111-2222-3333-4444-555555555555';
    fetchMock.mockResolvedValue(
      gasFetchOk([{ googleEventId: 'g-2', scheduleMgrId: fakeId, title: 'AppOwned' }])
    );
    const r = await runPullOnce();
    expect(r.created).toBe(0);
    expect(r.skipped).toBe(1);
  });

  it('skips tombstoned mappings (deleted by app)', async () => {
    const [ev] = await db
      .insert(events)
      .values({
        source: 'manual',
        title: 'gone',
        startAt: new Date(),
        endAt: new Date(Date.now() + 3_600_000),
        deletedAt: new Date(),
      })
      .returning();
    await db.insert(syncMapping).values({
      eventId: ev!.id,
      googleEventId: 'g-tomb',
      googleCalendarId: 'primary',
      tombstone: true,
    });

    fetchMock.mockResolvedValue(
      gasFetchOk([{ googleEventId: 'g-tomb', scheduleMgrId: ev!.id, title: 'ghost' }])
    );
    const r = await runPullOnce();
    expect(r.created).toBe(0);
    expect(r.skipped).toBe(1);
  });

  it('updates existing google-source event', async () => {
    fetchMock.mockResolvedValue(
      gasFetchOk([{ googleEventId: 'g-3', title: 'first' }])
    );
    await runPullOnce();

    fetchMock.mockResolvedValue(
      gasFetchOk([{ googleEventId: 'g-3', title: 'updated' }])
    );
    const r = await runPullOnce();
    expect(r.updated).toBe(1);

    const rows = await db
      .select()
      .from(events)
      .where(eq(events.source, 'google'));
    expect(rows[0]!.title).toBe('updated');
  });

});
