import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';

const PAST_LIMIT_MS = 30 * 24 * 3_600_000; // 1 month
const FUTURE_LIMIT_MS = 6 * 30 * 24 * 3_600_000; // 6 months

export interface ReconcileResult {
  enqueuedUpserts: number;
  enqueuedDeletes: number;
}

/**
 * カレンダーに「あるべき」状態と「今 push 済み」状態の差分を sync_queue に積む。
 * - 同期 window 内 (-1月〜+6月) のみ対象
 * - source='google' は読み取り専用なので push しない
 * - 既に未処理 queue にあるものは重複させない
 *
 * 対象:
 *  upsert:
 *   (a) 生存イベントで sync_mapping が無い
 *   (b) sync_mapping.google_event_id が空（旧バグ残骸 / backfill 漏れ）
 *   (c) events.updated_at > sync_mapping.last_pushed_at
 *  delete:
 *   (d) deleted_at IS NOT NULL かつ mapping が tombstone=false かつ google_event_id != ''
 */
export async function reconcilePush(): Promise<ReconcileResult> {
  const now = Date.now();
  const fromIso = new Date(now - PAST_LIMIT_MS).toISOString();
  const toIso = new Date(now + FUTURE_LIMIT_MS).toISOString();

  const upsertRes = await db.execute(sql`
    INSERT INTO sync_queue (event_id, operation)
    SELECT e.id, 'upsert'
    FROM events e
    LEFT JOIN sync_mapping sm ON sm.event_id = e.id
    WHERE e.deleted_at IS NULL
      AND e.source <> 'google'
      AND e.start_at >= ${fromIso}::timestamptz
      AND e.start_at <= ${toIso}::timestamptz
      AND (
        sm.event_id IS NULL
        OR sm.google_event_id = ''
        OR sm.last_pushed_at IS NULL
        OR sm.last_pushed_at < e.updated_at
      )
      AND NOT EXISTS (
        SELECT 1 FROM sync_queue sq
        WHERE sq.event_id = e.id
          AND sq.processed_at IS NULL
          AND sq.operation = 'upsert'
      )
    RETURNING id
  `) as unknown as Array<{ id: string }>;

  const deleteRes = await db.execute(sql`
    INSERT INTO sync_queue (event_id, operation)
    SELECT e.id, 'delete'
    FROM events e
    JOIN sync_mapping sm ON sm.event_id = e.id
    WHERE e.deleted_at IS NOT NULL
      AND sm.tombstone = false
      AND sm.google_event_id <> ''
      AND NOT EXISTS (
        SELECT 1 FROM sync_queue sq
        WHERE sq.event_id = e.id
          AND sq.processed_at IS NULL
          AND sq.operation = 'delete'
      )
    RETURNING id
  `) as unknown as Array<{ id: string }>;

  return {
    enqueuedUpserts: upsertRes.length,
    enqueuedDeletes: deleteRes.length,
  };
}
