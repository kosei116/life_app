import { and, eq, isNull } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { events, syncMapping } from '../db/schema.js';
import { fetchCalendarEvents } from './gas-client.js';
import type { GasFetchedEvent } from './types.js';

const SOURCE_GOOGLE = 'google';

export interface PullResult {
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
}

/**
 * Calendar側の変更をDBに取り込む。
 * - description tag (schedule_mgr_id) があるものはアプリ由来 → スキップ（アプリ側が真）
 * - tombstone登録済みは復活させない（physical delete + tombstone想定）
 * - tagなしのイベントは source='google' として取り込む（読み取り専用）
 */
export async function runPullOnce(): Promise<PullResult> {
  const res = await fetchCalendarEvents();
  if (!res.success) {
    return { fetched: 0, created: 0, updated: 0, skipped: 0 };
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const calEv of res.events) {
    // tag があればアプリ由来 → 常に skip (loop prevention)
    if (calEv.scheduleMgrId) {
      skipped++;
      continue;
    }

    const result = await upsertGoogleEvent(calEv);
    if (result === 'created') created++;
    else if (result === 'updated') updated++;
    else skipped++;
  }

  return { fetched: res.events.length, created, updated, skipped };
}

async function upsertGoogleEvent(
  calEv: GasFetchedEvent
): Promise<'created' | 'updated' | 'skipped'> {
  const now = new Date();

  const tomb = await db
    .select({ eventId: syncMapping.eventId })
    .from(syncMapping)
    .where(and(eq(syncMapping.googleEventId, calEv.googleEventId), eq(syncMapping.tombstone, true)))
    .limit(1);
  if (tomb.length > 0) return 'skipped';

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

  const startAt = new Date(calEv.startDateTime);
  const endAt = new Date(calEv.endDateTime);
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
    return 'skipped';
  }

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
        lastPulledAt: now,
      })
      .onConflictDoUpdate({
        target: syncMapping.eventId,
        set: { lastPulledAt: now, updatedAt: now },
      });
    return 'created';
  }

  const target = existing[0]!;

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
    .update(syncMapping)
    .set({ lastPulledAt: now, updatedAt: now })
    .where(eq(syncMapping.eventId, target.id));
  return 'updated';
}
