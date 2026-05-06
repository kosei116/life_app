import {
  pgTable,
  text,
  uuid,
  integer,
  numeric,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

// 勤務先（職場）
export const workplaces = pgTable('workplaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  color: text('color').notNull(),
  hourlyRate: integer('hourly_rate').notNull(), // 円
  // 業務ルール（旧 part-time のハードコードを設定可能に）
  breakThresholdMinutes: integer('break_threshold_minutes').notNull().default(360), // 6時間以上で休憩
  breakMinutes: integer('break_minutes').notNull().default(60), // 60分の無給休憩
  nightStartHour: integer('night_start_hour').notNull().default(22), // 深夜開始
  nightEndHour: integer('night_end_hour').notNull().default(5), // 深夜終了
  nightMultiplier: numeric('night_multiplier', { precision: 4, scale: 2 }).notNull().default('1.25'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// シフト
export const shifts = pgTable(
  'shifts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workplaceId: uuid('workplace_id')
      .notNull()
      .references(() => workplaces.id, { onDelete: 'cascade' }),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true }).notNull(),
    rateOverride: integer('rate_override'), // null = workplace.hourlyRate を使用
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    startIdx: index('idx_shifts_start_at').on(t.startAt),
    workplaceIdx: index('idx_shifts_workplace').on(t.workplaceId),
  })
);

// 月間目標（旧: ¥90,000 ハードコード → 月別にDB化）
export const monthlyTargets = pgTable('monthly_targets', {
  yearMonth: text('year_month').primaryKey(), // 'YYYY-MM'
  amount: integer('amount').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type WorkplaceRow = typeof workplaces.$inferSelect;
export type WorkplaceInsert = typeof workplaces.$inferInsert;
export type ShiftRow = typeof shifts.$inferSelect;
export type ShiftInsert = typeof shifts.$inferInsert;
export type MonthlyTargetRow = typeof monthlyTargets.$inferSelect;
