import { db } from '../../src/db/index.js';
import { sql } from 'drizzle-orm';

export async function resetDb() {
  await db.execute(sql`TRUNCATE TABLE sync_queue, sync_mapping, event_overrides, events RESTART IDENTITY CASCADE`);
}

export async function seedSourcesIfMissing() {
  await db.execute(sql`
    INSERT INTO sources (id, name, color, priority) VALUES
      ('manual', 'Manual', '#4A90D9', 0),
      ('study',  'Study',  '#27AE60', 1),
      ('shift',  'Shift',  '#E67E22', 2)
    ON CONFLICT (id) DO NOTHING
  `);
}
