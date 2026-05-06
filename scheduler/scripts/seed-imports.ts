/**
 * 動作確認用: study / shift ソースの ImportEvent をサンプル投入する。
 * 使い方: pnpm tsx scripts/seed-imports.ts
 */

const API = process.env.API_URL ?? 'http://localhost:3030/api';

interface ImportEvent {
  source: string;
  source_event_id: string;
  title: string;
  start: string;
  end: string;
  all_day: boolean;
  location?: string;
  description?: string;
  color?: string;
  metadata?: unknown;
}

function jstIso(dayOffset: number, hour: number, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour - 9, minute, 0, 0); // -9 to convert JST hour to UTC
  return d.toISOString();
}

const studyEvents: ImportEvent[] = [
  {
    source: 'study',
    source_event_id: 'study-task-1',
    title: '英単語 100語',
    start: jstIso(1, 7, 0),
    end: jstIso(1, 8, 0),
    all_day: false,
    color: '#27AE60',
    metadata: {
      display: {
        fields: [
          { type: 'progress', label: '進捗', value: 35, max: 100, unit: '語' },
          { type: 'badge', label: '科目', value: '英語', color: '#10b981' },
          { type: 'tags', label: 'タグ', value: ['暗記', '毎日'] },
        ],
        actions: [{ label: '勉強アプリで開く', url: 'https://example.com/study/1' }],
      },
    },
  },
  {
    source: 'study',
    source_event_id: 'study-task-2',
    title: '数学 過去問演習',
    start: jstIso(2, 19, 0),
    end: jstIso(2, 20, 30),
    all_day: false,
    color: '#27AE60',
    metadata: {
      display: {
        fields: [
          { type: 'badge', label: '科目', value: '数学', color: '#3b82f6' },
          { type: 'multiline', label: '範囲', value: '微分積分 第3章\n問題 5–12' },
        ],
      },
    },
  },
];

const shiftEvents: ImportEvent[] = [
  {
    source: 'shift',
    source_event_id: 'shift-001',
    title: 'カフェ店員',
    start: jstIso(3, 10, 0),
    end: jstIso(3, 18, 0),
    all_day: false,
    color: '#E67E22',
    metadata: {
      display: {
        fields: [
          { type: 'text', label: '店舗', value: '渋谷店' },
          { type: 'text', label: '時給', value: '¥1,200' },
          { type: 'progress', label: '今月の収入', value: 48000, max: 80000, unit: '円' },
        ],
      },
    },
  },
  {
    source: 'shift',
    source_event_id: 'shift-002',
    title: 'カフェ店員',
    start: jstIso(5, 13, 0),
    end: jstIso(5, 21, 0),
    all_day: false,
    color: '#E67E22',
  },
];

async function put(source: string, events: ImportEvent[]) {
  const res = await fetch(`${API}/sources/${source}/events`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(events),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`PUT ${source} failed: ${res.status} ${body}`);
  }
  console.log(`✔ ${source}: ${events.length} events`, await res.json());
}

async function main() {
  await put('study', studyEvents);
  await put('shift', shiftEvents);
  console.log('done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
