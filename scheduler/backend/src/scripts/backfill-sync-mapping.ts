/**
 * sync_mapping.google_event_id が空のレコードを GAS から取得した
 * Calendar イベント情報で埋め直す一回限りスクリプト。
 *
 * 突合キー: Calendar event の description 内 `schedule_mgr_id:<uuid>` ↔ events.id
 *
 * 実行: pnpm exec tsx --env-file=.env src/scripts/backfill-sync-mapping.ts
 *      DRY_RUN=1 を付けると更新せず件数だけ出す。
 */
import { eq, or, isNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { events, syncMapping } from '../db/schema.js';
import { fetchCalendarEvents } from '../sync/gas-client.js';

const DRY_RUN = process.env.DRY_RUN === '1';

async function main() {
  console.log(`[backfill] dry_run=${DRY_RUN}`);
  const res = await fetchCalendarEvents();
  if (!res.success) {
    console.error('[backfill] GAS fetch failed');
    process.exit(1);
  }
  console.log(`[backfill] fetched ${res.events.length} calendar events`);

  // schedule_mgr_id (= events.id) -> googleEventId のマップを構築
  const idToGoogleId = new Map<string, string>();
  let tagged = 0;
  for (const ev of res.events) {
    if (!ev.scheduleMgrId) continue;
    tagged++;
    // 重複時は最初に見つかったものを採用（dedup は別途）
    if (!idToGoogleId.has(ev.scheduleMgrId)) {
      idToGoogleId.set(ev.scheduleMgrId, ev.googleEventId);
    }
  }
  console.log(`[backfill] tagged events: ${tagged}, unique schedule_mgr_ids: ${idToGoogleId.size}`);

  // 空 mapping を取得
  const empties = await db
    .select({ eventId: syncMapping.eventId, googleCalendarId: syncMapping.googleCalendarId })
    .from(syncMapping)
    .where(or(eq(syncMapping.googleEventId, ''), isNull(syncMapping.googleEventId)));
  console.log(`[backfill] sync_mapping rows with empty google_event_id: ${empties.length}`);

  let matched = 0;
  let unmatched = 0;
  let updated = 0;
  for (const row of empties) {
    const gid = idToGoogleId.get(row.eventId);
    if (!gid) {
      unmatched++;
      continue;
    }
    matched++;
    if (DRY_RUN) continue;
    await db
      .update(syncMapping)
      .set({ googleEventId: gid, updatedAt: new Date() })
      .where(eq(syncMapping.eventId, row.eventId));
    await db
      .update(events)
      .set({ googleEventId: gid })
      .where(eq(events.id, row.eventId));
    updated++;
  }

  console.log(
    `[backfill] matched=${matched}, unmatched=${unmatched}, updated=${updated}`
  );
  if (unmatched > 0) {
    console.log(
      `[backfill] note: unmatched mappings have no Calendar event with their schedule_mgr_id tag.`
    );
    console.log(
      `[backfill] those were likely never created on Calendar (or already deleted manually).`
    );
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error('[backfill] failed:', err);
    process.exit(1);
  }
);
