import { z } from 'zod';

const isoDateTime = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), { message: 'Invalid ISO 8601 datetime' });

const colorHex = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be #RRGGBB');

const displayFieldSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), label: z.string(), value: z.string() }),
  z.object({ type: z.literal('multiline'), label: z.string(), value: z.string() }),
  z.object({ type: z.literal('link'), label: z.string(), value: z.string(), url: z.string().url() }),
  z.object({ type: z.literal('badge'), label: z.string(), value: z.string(), color: colorHex.optional() }),
  z.object({
    type: z.literal('progress'),
    label: z.string(),
    value: z.number(),
    max: z.number().positive(),
    unit: z.string().optional(),
  }),
  z.object({ type: z.literal('date'), label: z.string(), value: isoDateTime }),
  z.object({ type: z.literal('tags'), label: z.string(), value: z.array(z.string()) }),
]);

const displayActionSchema = z.object({
  label: z.string(),
  url: z.string().url(),
  icon: z.string().optional(),
});

export const importEventSchema = z
  .object({
    source: z.string().min(1),
    source_event_id: z.string().min(1),
    title: z.string().min(1),
    start: isoDateTime,
    end: isoDateTime,
    all_day: z.boolean(),
    location: z.string().optional(),
    description: z.string().optional(),
    category: z.string().optional(),
    color: colorHex.optional(),
    reminders: z.array(z.number().int().nonnegative()).optional(),
    metadata: z
      .object({
        display: z
          .object({
            fields: z.array(displayFieldSchema).optional(),
            actions: z.array(displayActionSchema).optional(),
          })
          .optional(),
        raw: z.unknown().optional(),
      })
      .optional(),
  })
  .refine((v) => Date.parse(v.end) >= Date.parse(v.start), {
    message: 'end must be >= start',
    path: ['end'],
  });

export const importEventListSchema = z.array(importEventSchema);

export type ImportEventInput = z.infer<typeof importEventSchema>;
