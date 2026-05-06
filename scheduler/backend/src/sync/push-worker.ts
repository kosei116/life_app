import { and, eq, inArray, isNull, lte } from 'drizzle-orm';
import { db } from '../db/index.js';
import { events, syncQueue, syncMapping } from '../db/schema.js';
import { postMutations, GasClientError } from './gas-client.js';
import type { GasUpsertPayload, GasDeletePayload } from './types.js';

const BATCH_SIZE = 50;
const MAX_RETRIES = 5;
const PAST_LIMIT_MS = 30 * 24 * 3_600_000; // 1 month past
const FUTURE_LIMIT_MS = 6 * 30 * 24 * 3_600_000; // ~6 months future

function inSyncWindow(startAt: Date): boolean {
  const now = Date.now();
  const t = startAt.getTime();
  return t >= now - PAST_LIMIT_MS && t <= now + FUTURE_LIMIT_MS;
}

interface QueueRow {
  queueId: string;
  eventId: string;
  operation: 'upsert' | 'delete';
  retryCount: number;
}

async function claimBatch(): Promise<QueueRow[]> {
  const rows = await db
    .select({
      queueId: syncQueue.id,
      eventId: syncQueue.eventId,
      operation: syncQueue.operation,
      retryCount: syncQueue.retryCount,
    })
    .from(syncQueue)
    .where(and(isNull(syncQueue.processedAt), lte(syncQueue.scheduledAt, new Date())))
    .orderBy(syncQueue.scheduledAt)
    .limit(BATCH_SIZE);
  return rows;
}

export interface PushResult {
  attempted: number;
  succeeded: number;
  failed: number;
  skipped: number;
}

