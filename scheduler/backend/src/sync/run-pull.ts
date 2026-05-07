/**
 * Google Calendar からの取り込み。
 * - description tag (schedule_mgr_id) があればアプリ由来 → skip（ループ防止）
 * - tag なしは source='google' として保存
 * - 既存の events と比較し、Google 側 lastUpdated > events.updatedAt のときだけ DB を更新
 *   （ユーザがアプリで編集した内容を Google 側の古い値で上書きしないため）
 * - 前回 pull で取れていたが今回返ってこなかった source='google' イベントは
 *   Google 側で削除されたとみなして events.deleted_at を立てる
 * - 取り込んだ event の sync_mapping には push と同じ content_hash を埋めるので、
 *   runSync は何もしない（pull→push の echo back 防止）
 */
import { and, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { events, syncMapping } from '../db/schema.js';
import { fetchCalendarEvents } from './gas-client.js';
import { eventContentHash } from './hash.js';
import type { GasFetchedEvent } from './types.js';

const SOURCE_GOOGLE = 'google';
const PAST_LIMIT_MS = 30 * 24 * 3_600_000;
const FUTURE_LIMIT_MS = 6 * 30 * 24 * 3_600_000;

export interface PullResult {
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  protectedFromOverwrite: number;
  deletedFromGoogle: number;
}

export async function runPull(): Promise<PullResult> {
  const res = await fetchCalendarEvents();
  if (!res.success) {
    return {
      fetched: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      protectedFromOverwrite: 0,
      deletedFromGoogle: 0,
    };
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let protectedFromOverwrite = 0;

  const incomingGoogleIds = new Set<string>();

  for (const calEv of res.events) {
    if (calEv.scheduleMgrId) {
      skipped++;
      continue;
    }
    incomingGoogleIds.add(calEv.googleEventId);
    const r = await upsertGoogleEvent(calEv);
    if (r === 'created') created++;
    else if (r === 'updated') updated++;
    else if (r === 'protected') protectedFromOverwrite++;
    else skipped++;
  }

  // Google 側で削除されたイベント検知。window 内かつ source='google' で生存中のうち、
  // 今回 pull に含まれてなかったものを deleted_at セット。
  const now = new Date();
  const fromTs = new Date(Date.now() - PAST_LIMIT_MS);
  const toTs = new Date(Date.now() + FUTURE_LIMIT_MS);
  const existingGoogle = await db
    .select({ id: events.id, googleEventId: events.googleEventId })
    .from(events)
    .where(
      and(
        eq(events.source, SOURCE_GOOGLE),
        isNull(events.deletedAt),
        gte(events.startAt, fromTs),
        lte(events.startAt, toTs)
      )
    );

  const removed: string[] = [];
  for (const r of existingGoogle) {
    if (!r.googleEventId) continue;
    if (!incomingGoogleIds.has(r.googleEventId)) removed.push(r.id);
  }

  if (removed.length > 0) {
    await db
      .update(events)
      .set({ deletedAt: now, updatedAt: now })
      .where(inArray(events.id, removed));
    // mapping も tombstone 化（runSync は source='google' を push しないので重要ではないが整合のため）
    await db
      .update(syncMapping)
      .set({ tombstone: true, updatedAt: now })
      .where(inArray(syncMapping.eventId, removed));
  }

  return {
    fetched: res.events.length,
    created,
    updated,
    skipped,
    protectedFromOverwrite,
    deletedFromGoogle: removed.length,
  };
}

async function upsertGoogleEvent(
  calEv: GasFetchedEvent
): Promise<'created' | 'updated' | 'protected' | 'skipped'> {
  const now = new Date();

  // tombstone 登録済み（アプリ側削除）は復活させない
  const tomb = await db
    .select({ eventId: syncMapping.eventId })
    .from(syncMapping)
    .where(
      and(eq(syncMapping.googleEventId, calEv.googleEventId), eq(syncMapping.tombstone, true))
    )
    .limit(1);
  if (tomb.length > 0) return 'skipped';

  const startAt = new Date(calEv.startDateTime);
  const endAt = new Date(calEv.endDateTime);
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) return 'skipped';

  const existing = await db
    .select()
    .from(events)
    .where(
      and(
        eq(events.source, SOURCE_GOOGLE),
        eq(events.sourceEventId, calEv.googleEventId),
        isNull(events.deletedAt)
      )
    )
    .limit(1);

  const newHash = eventContentHash({
    title: calEv.title || 'Untitled',
    startAt,
    endAt,
    allDay: calEv.allDay,
    location: calEv.location || null,
    description: calEv.description || null,
    reminders: calEv.reminderMinutes !== null ? [calEv.reminderMinutes] : [],
  });

  if (existing.length === 0) {
    const inserted = await db
      .insert(events)
      .values({
        source: SOURCE_GOOGLE,
        sourceEventId: calEv.googleEventId,
        title: calEv.title || 'Untitled',
        startAt,
        endAt,
        allDay: calEv.allDay,
        location: calEv.location || null,
        description: calEv.description || null,
        reminders: calEv.reminderMinutes !== null ? [calEv.reminderMinutes] : [],
        googleEventId: calEv.googleEventId,
      })
      .onConflictDoNothing({
        target: [events.source, events.sourceEventId],
        where: sql`${events.sourceEventId} IS NOT NULL AND ${events.deletedAt} IS NULL`,
      })
      .returning({ id: events.id });
    if (inserted.length === 0) return 'skipped';

    await db
      .insert(syncMapping)
      .values({
        eventId: inserted[0]!.id,
        googleEventId: calEv.googleEventId,
        googleCalendarId: process.env.GAS_CALENDAR_ID ?? 'primary',
        tombstone: false,
        // pull 経由で来たイベントは「Google 側と同じ内容」= 同じ hash を埋めて
        // runSync が echo back しないようにする
        contentHash: newHash,
        lastPulledAt: now,
      })
      .onConflictDoUpdate({
        target: syncMapping.eventId,
        set: { contentHash: newHash, lastPulledAt: now, updatedAt: now },
      });
    return 'created';
  }

  const target = existing[0]!;

  // 手動編集保護: アプリ側で編集されている可能性があるなら上書きしない。
  // calEv.lastUpdated（Google 側 updated）と events.updatedAt を比較し、
  // events のほうが新しいなら Google から取得した古い値で上書きしない。
  const calUpdated = calEv.lastUpdated ? new Date(calEv.lastUpdated) : null;
  if (calUpdated && target.updatedAt && target.updatedAt > calUpdated) {
    // pull は触らない。次の runSync でアプリ側の最新値を Google に push する。
    return 'protected';
  }

  await db
    .update(events)
    .set({
      title: calEv.title || 'Untitled',
      startAt,
      endAt,
      allDay: calEv.allDay,
      location: calEv.location || null,
      description: calEv.description || null,
      updatedAt: now,
    })
    .where(eq(events.id, target.id));
  await db
    .insert(syncMapping)
    .values({
      eventId: target.id,
      googleEventId: calEv.googleEventId,
      googleCalendarId: process.env.GAS_CALENDAR_ID ?? 'primary',
      tombstone: false,
      contentHash: newHash,
      lastPulledAt: now,
    })
    .onConflictDoUpdate({
      target: syncMapping.eventId,
      set: { contentHash: newHash, lastPulledAt: now, updatedAt: now },
    });
  return 'updated';
}
