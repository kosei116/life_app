-- C3 fix: 同じ (source, source_event_id) で論理削除済み行と新行が並存していた問題を解消。
-- 1) 既存の重複（論理削除行で、生存行と (source, source_event_id) が衝突するもの）を物理削除。
--    sync_mapping/event_overrides は events への FK が ON DELETE CASCADE なので連動して消える。
-- 2) 論理削除行同士で同じ (source, source_event_id) の場合は最新 1 行だけ残す（次の strict index に備えて）。
-- 3) パーシャル条件から `deleted_at IS NULL` を外して strict 化。
--    以後、re-import は ON CONFLICT DO UPDATE で resurrection（deleted_at=NULL に戻る）するようにサービス側を直す。

-- 1) 生存行が存在する論理削除行を削除
DELETE FROM "events" e
USING "events" e2
WHERE e."deleted_at" IS NOT NULL
  AND e2."deleted_at" IS NULL
  AND e."source" = e2."source"
  AND e."source_event_id" = e2."source_event_id"
  AND e."source_event_id" IS NOT NULL;

-- 2) 論理削除行同士で重複 → 最新の updated_at だけ残す
DELETE FROM "events" e
USING "events" e2
WHERE e."deleted_at" IS NOT NULL
  AND e2."deleted_at" IS NOT NULL
  AND e."source" = e2."source"
  AND e."source_event_id" = e2."source_event_id"
  AND e."source_event_id" IS NOT NULL
  AND (e."updated_at" < e2."updated_at"
       OR (e."updated_at" = e2."updated_at" AND e."id" < e2."id"));

-- 3) index 差し替え
DROP INDEX IF EXISTS "idx_events_source_event_id";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_events_source_event_id" ON "events" USING btree ("source","source_event_id") WHERE "events"."source_event_id" IS NOT NULL;
