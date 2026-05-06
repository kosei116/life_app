import { db } from './index.js';
import { sources } from './schema.js';

const SEED_SOURCES = [
  { id: 'manual', name: '手動入力', color: '#4A90D9', priority: 0 },
  { id: 'study', name: '勉強管理', color: '#27AE60', priority: 1 },
  { id: 'study-class', name: '授業', color: '#16A085', priority: 1 },
  { id: 'shift', name: 'シフト', color: '#E67E22', priority: 2 },
];

async function main() {
  for (const src of SEED_SOURCES) {
    await db.insert(sources).values(src).onConflictDoNothing();
  }
  console.log('Seeded sources:', SEED_SOURCES.map((s) => s.id).join(', '));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
