/**
 * ハッシュ駆動・queue レスの同期。events を真実とし、Google Calendar をそれに合わせる。
 *
 * 流れ:
 *  1. 同期 window 内の対象イベントを SELECT（source<>'google' か、source='google' かつ
 *     hash 不一致なものに限り push 対象。詳細は collectActions 参照）
 *  2. 各イベントの content_hash を計算し、sync_mapping と JOIN
 *  3. 分類:
 *     - INSERT: mapping 未作成 or google_event_id 空
 *     - UPDATE: hash 不一致
 *     - DELETE: events.deleted_at IS NOT NULL かつ tombstone=false
 *     - SKIP  : hash 一致
 *  4. 50件ずつ GAS に送信
 *  5. 成功した分だけ mapping を更新（content_hash, google_event_id, tombstone）
 *  6. 失敗（permanent）なら mapping.content_hash を一致させて打ち切る／
 *     （transient）は何もせず次回 sync で再試行
 */
import { and, eq, gte, inArray, isNotNull, isNull, lte } from 'drizzle-orm';
import { db } from '../db/index.js';
import { events, syncMapping } from '../db/schema.js';
import type { EventRow, SyncMappingRow } from '../db/schema.js';
import { postMutations, GasClientError } from './gas-client.js';
import { rowContentHash } from './hash.js';
import type { GasUpsertPayload, GasDeletePayload } from './types.js';

const PAST_LIMIT_MS = 30 * 24 * 3_600_000; // -1 month
const FUTURE_LIMIT_MS = 6 * 30 * 24 * 3_600_000; // +6 months
const BATCH_SIZE = 50;
const PERMANENT_REASONS = new Set([
  'recurring_master',
  'patch_unsupported_id',
  'no_google_id',
]);

export interface SyncResult {
  scanned: number;
  inserted: number;
  updated: number;
  deleted: number;
  skipped: number;
  failedTransient: number;
  failedPermanent: number;
}

interface PlannedAction {
  kind: 'insert' | 'update' | 'delete';
  event: EventRow;
  mapping: SyncMappingRow | null;
  newHash: string | null; // delete の場合 null
}

export async function runSync(): Promise<SyncResult> {
  const now = Date.now();
  const fromTs = new Date(now - PAST_LIMIT_MS);
  const toTs = new Date(now + FUTURE_LIMIT_MS);

  // 1. window 内の生存イベント + window 内で論理削除されたイベント
  const liveRows = await db
    .select()
    .from(events)
    .where(
      and(
        isNull(events.deletedAt),
        gte(events.startAt, fromTs),
        lte(events.startAt, toTs)
      )
    );
  const deletedRows = await db
    .select()
    .from(events)
    .where(
      and(
        isNotNull(events.deletedAt),
        gte(events.startAt, fromTs),
        lte(events.startAt, toTs)
      )
    );

  // 2. mapping を一括取得
  const allEventIds = [...liveRows, ...deletedRows].map((e) => e.id);
  const mappings = allEventIds.length
    ? await db.select().from(syncMapping).where(inArray(syncMapping.eventId, allEventIds))
    : [];
  const mappingByEventId = new Map(mappings.map((m) => [m.eventId, m]));

  // 3. 分類
  const actions = collectActions(liveRows, deletedRows, mappingByEventId);

  const result: SyncResult = {
    scanned: liveRows.length + deletedRows.length,
    inserted: 0,
    updated: 0,
    deleted: 0,
    skipped: liveRows.length + deletedRows.length - actions.length,
    failedTransient: 0,
    failedPermanent: 0,
  };

  // 4. バッチ送信
  for (let i = 0; i < actions.length; i += BATCH_SIZE) {
    const batch = actions.slice(i, i + BATCH_SIZE);
    await processBatch(batch, result);
  }

  return result;
}

function collectActions(
  liveRows: EventRow[],
  deletedRows: EventRow[],
  mappingByEventId: Map<string, SyncMappingRow>
): PlannedAction[] {
  const actions: PlannedAction[] = [];

  for (const ev of liveRows) {
    const mapping = mappingByEventId.get(ev.id) ?? null;
    const newHash = rowContentHash(ev);

    // source='google' の場合、pull 直後は hash 一致しているはず。
    // ユーザがアプリ側で編集すれば hash が変わるので push 対象になる。
    // mapping が存在しない google イベントは pull 経由で来てないので skip。
    if (ev.source === 'google' && !mapping) continue;

    // tombstone は「sync 対象から外した」印（手動削除 or permanent error）。
    // hash も一緒に保存してあるので、events 側で内容が変われば再度 push する余地は残す。
    if (mapping?.tombstone && mapping.contentHash === newHash) continue;

    if (!mapping || !mapping.googleEventId || mapping.googleEventId === '') {
      actions.push({ kind: 'insert', event: ev, mapping, newHash });
      continue;
    }
    if (mapping.contentHash !== newHash) {
      actions.push({ kind: 'update', event: ev, mapping, newHash });
      continue;
    }
    // hash 一致 = 何もしない
  }

  for (const ev of deletedRows) {
    const mapping = mappingByEventId.get(ev.id) ?? null;
    if (!mapping || !mapping.googleEventId || mapping.tombstone) continue;
    actions.push({ kind: 'delete', event: ev, mapping, newHash: null });
  }

  return actions;
}

