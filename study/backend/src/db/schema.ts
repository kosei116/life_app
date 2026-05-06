import {
  pgTable,
  text,
  uuid,
  date,
  time,
  integer,
  boolean,
  timestamp,
  jsonb,
  pgEnum,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

export const taskTypeEnum = pgEnum('task_type', [
  'assignment',
  'report',
  'test',
  'other',
]);

// 学期
export const semesters = pgTable('semesters', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  isCurrent: boolean('is_current').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// 時限定義（学期ごとに 1限〜N限） — 5限固定で自動生成
export const periods = pgTable(
  'periods',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    semesterId: uuid('semester_id')
      .notNull()
      .references(() => semesters.id, { onDelete: 'cascade' }),
    periodNumber: integer('period_number').notNull(),
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    semesterPeriodUniq: uniqueIndex('idx_periods_semester_period').on(
      t.semesterId,
      t.periodNumber
    ),
  })
);

// 科目
export const subjects = pgTable(
  'subjects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    semesterId: uuid('semester_id')
      .notNull()
      .references(() => semesters.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color').notNull(),
    lecturesAttended: integer('lectures_attended').notNull().default(0),
    evaluation: jsonb('evaluation'), // 旧 combi の displayText を保持
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    semesterIdx: index('idx_subjects_semester').on(t.semesterId),
  })
);

// 時間割スロット
export const timetableSlots = pgTable(
  'timetable_slots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    semesterId: uuid('semester_id')
      .notNull()
      .references(() => semesters.id, { onDelete: 'cascade' }),
    dayOfWeek: integer('day_of_week').notNull(), // 0=月 ... 6=日
    periodId: uuid('period_id')
      .notNull()
      .references(() => periods.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    cellUniq: uniqueIndex('idx_timetable_slots_cell').on(
      t.semesterId,
      t.dayOfWeek,
      t.periodId
    ),
    subjectIdx: index('idx_timetable_slots_subject').on(t.subjectId),
  })
);

// 授業日（学期内に実際に授業がある日付。旧 combi の classDays に相当）
export const classDays = pgTable(
  'class_days',
  {
    semesterId: uuid('semester_id')
      .notNull()
      .references(() => semesters.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
  },
  (t) => ({
    pk: uniqueIndex('idx_class_days_pk').on(t.semesterId, t.date),
  })
);

// タスク
export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    semesterId: uuid('semester_id')
      .notNull()
      .references(() => semesters.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id').references(() => subjects.id, {
      onDelete: 'set null',
    }),
    type: taskTypeEnum('type').notNull(),
    title: text('title').notNull(),
    detail: text('detail'),
    dueDate: date('due_date').notNull(),
    completed: boolean('completed').notNull().default(false),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    semesterIdx: index('idx_tasks_semester').on(t.semesterId),
    subjectIdx: index('idx_tasks_subject').on(t.subjectId),
    dueDateIdx: index('idx_tasks_due_date').on(t.dueDate),
  })
);

export type SemesterRow = typeof semesters.$inferSelect;
export type SemesterInsert = typeof semesters.$inferInsert;
export type PeriodRow = typeof periods.$inferSelect;
export type SubjectRow = typeof subjects.$inferSelect;
export type SubjectInsert = typeof subjects.$inferInsert;
export type TimetableSlotRow = typeof timetableSlots.$inferSelect;
export type ClassDayRow = typeof classDays.$inferSelect;
export type TaskRow = typeof tasks.$inferSelect;
export type TaskInsert = typeof tasks.$inferInsert;
