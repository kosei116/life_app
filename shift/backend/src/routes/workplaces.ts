import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { workplaces } from '../db/schema.js';
import { workplaceCreateSchema, workplaceUpdateSchema } from '../validators/index.js';

export const workplacesRoute = new Hono();

workplacesRoute.get('/', async (c) => {
  const rows = await db.select().from(workplaces).orderBy(workplaces.name);
  return c.json({ data: rows });
});

workplacesRoute.post('/', zValidator('json', workplaceCreateSchema), async (c) => {
  const body = c.req.valid('json');
  const insert = {
    ...body,
    nightMultiplier: body.nightMultiplier?.toString(),
  };
  const [row] = await db.insert(workplaces).values(insert).returning();
  return c.json({ data: row }, 201);
});

workplacesRoute.patch('/:id', zValidator('json', workplaceUpdateSchema), async (c) => {
  const body = c.req.valid('json');
  const patch: Record<string, unknown> = { ...body, updatedAt: new Date() };
  if (body.nightMultiplier != null) patch.nightMultiplier = body.nightMultiplier.toString();
  const rows = await db
    .update(workplaces)
    .set(patch)
    .where(eq(workplaces.id, c.req.param('id')))
    .returning();
  if (rows.length === 0) return c.json({ error: { code: 'NOT_FOUND', message: 'Workplace not found' } }, 404);
  return c.json({ data: rows[0] });
});

workplacesRoute.delete('/:id', async (c) => {
  const deleted = await db.delete(workplaces).where(eq(workplaces.id, c.req.param('id'))).returning();
  if (deleted.length === 0) return c.json({ error: { code: 'NOT_FOUND', message: 'Workplace not found' } }, 404);
  return c.body(null, 204);
});