async function processBatch(actions: PlannedAction[], result: SyncResult) {
  const upserts: GasUpsertPayload[] = [];
  const deletes: GasDeletePayload[] = [];
  const byId = new Map<string, PlannedAction>();

  for (const a of actions) {
    byId.set(a.event.id, a);
    if (a.kind === 'delete') {
      deletes.push({
        id: a.event.id,
        googleEventId: a.mapping!.googleEventId,
        title: a.event.title,
        startTime: a.event.startAt.toISOString(),
        endTime: a.event.endAt.toISOString(),
        allDay: a.event.allDay,
      });
    } else {
      upserts.push({
        id: a.event.id,
        title: a.event.title,
        description: a.event.description ?? '',
        location: a.event.location ?? '',
        startDateTime: a.event.startAt.toISOString(),
        endDateTime: a.event.endAt.toISOString(),
        allDay: a.event.allDay,
        reminderMinutes: (a.event.reminders ?? [])[0] ?? null,
        googleEventId:
          a.mapping?.googleEventId && a.mapping.googleEventId !== ''
            ? a.mapping.googleEventId
            : a.event.googleEventId ?? null,
      });
    }
  }

  let response;
  try {
    response = await postMutations({ action: 'mutations', upserts, deletes });
  } catch (err) {
    // 通信エラーや GAS 全体失敗 → 全件 transient 扱い。何も更新せず次回 sync で再試行。
    result.failedTransient += actions.length;
    const isPermanent =
      err instanceof GasClientError && err.status >= 400 && err.status < 500;
    if (isPermanent) {
      // 4xx なら次回も同じく失敗するので、せめてログだけ残す
      console.error('[sync] permanent GAS error, batch dropped:', err.message);
    }
    return;
  }

  const errorMap = new Map<string, { reason: string; message?: string }>();
  for (const e of response.errors ?? []) {
    errorMap.set(e.id, { reason: e.reason, message: e.message });
  }
  const returnedIdMap = new Map<string, string>();
  for (const r of response.results ?? []) {
    if (r.googleEventId) returnedIdMap.set(r.id, r.googleEventId);
  }

  const calId = process.env.GAS_CALENDAR_ID ?? 'primary';
  const now = new Date();

  for (const a of actions) {
    const err = errorMap.get(a.event.id);
    if (err) {
      const isPermanent = PERMANENT_REASONS.has(err.reason);
      if (isPermanent) {
        // 「もうこのイベントは sync 対象から外す」意味で tombstone=true。
        // upsert で mapping が無かった場合は新規 mapping を作って tombstone を立てる。
        if (a.kind !== 'delete') {
          await upsertMapping(a.event.id, {
            googleEventId: a.mapping?.googleEventId ?? '',
            googleCalendarId: calId,
            tombstone: true,
            contentHash: a.newHash!,
            lastPushedAt: now,
          });
        } else {
          await db
            .update(syncMapping)
            .set({ tombstone: true, lastPushedAt: now, updatedAt: now })
            .where(eq(syncMapping.eventId, a.event.id));
        }
        result.failedPermanent++;
      } else {
        result.failedTransient++;
        // 何もしない → 次回 sync で再試行
      }
      continue;
    }

    if (a.kind === 'delete') {
      await db
        .update(syncMapping)
        .set({ tombstone: true, lastPushedAt: now, updatedAt: now })
        .where(eq(syncMapping.eventId, a.event.id));
      result.deleted++;
    } else {
      const gid = returnedIdMap.get(a.event.id) ?? a.mapping?.googleEventId ?? '';
      await upsertMapping(a.event.id, {
        googleEventId: gid,
        googleCalendarId: calId,
        tombstone: false,
        contentHash: a.newHash!,
        lastPushedAt: now,
      });
      if (a.kind === 'insert') result.inserted++;
      else result.updated++;
    }
  }
}

async function upsertMapping(
  eventId: string,
  v: {
    googleEventId: string;
    googleCalendarId: string;
    tombstone: boolean;
    contentHash: string;
    lastPushedAt: Date;
  }
) {
  await db
    .insert(syncMapping)
    .values({
      eventId,
      googleEventId: v.googleEventId,
      googleCalendarId: v.googleCalendarId,
      tombstone: v.tombstone,
      contentHash: v.contentHash,
      lastPushedAt: v.lastPushedAt,
    })
    .onConflictDoUpdate({
      target: syncMapping.eventId,
      set: {
        googleEventId: v.googleEventId,
        tombstone: v.tombstone,
        contentHash: v.contentHash,
        lastPushedAt: v.lastPushedAt,
        updatedAt: new Date(),
      },
    });
}

