import { and, lt, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { events, syncMapping } from '../db/schema.js';

const PAST_LIMIT_MS = 30 * 24 * 3_600_000;

/**
 * 同期窓 (-1month) より古い tombstone をクリーンアップ。
 * 物理削除済み + 1ヶ月以上前 → sync_mapping から削除しても復活する余地はない。
 */
export async function runWindowBatch(): Promise<{ removed: number }> {
  const cutoff = new Date(Date.now() - PAST_LIMIT_MS);
  const stale = await db
    .select({ eventId: syncMapping.eventId })
    .from(syncMapping)
    .innerJoin(events, eq(events.id, syncMapping.eventId))
    .where(and(eq(syncMapping.tombstone, true), lt(events.endAt, cutoff)));

  if (stale.length === 0) return { removed: 0 };

  for (const row of stale) {
    await db.delete(syncMapping).where(eq(syncMapping.eventId, row.eventId));
  }
  return { removed: stale.length };
}
