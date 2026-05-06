import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { sources } from '../db/schema.js';
import {
  importEventSchema,
  importEventListSchema,
} from '../validators/import-event.js';
import {
  upsertOne,
  bulkReplace,
  deleteOne,
} from '../services/source-sync-service.js';

export const sourcesRoute = new Hono();

// GET /api/sources  - 一覧
sourcesRoute.get('/', async (c) => {
  const rows = await db.select().from(sources).orderBy(sources.priority);
  return c.json({
    data: rows.map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color,
      icon: r.icon,
      enabled: r.enabled,
      priority: r.priority,
    })),
  });
});

import { z } from 'zod';
const sourcePatchSchema = z.object({
  enabled: z.boolean().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  name: z.string().min(1).optional(),
  priority: z.number().int().optional(),
});

// PATCH /api/sources/:source_id  - 設定変更
sourcesRoute.patch('/:source_id', zValidator('json', sourcePatchSchema), async (c) => {
  const id = c.req.param('source_id');
  const body = c.req.valid('json');
  const updated = await db
    .update(sources)
    .set(body)
    .where(eq(sources.id, id))
    .returning();
  if (updated.length === 0) {
    return c.json(
      { error: { code: 'SOURCE_NOT_FOUND', message: `Unknown source: ${id}` } },
      404
    );
  }
  return c.json({ data: updated[0] });
});

async function assertSourceExists(sourceId: string): Promise<boolean> {
  const found = await db
    .select({ id: sources.id, enabled: sources.enabled })
    .from(sources)
    .where(eq(sources.id, sourceId))
    .limit(1);
  return found.length > 0 && found[0]!.enabled;
}

function ensureBodySource(sourceId: string, bodySource: string) {
  if (sourceId !== bodySource) {
    return `URL source (${sourceId}) does not match body source (${bodySource})`;
  }
  return null;
}

// PUT /api/sources/:source_id/events  - 全件 upsert + 差分削除
sourcesRoute.put(
  '/:source_id/events',
  zValidator('json', importEventListSchema),
  async (c) => {
    const sourceId = c.req.param('source_id');
    if (!(await assertSourceExists(sourceId))) {
      return c.json(
        { error: { code: 'SOURCE_NOT_FOUND', message: `Unknown source: ${sourceId}` } },
        404
      );
    }

    const body = c.req.valid('json');
    for (const ev of body) {
      const err = ensureBodySource(sourceId, ev.source);
      if (err) return c.json({ error: { code: 'SOURCE_MISMATCH', message: err } }, 400);
    }

    const result = await bulkReplace(sourceId, body);
    return c.json({ data: result });
  }
);

// POST /api/sources/:source_id/events  - 個別 upsert
sourcesRoute.post(
  '/:source_id/events',
  zValidator('json', importEventSchema),
  async (c) => {
    const sourceId = c.req.param('source_id');
    if (!(await assertSourceExists(sourceId))) {
      return c.json(
        { error: { code: 'SOURCE_NOT_FOUND', message: `Unknown source: ${sourceId}` } },
        404
      );
    }
    const body = c.req.valid('json');
    const err = ensureBodySource(sourceId, body.source);
    if (err) return c.json({ error: { code: 'SOURCE_MISMATCH', message: err } }, 400);

    const result = await upsertOne(sourceId, body);
    return c.json({ data: result }, result ? 200 : 200);
  }
);

// DELETE /api/sources/:source_id/events/:source_event_id
sourcesRoute.delete('/:source_id/events/:source_event_id', async (c) => {
  const sourceId = c.req.param('source_id');
  const sourceEventId = c.req.param('source_event_id');
  if (!(await assertSourceExists(sourceId))) {
    return c.json(
      { error: { code: 'SOURCE_NOT_FOUND', message: `Unknown source: ${sourceId}` } },
      404
    );
  }
  const result = await deleteOne(sourceId, sourceEventId);
  if (result.deleted === 0) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'Event not found or already deleted' } },
      404
    );
  }
  return c.body(null, 204);
});
