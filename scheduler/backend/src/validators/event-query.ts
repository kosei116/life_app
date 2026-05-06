import { z } from 'zod';

export const eventQuerySchema = z
  .object({
    from: z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Invalid from datetime'),
    to: z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Invalid to datetime'),
  })
  .refine((v) => Date.parse(v.to) >= Date.parse(v.from), {
    message: 'to must be >= from',
    path: ['to'],
  });

export type EventQuery = z.infer<typeof eventQuerySchema>;
