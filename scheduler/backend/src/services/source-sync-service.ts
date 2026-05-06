import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { events, syncQueue } from '../db/schema.js';
import type { ImportEventInput } from '../validators/import-event.js';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function toEventRow(sourceId: string, ev: ImportEventInput) {
  return {
    source: sourceId,
    sourceEventId: ev.source_event_id,
    title: ev.title,
    startAt: new Date(ev.start),
    endAt: new Date(ev.end),
    allDay: ev.all_day,
    location: ev.location ?? null,
    description: ev.description ?? null,
    category: ev.category ?? null,
    color: ev.color ?? null,
    reminders: ev.reminders ?? [],
    metadata: ev.metadata ?? null,
  };
}

async function enqueueSync(
  tx: Tx,
  eventIds: string[],
  operation: 'upsert' | 'delete'
) {
  if (eventIds.length === 0) return;
  await tx
    .insert(syncQueue)
    .values(eventIds.map((id) => ({ eventId: id, operation })));
}

/**
 * 個別 upsert。sync_queue に upsert を積む。
 */
export async function upsertOne(sourceId: string, ev: ImportEventInput) {
  return db.transaction(async (tx) => {
    const row = toEventRow(sourceId, ev);
    const inserted = await tx
      .insert(events)
      .values(row)
      .onConflictDoUpdate({
        target: [events.source, events.sourceEventId],
        targetWhere: sql`${events.sourceEventId} IS NOT NULL AND ${events.deletedAt} IS NULL`,
        set: {
          title: row.title,
          startAt: row.startAt,
          endAt: row.endAt,
          allDay: row.allDay,
          location: row.location,
          description: row.description,
          category: row.category,
          color: row.color,
          reminders: row.reminders,
          metadata: row.metadata,
          deletedAt: null,
          updatedAt: new Date(),
        },
      })
      .returning({ id: events.id });

    if (inserted.length > 0) {
      await enqueueSync(tx, inserted.map((r) => r.id), 'upsert');
    }
    return inserted[0] ?? null;
  });
}

/**
 * 全件 upsert。payload に無い source 管理イベントは論理削除し sync_queue に delete を積む。
 */
export async function bulkReplace(sourceId: string, eventsInput: ImportEventInput[]) {
  return db.transaction(async (tx) => {
    const upsertedIds: string[] = [];

    for (const ev of eventsInput) {
      const row = toEventRow(sourceId, ev);
      const result = await tx
        .insert(events)
        .values(row)
        .onConflictDoUpdate({
          target: [events.source, events.sourceEventId],
          targetWhere: sql`${events.sourceEventId} IS NOT NULL AND ${events.deletedAt} IS NULL`,
          set: {
            title: row.title,
            startAt: row.startAt,
            endAt: row.endAt,
            allDay: row.allDay,
            location: row.location,
            description: row.description,
            category: row.category,
            color: row.color,
            reminders: row.reminders,
            metadata: row.metadata,
            deletedAt: null,
            updatedAt: new Date(),
          },
        })
        .returning({ id: events.id });
      if (result[0]) upsertedIds.push(result[0].id);
    }

    const incomingIds = new Set(eventsInput.map((e) => e.source_event_id));
    const existing = await tx
      .select({ id: events.id, sourceEventId: events.sourceEventId })
      .from(events)
      .where(
        and(
          eq(events.source, sourceId),
          isNull(events.deletedAt)
        )
      );

    const toDelete = existing
      .filter((r) => r.sourceEventId !== null && !incomingIds.has(r.sourceEventId))
      .map((r) => r.id);

    if (toDelete.length > 0) {
      await tx
        .update(events)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(inArray(events.id, toDelete));
      await enqueueSync(tx, toDelete, 'delete');
    }

    if (upsertedIds.length > 0) {
      await enqueueSync(tx, upsertedIds, 'upsert');
    }

    return {
      upserted: upsertedIds.length,
      deleted: toDelete.length,
    };
  });
}

/**
 * 個別削除。論理削除 + sync_queue に delete を積む。
 */
export async function deleteOne(sourceId: string, sourceEventId: string) {
  return db.transaction(async (tx) => {
    const found = await tx
      .select({ id: events.id })
      .from(events)
      .where(
        and(
          eq(events.source, sourceId),
          eq(events.sourceEventId, sourceEventId),
          isNull(events.deletedAt)
        )
      )
      .limit(1);

    if (found.length === 0) return { deleted: 0 };

    const id = found[0]!.id;
    await tx
      .update(events)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(events.id, id));
    await enqueueSync(tx, [id], 'delete');
    return { deleted: 1 };
  });
}
