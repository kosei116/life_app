import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import { periods } from '../db/schema.js';
import { uuidSchema } from '../validators/index.js';

export const periodsRoute = new Hono();

periodsRoute.get(
  '/',
  zValidator('query', z.object({ semesterId: uuidSchema })),
  async (c) => {
    const { semesterId } = c.req.valid('query');
    const rows = await db
      .select()
      .from(periods)
      .where(eq(periods.semesterId, semesterId))
      .orderBy(periods.periodNumber);
    return c.json({ data: rows });
  }
);
