import {
  pgTable,
  text,
  uuid,
  timestamp,
  boolean,
  integer,
  jsonb,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const sources = pgTable('sources', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  color: text('color').notNull(),
  icon: text('icon'),
  enabled: boolean('enabled').notNull().default(true),
  priority: integer('priority').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    source: text('source').notNull(),
    sourceEventId: text('source_event_id'),
    title: text('title').notNull(),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true }).notNull(),
    allDay: boolean('all_day').notNull().default(false),
    location: text('location'),
    description: text('description'),
    category: text('category'),
    color: text('color'),
    reminders: jsonb('reminders').$type<number[]>().default(sql`'[]'::jsonb`),
    metadata: jsonb('metadata').$type<{
      display?: { fields?: unknown[]; actions?: unknown[] };
      raw?: unknown;
    }>(),
    recurrenceGroupId: uuid('recurrence_group_id'),
    recurrenceIndex: integer('recurrence_index'),
    googleEventId: text('google_event_id'),
    googleEtag: text('google_etag'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    startAtIdx: index('idx_events_start_at')
      .on(t.startAt)
      .where(sql`${t.deletedAt} IS NULL`),
    sourceEventIdUniq: uniqueIndex('idx_events_source_event_id')
      .on(t.source, t.sourceEventId)
      .where(sql`${t.sourceEventId} IS NOT NULL`),
    recurrenceGroupIdx: index('idx_events_recurrence_group')
      .on(t.recurrenceGroupId, t.recurrenceIndex)
      .where(sql`${t.recurrenceGroupId} IS NOT NULL`),
  })
);

export const syncMapping = pgTable('sync_mapping', {
  eventId: uuid('event_id')
    .primaryKey()
    .references(() => events.id, { onDelete: 'cascade' }),
  googleEventId: text('google_event_id').notNull(),
  googleCalendarId: text('google_calendar_id').notNull(),
  tombstone: boolean('tombstone').notNull().default(false),
  syncToken: text('sync_token'),
  // 最後に push したイベント内容の SHA-1 ハッシュ。
  // runSync は events から計算した現在の hash と比較して、
  // 変わってないイベントは GAS に送らない。
  contentHash: text('content_hash'),
  lastPushedAt: timestamp('last_pushed_at', { withTimezone: true }),
  lastPulledAt: timestamp('last_pulled_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const eventOverrides = pgTable('event_overrides', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id')
    .notNull()
    .unique()
    .references(() => events.id, { onDelete: 'cascade' }),
  hidden: boolean('hidden'),
  colorOverride: text('color_override'),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type EventRow = typeof events.$inferSelect;
export type EventInsert = typeof events.$inferInsert;
export type SourceRow = typeof sources.$inferSelect;
export type SyncMappingRow = typeof syncMapping.$inferSelect;
export type EventOverrideRow = typeof eventOverrides.$inferSelect;
