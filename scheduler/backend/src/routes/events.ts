import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eventQuerySchema } from '../validators/event-query.js';
import {
  createEventSchema,
  updateEventSchema,
  eventOverrideSchema,
  editScopeSchema,
} from '../validators/event-input.js';
import {
  listEventsInRange,
  getEventById,
  createManualEvent,
  updateEvent,
  deleteEvent,
  upsertOverride,
} from '../services/event-service.js';

export const eventsRoute = new Hono();

eventsRoute.get('/', zValidator('query', eventQuerySchema), async (c) => {
  const { from, to } = c.req.valid('query');
  const data = await listEventsInRange(new Date(from), new Date(to));
  return c.json({ data, meta: { count: data.length } });
});

eventsRoute.get('/:id', async (c) => {
  const ev = await getEventById(c.req.param('id'));
  if (!ev) return c.json({ error: { code: 'NOT_FOUND', message: 'Event not found' } }, 404);
  return c.json({ data: ev });
});

eventsRoute.post('/', zValidator('json', createEventSchema), async (c) => {
  const created = await createManualEvent(c.req.valid('json'));
  return c.json({ data: created, meta: { count: created.length } }, 201);
});

eventsRoute.patch('/:id', zValidator('json', updateEventSchema), async (c) => {
  const result = await updateEvent(c.req.param('id'), c.req.valid('json'));
  if ('error' in result) {
    if (result.error === 'NOT_FOUND') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Event not found' } }, 404);
    }
    return c.json(
      {
        error: {
          code: 'READONLY',
          message: 'Imported events are readonly.',
        },
      },
      409
    );
  }
  return c.json({ data: { updated: result.updated, ids: result.ids } });
});

eventsRoute.delete(
  '/:id',
  zValidator('query', z.object({ scope: editScopeSchema.optional() })),
  async (c) => {
    const { scope } = c.req.valid('query');
    const result = await deleteEvent(c.req.param('id'), scope ?? 'this');
    if ('error' in result) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Event not found' } }, 404);
    }
    return c.json({ data: { deleted: result.deleted } });
  }
);

eventsRoute.put(
  '/:id/override',
  zValidator('json', eventOverrideSchema),
  async (c) => {
    const result = await upsertOverride(c.req.param('id'), c.req.valid('json'));
    if ('error' in result) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Event not found' } }, 404);
    }
    return c.json({ data: { ok: true } });
  }
);
