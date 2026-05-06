import { z } from 'zod';

const isoDateTime = z.string().refine((s) => !Number.isNaN(Date.parse(s)), {
  message: 'Invalid ISO 8601 datetime',
});

const colorHex = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be #RRGGBB');

/**
 * 繰り返し設定。freq により展開ロジックを切り替える:
 * - daily   : 1日ごと
 * - weekly  : 指定曜日 (0=Sun .. 6=Sat) のみ
 * - monthly : 開始日と同じ日 (JST)。月にその日が無ければスキップ
 *
 * until or count のいずれか必須。
 */
const baseRecurrence = {
  until: isoDateTime.optional(),
  count: z.number().int().positive().max(520).optional(),
};

const refineUntilOrCount = (v: { until?: string; count?: number }) =>
  Boolean(v.until) !== Boolean(v.count);
const untilOrCountMessage = {
  message: 'Specify either until or count (not both)',
};

export const recurrenceInputSchema = z
  .union([
    z.object({ freq: z.literal('daily'), ...baseRecurrence }),
    z.object({
      freq: z.literal('weekly'),
      weekdays: z.array(z.number().int().min(0).max(6)).min(1),
      ...baseRecurrence,
    }),
    z.object({ freq: z.literal('monthly'), ...baseRecurrence }),
  ])
  .refine(refineUntilOrCount, untilOrCountMessage);

export const createEventSchema = z
  .object({
    title: z.string().min(1),
    start: isoDateTime,
    end: isoDateTime,
    all_day: z.boolean().default(false),
    location: z.string().optional(),
    description: z.string().optional(),
    category: z.string().optional(),
    color: colorHex.optional(),
    reminders: z.array(z.number().int().nonnegative()).optional(),
    recurrence: recurrenceInputSchema.optional(),
  })
  .refine((v) => Date.parse(v.end) >= Date.parse(v.start), {
    message: 'end must be >= start',
    path: ['end'],
  });

export const editScopeSchema = z.enum(['this', 'this_and_future', 'all']).default('this');

export const updateEventSchema = z.object({
  title: z.string().min(1).optional(),
  start: isoDateTime.optional(),
  end: isoDateTime.optional(),
  all_day: z.boolean().optional(),
  location: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  color: colorHex.nullable().optional(),
  reminders: z.array(z.number().int().nonnegative()).optional(),
  scope: editScopeSchema.optional(),
});

export const eventOverrideSchema = z.object({
  hidden: z.boolean().nullable().optional(),
  color_override: colorHex.nullable().optional(),
  note: z.string().nullable().optional(),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type EventOverrideInput = z.infer<typeof eventOverrideSchema>;
export type EditScope = z.infer<typeof editScopeSchema>;
