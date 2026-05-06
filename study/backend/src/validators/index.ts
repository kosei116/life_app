import { z } from 'zod';

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD format required');
const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, '#RRGGBB required');
const uuidSchema = z.string().uuid();

// Semester
export const semesterCreateSchema = z.object({
  name: z.string().min(1),
  startDate: dateString,
  endDate: dateString,
  isCurrent: z.boolean().optional(),
});
export const semesterUpdateSchema = semesterCreateSchema.partial();

// Subject
export const subjectCreateSchema = z.object({
  semesterId: uuidSchema,
  name: z.string().min(1),
  color: hexColor,
  evaluation: z.unknown().optional(),
});
export const subjectUpdateSchema = z
  .object({
    name: z.string().min(1).optional(),
    color: hexColor.optional(),
    lecturesAttended: z.number().int().min(0).optional(),
    evaluation: z.unknown().optional(),
  })
  .partial();
export const lecturesAttendedDeltaSchema = z.object({
  delta: z.number().int(),
});

// Timetable slot
export const timetableSlotUpsertSchema = z.object({
  semesterId: uuidSchema,
  dayOfWeek: z.number().int().min(0).max(6),
  periodId: uuidSchema,
  subjectId: uuidSchema,
});
export const timetableSlotDeleteQuerySchema = z.object({
  semesterId: uuidSchema,
  dayOfWeek: z.coerce.number().int().min(0).max(6),
  periodId: uuidSchema,
});

// Class days (旧 combi の classDays に相当)
export const classDaysReplaceSchema = z.array(dateString);
export const classDayToggleSchema = z.object({
  semesterId: uuidSchema,
  date: dateString,
});

// Task
export const taskCreateSchema = z.object({
  semesterId: uuidSchema,
  subjectId: uuidSchema.nullable().optional(),
  type: z.enum(['assignment', 'report', 'test', 'other']),
  title: z.string().min(1),
  detail: z.string().optional(),
  dueDate: dateString,
});
export const taskUpdateSchema = z
  .object({
    subjectId: uuidSchema.nullable().optional(),
    type: z.enum(['assignment', 'report', 'test', 'other']).optional(),
    title: z.string().min(1).optional(),
    detail: z.string().nullable().optional(),
    dueDate: dateString.optional(),
    completed: z.boolean().optional(),
  })
  .partial();

export { dateString, hexColor, uuidSchema };
