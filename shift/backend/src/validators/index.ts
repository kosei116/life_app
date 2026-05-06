import { z } from 'zod';

const isoDateTime = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Invalid ISO datetime');
const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, '#RRGGBB required');
const uuidSchema = z.string().uuid();

export const workplaceCreateSchema = z.object({
  name: z.string().min(1).max(100),
  color: hexColor,
  hourlyRate: z.number().int().min(0),
  breakThresholdMinutes: z.number().int().min(0).optional(),
  breakMinutes: z.number().int().min(0).optional(),
  nightStartHour: z.number().int().min(0).max(23).optional(),
  nightEndHour: z.number().int().min(0).max(23).optional(),
  nightMultiplier: z.number().min(0).optional(),
});
export const workplaceUpdateSchema = workplaceCreateSchema.partial();

export const shiftCreateSchema = z.object({
  workplaceId: uuidSchema,
  startAt: isoDateTime,
  endAt: isoDateTime,
  rateOverride: z.number().int().min(0).nullable().optional(),
  notes: z.string().nullable().optional(),
});
export const shiftUpdateSchema = shiftCreateSchema.partial();

export const monthlyTargetSchema = z.object({
  yearMonth: z.string().regex(/^\d{4}-\d{2}$/),
  amount: z.number().int().min(0),
});

export { isoDateTime, hexColor, uuidSchema };