export async function runPushOnce(): Promise<PushResult> {
  const claimed = await claimBatch();
  if (claimed.length === 0) {
    return { attempted: 0, succeeded: 0, failed: 0, skipped: 0 };
  }

  const upserts: GasUpsertPayload[] = [];
  const deletes: GasDeletePayload[] = [];
  const skipQueueIds: string[] = [];
  const queueByEventId = new Map<string, QueueRow>();

  for (const item of claimed) {
    queueByEventId.set(item.eventId, item);

    const evRows = await db
      .select()
      .from(events)
      .where(eq(events.id, item.eventId))
      .limit(1);
    const ev = evRows[0];
    const mapRows = await db
      .select()
      .from(syncMapping)
      .where(eq(syncMapping.eventId, item.eventId))
      .limit(1);
    const mapping = mapRows[0];

    if (item.operation === 'delete') {
      if (mapping && !mapping.tombstone) {
        deletes.push({
          id: item.eventId,
          googleEventId: mapping.googleEventId,
          title: ev?.title,
          startTime: ev?.startAt.toISOString(),
          endTime: ev?.endAt.toISOString(),
          allDay: ev?.allDay,
        });
      } else {
        skipQueueIds.push(item.queueId);
      }
      continue;
    }

    if (!ev || ev.deletedAt !== null) {
      skipQueueIds.push(item.queueId);
      continue;
    }
    if (!inSyncWindow(ev.startAt)) {
      skipQueueIds.push(item.queueId);
      continue;
    }

    upserts.push({
      id: ev.id,
      title: ev.title,
      description: ev.description ?? '',
      location: ev.location ?? '',
      startDateTime: ev.startAt.toISOString(),
      endDateTime: ev.endAt.toISOString(),
      allDay: ev.allDay,
      reminderMinutes: (ev.reminders ?? [])[0] ?? null,
      googleEventId: mapping?.googleEventId ?? ev.googleEventId ?? null,
    });
  }

  if (skipQueueIds.length > 0) {
    await db
      .update(syncQueue)
      .set({ processedAt: new Date() })
      .where(inArray(syncQueue.id, skipQueueIds));
  }

  if (upserts.length === 0 && deletes.length === 0) {
    return {
      attempted: claimed.length,
      succeeded: 0,
      failed: 0,
      skipped: skipQueueIds.length,
    };
  }

  let succeeded = 0;
  let failed = 0;
  try {
    const response = await postMutations({ action: 'mutations', upserts, deletes });
    const now = new Date();
    // GAS が返した実際の googleEventId を id ごとに記録
    const returnedIdMap = new Map<string, string>();
    for (const r of response.results ?? []) {
      if (r.googleEventId) returnedIdMap.set(r.id, r.googleEventId);
    }
    // GAS 側で失敗した id を分離。recurring_master のような恒久的失敗は
    // permanent として retry を打ち切り、それ以外は retry に回す。
    const errorMap = new Map<string, { reason: string; message?: string }>();
    for (const e of response.errors ?? []) {
      errorMap.set(e.id, { reason: e.reason, message: e.message });
    }
    const PERMANENT_REASONS = new Set(['recurring_master']);

    const sentEventIds = [
      ...upserts.map((u) => u.id),
      ...deletes.map((d) => d.id),
    ];
    const successEventIds = sentEventIds.filter((id) => !errorMap.has(id));
    const successQueueIds = successEventIds
      .map((id) => queueByEventId.get(id)?.queueId)
      .filter((x): x is string => Boolean(x));
    if (successQueueIds.length > 0) {
      await db
        .update(syncQueue)
        .set({ processedAt: now })
        .where(inArray(syncQueue.id, successQueueIds));
    }

    // GAS エラー分は retry に回す（permanent は打ち切り）
    for (const [eid, info] of errorMap) {
      const item = queueByEventId.get(eid);
      if (!item) continue;
      const nextRetry = item.retryCount + 1;
      const isPermanent = PERMANENT_REASONS.has(info.reason);
      const errMsg = `${info.reason}${info.message ? ': ' + info.message : ''}`.slice(0, 500);
      if (isPermanent || nextRetry >= MAX_RETRIES) {
        await db
          .update(syncQueue)
          .set({ processedAt: now, retryCount: nextRetry, errorMessage: errMsg })
          .where(eq(syncQueue.id, item.queueId));
      } else {
        const delayMs = Math.min(60_000, 2 ** nextRetry * 1000);
        await db
          .update(syncQueue)
          .set({
            retryCount: nextRetry,
            scheduledAt: new Date(Date.now() + delayMs),
            errorMessage: errMsg,
          })
          .where(eq(syncQueue.id, item.queueId));
      }
      failed++;
    }

    for (const u of upserts) {
      if (errorMap.has(u.id)) continue;
      // GAS が返した googleEventId を優先、無ければ送ったもの
      const gid = returnedIdMap.get(u.id) ?? u.googleEventId ?? '';
      await db
        .insert(syncMapping)
        .values({
          eventId: u.id,
          googleEventId: gid,
          googleCalendarId: process.env.GAS_CALENDAR_ID ?? 'primary',
          tombstone: false,
          lastPushedAt: now,
        })
        .onConflictDoUpdate({
          target: syncMapping.eventId,
          set: {
            googleEventId: gid,
            tombstone: false,
            lastPushedAt: now,
            updatedAt: now,
          },
        });
    }
    for (const d of deletes) {
      if (errorMap.has(d.id)) continue;
      await db
        .update(syncMapping)
        .set({ tombstone: true, lastPushedAt: now, updatedAt: now })
        .where(eq(syncMapping.eventId, d.id));
    }
    succeeded = successEventIds.length;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const eventIds = [...upserts.map((u) => u.id), ...deletes.map((d) => d.id)];
    for (const eid of eventIds) {
      const item = queueByEventId.get(eid);
      if (!item) continue;
      const nextRetry = item.retryCount + 1;
      const isPermanent =
        err instanceof GasClientError && err.status >= 400 && err.status < 500;
      if (nextRetry >= MAX_RETRIES || isPermanent) {
        await db
          .update(syncQueue)
          .set({
            processedAt: new Date(),
            retryCount: nextRetry,
            errorMessage: msg.slice(0, 500),
          })
          .where(eq(syncQueue.id, item.queueId));
      } else {
        const delayMs = Math.min(60_000, 2 ** nextRetry * 1000);
        await db
          .update(syncQueue)
          .set({
            retryCount: nextRetry,
            scheduledAt: new Date(Date.now() + delayMs),
            errorMessage: msg.slice(0, 500),
          })
          .where(eq(syncQueue.id, item.queueId));
      }
      failed++;
    }
  }

  return {
    attempted: claimed.length,
    succeeded,
    failed,
    skipped: skipQueueIds.length,
  };
}
