import type { ImportEvent } from '@life-app/types';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { subjects, type TaskRow } from '../db/schema.js';

const SCHEDULER_API_URL = process.env.SCHEDULER_API_URL ?? 'http://localhost:3000';
const SOURCE_ID = process.env.SCHEDULER_SOURCE_ID ?? 'study';
const ENABLED = process.env.SCHEDULER_PUSH_ENABLED === 'true';

async function fetchSubjectName(subjectId: string | null): Promise<string | null> {
  if (!subjectId) return null;
  const rows = await db
    .select({ name: subjects.name })
    .from(subjects)
    .where(eq(subjects.id, subjectId))
    .limit(1);
  return rows[0]?.name ?? null;
}

function taskToImportEvent(task: TaskRow, subjectName: string | null): ImportEvent {
  const due = task.dueDate; // YYYY-MM-DD
  // タイトルが科目名と一致する場合は科目名のみ、そうでなければ「[科目] タイトル」
  const title = subjectName
    ? task.title === subjectName
      ? subjectName
      : `[${subjectName}] ${task.title}`
    : task.title;
  return {
    source: SOURCE_ID,
    source_event_id: `task:${task.id}`,
    title,
    start: `${due}T00:00:00+09:00`,
    end: `${due}T23:59:59+09:00`,
    all_day: true,
    description: task.detail ?? undefined,
    category: task.type,
    metadata: {
      raw: { taskId: task.id, type: task.type, completed: task.completed },
    },
  };
}

export async function pushTaskToScheduler(task: TaskRow): Promise<void> {
  if (!ENABLED) return;
  // 完了済みタスクは scheduler 側から削除
  if (task.completed) {
    await deleteTaskFromScheduler(task.id);
    return;
  }
  const subjectName = await fetchSubjectName(task.subjectId);
  const ev = taskToImportEvent(task, subjectName);
  const res = await fetch(`${SCHEDULER_API_URL}/api/sources/${SOURCE_ID}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ev),
  });
  if (!res.ok) {
    throw new Error(`scheduler push failed: ${res.status} ${await res.text()}`);
  }
}

export async function deleteTaskFromScheduler(taskId: string): Promise<void> {
  if (!ENABLED) return;
  const res = await fetch(
    `${SCHEDULER_API_URL}/api/sources/${SOURCE_ID}/events/task:${taskId}`,
    { method: 'DELETE' }
  );
  // 404 は既に存在しないだけなので無視
  if (!res.ok && res.status !== 404) {
    throw new Error(`scheduler delete failed: ${res.status} ${await res.text()}`);
  }
}
