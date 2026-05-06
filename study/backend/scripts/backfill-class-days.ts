/**
 * combi の Firebase RTDB から各学期の classDays を取得し、
 * study DB の class_days テーブルに backfill する。
 * 学期名の一致でマッピングする。
 */
import postgres from 'postgres';

const FIREBASE_URL = 'https://manager-8ac68-default-rtdb.asia-southeast1.firebasedatabase.app';
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL not set');

async function main() {
  const sql = postgres(DATABASE_URL!);

  const fbSemesters = await fetch(`${FIREBASE_URL}/semesters.json`).then((r) => r.json());
  const studySemesters = await sql<{ id: string; name: string }[]>`
    SELECT id, name FROM semesters
  `;

  let total = 0;
  for (const [, fbSem] of Object.entries(fbSemesters as Record<string, { name: string; classDays?: string[] }>)) {
    if (!fbSem || typeof fbSem !== 'object' || !fbSem.name) continue;
    const matched = studySemesters.find((s) => s.name === fbSem.name);
    if (!matched) {
      console.log(`  skip "${fbSem.name}" (not in study DB)`);
      continue;
    }
    const dates = fbSem.classDays ?? [];
    if (dates.length === 0) continue;
    await sql`DELETE FROM class_days WHERE semester_id = ${matched.id}`;
    for (const d of dates) {
      await sql`INSERT INTO class_days (semester_id, date) VALUES (${matched.id}, ${d}) ON CONFLICT DO NOTHING`;
    }
    console.log(`  ✓ ${fbSem.name}: ${dates.length} class days`);
    total += dates.length;
  }
  console.log(`\nTotal: ${total} class days backfilled`);
  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
