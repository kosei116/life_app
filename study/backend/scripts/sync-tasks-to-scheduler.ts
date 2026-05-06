/**
 * 既存の study タスクを一括で scheduler に push する。
 * 移行直後に SQL で投入されたタスクは scheduler に届いていないので、これで同期する。
 */
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL not set');

const SCHEDULER_API_URL = process.env.SCHEDULER_API_URL ?? 'http://localhost:3030';
const SOURCE_ID = process.env.SCHEDULER_SOURCE_ID ?? 'study';

async function main() {
  const sql = postgres(DATABASE_URL!);
  const tasks = await sql<
    {
      id: string;
      title: string;
      type: string;
      due_date: string;
      detail: string | null;
      completed: boolean;
      subject_id: string | null;
      subject_name: string | null;
    }[]
  >`
    SELECT t.id, t.title, t.type, to_char(t.due_date, 'YYYY-MM-DD') AS due_date, t.detail, t.completed, t.subject_id, s.name AS subject_name
    FROM tasks t
    LEFT JOIN subjects s ON s.id = t.subject_id
    WHERE t.completed = false
  `;

  console.log(`Pushing ${tasks.length} active tasks to scheduler...`);
  let ok = 0, fail = 0;
  for (const t of tasks) {
    const title = t.subject_name
      ? t.title === t.subject_name
        ? t.subject_name
        : `[${t.subject_name}] ${t.title}`
      : t.title;
    const ev = {
      source: SOURCE_ID,
      source_event_id: `task:${t.id}`,
      title,
      start: `${t.due_date}T00:00:00+09:00`,
      end: `${t.due_date}T23:59:59+09:00`,
      all_day: true,
      description: t.detail ?? undefined,
      category: t.type,
      metadata: { raw: { taskId: t.id, type: t.type, completed: false } },
    };
    const res = await fetch(`${SCHEDULER_API_URL}/api/sources/${SOURCE_ID}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ev),
    });
    if (res.ok) ok++;
    else {
      fail++;
      console.error(`  ✗ ${t.title}: ${res.status} ${await res.text()}`);
    }
  }
  console.log(`Done: ${ok} pushed, ${fail} failed`);
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
