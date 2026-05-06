# データモデル仕様

---

## ER 図

```mermaid
erDiagram
    events {
        uuid        id                  PK
        text        source              "manual|study|shift|..."
        text        source_event_id     "ソース側のID (sourceがmanualならnull)"
        text        ownership           "source|detached"
        text        title
        timestamptz start_at
        timestamptz end_at
        boolean     all_day
        text        location
        text        description
        text        category
        text        color
        jsonb       reminders           "[分前, ...]"
        jsonb       metadata            "display.fields/actions, raw"
        uuid        recurrence_group_id "繰り返しグループID"
        int         recurrence_index    "グループ内のインデックス (0始まり)"
        text        google_event_id     "Calendar側のイベントID"
        text        google_etag         "Calendar側のetag"
        timestamptz deleted_at          "論理削除"
        timestamptz created_at
        timestamptz updated_at
    }

    sources {
        text        id                  PK  "manual|study|shift|..."
        text        name                "表示名"
        text        color               "#RRGGBB"
        text        icon                "アイコン識別子"
        boolean     enabled
        int         priority            "表示優先度 (低い値が優先)"
        timestamptz created_at
    }

    sync_queue {
        uuid        id                  PK
        uuid        event_id            FK
        text        operation           "upsert|delete"
        int         retry_count
        timestamptz scheduled_at
        timestamptz processed_at
        text        error_message
        timestamptz created_at
    }

    sync_mapping {
        uuid        event_id            PK  FK
        text        google_event_id
        text        google_calendar_id
        boolean     tombstone           "Calendar物理削除済み"
        text        sync_token          "Calendarの差分トークン"
        timestamptz last_pushed_at
        timestamptz last_pulled_at
        timestamptz created_at
        timestamptz updated_at
    }

    event_overrides {
        uuid        id                  PK
        uuid        event_id            FK
        boolean     hidden
        text        color_override
        text        note
        timestamptz created_at
        timestamptz updated_at
    }

    events ||--o| sync_queue      : "has"
    events ||--o| sync_mapping    : "has"
    events ||--o| event_overrides : "has"
    events }o--|| sources         : "belongs to"
```

---

## テーブル定義

### events

イベント本体テーブル。手動入力・インポート問わず全イベントを格納する。

| カラム | 型 | 制約 | 説明 |
|--------|----|------|------|
| `id` | UUID | PK, DEFAULT gen_random_uuid() | 主キー |
| `source` | TEXT | NOT NULL | `manual` / `study` / `shift` / ... |
| `source_event_id` | TEXT | NULLABLE | ソース側のID。source=manual の場合は NULL |
| `ownership` | TEXT | NOT NULL, DEFAULT 'source' | `source` (readonly) / `detached` (編集可) |
| `title` | TEXT | NOT NULL | イベントタイトル |
| `start_at` | TIMESTAMPTZ | NOT NULL | 開始日時 (UTC) |
| `end_at` | TIMESTAMPTZ | NOT NULL | 終了日時 (UTC) |
| `all_day` | BOOLEAN | NOT NULL, DEFAULT false | 終日フラグ |
| `location` | TEXT | NULLABLE | 場所 |
| `description` | TEXT | NULLABLE | 説明文 |
| `category` | TEXT | NULLABLE | カテゴリ |
| `color` | TEXT | NULLABLE | 表示色 (#RRGGBB) |
| `reminders` | JSONB | NULLABLE, DEFAULT '[]' | 通知タイミング配列（分前の整数配列） |
| `metadata` | JSONB | NULLABLE | display.fields / display.actions / raw |
| `recurrence_group_id` | UUID | NULLABLE | 繰り返しグループのID |
| `recurrence_index` | INTEGER | NULLABLE | グループ内の順序 (0始まり) |
| `google_event_id` | TEXT | NULLABLE | Google Calendar 側のイベントID |
| `google_etag` | TEXT | NULLABLE | Google Calendar 側の etag |
| `deleted_at` | TIMESTAMPTZ | NULLABLE | 論理削除日時 (NULL = 有効) |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | 作成日時 |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | 更新日時 |

**インデックス**

```sql
-- 期間絞り込み（メイン画面のクエリで必ず使用）
CREATE INDEX idx_events_start_at ON events (start_at) WHERE deleted_at IS NULL;

-- ソース別upsert用（冪等性保証）
CREATE UNIQUE INDEX idx_events_source_event_id ON events (source, source_event_id)
  WHERE source_event_id IS NOT NULL AND deleted_at IS NULL;

-- 繰り返しグループ操作用
CREATE INDEX idx_events_recurrence_group ON events (recurrence_group_id, recurrence_index)
  WHERE recurrence_group_id IS NOT NULL;
```

---

### sources

ソースの自己申告テーブル。新ソース追加時に 1 行 INSERT するだけでよい。

| カラム | 型 | 制約 | 説明 |
|--------|----|------|------|
| `id` | TEXT | PK | `manual` / `study` / `shift` / ... |
| `name` | TEXT | NOT NULL | 表示名（例: "勉強管理"） |
| `color` | TEXT | NOT NULL | 代表色 (#RRGGBB) |
| `icon` | TEXT | NULLABLE | アイコン識別子 |
| `enabled` | BOOLEAN | NOT NULL, DEFAULT true | 表示ON/OFF |
| `priority` | INTEGER | NOT NULL, DEFAULT 0 | 表示優先度（小さい値が優先） |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | 登録日時 |

**初期データ**

```sql
INSERT INTO sources (id, name, color, priority) VALUES
  ('manual', '手動入力', '#4A90D9', 0),
  ('study',  '勉強管理', '#27AE60', 1),
  ('shift',  'シフト',   '#E67E22', 2);
```

---

### sync_queue

Google Calendar への push を非同期で管理する Outbox テーブル。

| カラム | 型 | 制約 | 説明 |
|--------|----|------|------|
| `id` | UUID | PK, DEFAULT gen_random_uuid() | 主キー |
| `event_id` | UUID | NOT NULL, FK → events.id | 対象イベント |
| `operation` | TEXT | NOT NULL | `upsert` / `delete` |
| `retry_count` | INTEGER | NOT NULL, DEFAULT 0 | リトライ回数 |
| `scheduled_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | 処理予定日時 |
| `processed_at` | TIMESTAMPTZ | NULLABLE | 処理完了日時 (NULL = 未処理) |
| `error_message` | TEXT | NULLABLE | 最後のエラーメッセージ |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | 作成日時 |

**インデックス**

```sql
-- push worker がポーリングするクエリ用
CREATE INDEX idx_sync_queue_unprocessed
  ON sync_queue (scheduled_at)
  WHERE processed_at IS NULL;
```

**動作ルール**

- push worker は `processed_at IS NULL AND retry_count < 5` のレコードを処理対象とする
- 処理成功時: `processed_at = now()` を更新
- 処理失敗時: `retry_count += 1`, `error_message` を記録, `scheduled_at` を指数バックオフで更新
- 同一 `event_id` に複数レコードが積まれた場合、最新の `upsert` のみを処理すればよい（前のレコードは `processed_at` を設定して済みにする）

---

### sync_mapping

イベント ID と Google Calendar イベント ID の対応テーブル。

| カラム | 型 | 制約 | 説明 |
|--------|----|------|------|
| `event_id` | UUID | PK, FK → events.id | Scheduler 側のイベントID |
| `google_event_id` | TEXT | NOT NULL | Calendar 側のイベントID |
| `google_calendar_id` | TEXT | NOT NULL | 対象カレンダーID（primary 等） |
| `tombstone` | BOOLEAN | NOT NULL, DEFAULT false | Calendar 側を物理削除済みかどうか |
| `sync_token` | TEXT | NULLABLE | Calendar の差分取得用トークン（カレンダー単位） |
| `last_pushed_at` | TIMESTAMPTZ | NULLABLE | 最後に push した日時 |
| `last_pulled_at` | TIMESTAMPTZ | NULLABLE | 最後に pull で更新した日時 |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | 作成日時 |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | 更新日時 |

---

### event_overrides

imported イベントへのユーザー上書き設定。元の `events` レコードを変更せず保持する。

| カラム | 型 | 制約 | 説明 |
|--------|----|------|------|
| `id` | UUID | PK, DEFAULT gen_random_uuid() | 主キー |
| `event_id` | UUID | NOT NULL, UNIQUE, FK → events.id | 対象イベント（1イベント1レコード） |
| `hidden` | BOOLEAN | NULLABLE | 非表示にするか |
| `color_override` | TEXT | NULLABLE | 色の上書き (#RRGGBB) |
| `note` | TEXT | NULLABLE | ユーザーメモ |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | 作成日時 |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | 更新日時 |

---

## ImportEvent スキーマ

外部ソースアプリが Scheduler API に送信する標準フォーマット。

```typescript
type DisplayFieldType =
  | 'text'
  | 'multiline'
  | 'link'
  | 'badge'
  | 'progress'
  | 'date'
  | 'tags';

type DisplayField =
  | { type: 'text';      label: string; value: string }
  | { type: 'multiline'; label: string; value: string }
  | { type: 'link';      label: string; value: string; url: string }
  | { type: 'badge';     label: string; value: string; color?: string }
  | { type: 'progress';  label: string; value: number; max: number; unit?: string }
  | { type: 'date';      label: string; value: string }  // ISO 8601
  | { type: 'tags';      label: string; value: string[] };

type DisplayAction = {
  label: string;
  url: string;           // ディープリンク or HTTPS URL
  icon?: string;
};

type ImportEvent = {
  source: string;              // 'study' | 'shift' | ...
  source_event_id: string;     // ソース側でユニークなID
  title: string;
  start: string;               // ISO 8601 (UTC 推奨)
  end: string;                 // ISO 8601 (UTC 推奨)
  all_day: boolean;
  location?: string;
  description?: string;
  category?: string;
  color?: string;              // #RRGGBB
  reminders?: number[];        // 何分前に通知するか
  metadata?: {
    display?: {
      fields?: DisplayField[];
      actions?: DisplayAction[];
    };
    raw?: unknown;             // ソース固有の構造化データ
  };
};
```

---

## Recurrence Group 仕様

繰り返しイベントは RRULE 展開ではなく、作成時に個別インスタンスとして DB に INSERT する。

### 構造

```
recurrence_group_id: "550e8400-e29b-41d4-a716-446655440000"
  ├── recurrence_index: 0  → 2026-05-05 (火) 10:00-11:00
  ├── recurrence_index: 1  → 2026-05-12 (火) 10:00-11:00
  ├── recurrence_index: 2  → 2026-05-19 (火) 10:00-11:00
  └── recurrence_index: 3  → 2026-05-26 (火) 10:00-11:00
```

### 編集スコープの表現

| ユーザー操作 | WHERE 句 |
|-------------|---------|
| この回だけ変更 | `WHERE id = :id` |
| この回以降を変更 | `WHERE recurrence_group_id = :gid AND recurrence_index >= :idx` |
| すべての回を変更 | `WHERE recurrence_group_id = :gid` |

### 作成フロー

1. モーダルで「毎週火曜、4回」を設定する
2. Backend で `recurrence_group_id = gen_random_uuid()` を生成する
3. 4 行を `recurrence_index = 0, 1, 2, 3` でバルク INSERT する
4. 4 行分の `sync_queue` レコードを `operation = 'upsert'` で INSERT する

---

## Ownership 仕様

| ownership | 値 | 意味 |
|-----------|-----|------|
| `source` | デフォルト | ソースアプリが管理。push で上書きされる。Scheduler 上での編集不可 |
| `detached` | ユーザーが切り離し後 | Scheduler が管理。ソースの push は無視される。Scheduler 上で自由に編集可 |

### detach 操作

```
PATCH /api/events/:id
{ "ownership": "detached" }
```

detach 後は `source_event_id` を NULL にクリアし、`source` を `'manual'` に変更する。
これにより以降の `PUT /api/sources/{source_id}/events` の差分削除対象にならない。

---

## タイムゾーン方針

| 場面 | 扱い |
|------|------|
| DB 保存 | TIMESTAMPTZ（UTC で保存） |
| API 入出力 | ISO 8601 UTC（例: `2026-05-02T09:00:00Z`） |
| Frontend 表示 | `Asia/Tokyo` に変換して表示 |
| all_day イベント | `start_at` に `T00:00:00Z` を設定、`end_at` に `T23:59:59Z` を設定 |

Frontend の変換例:

```typescript
import { toZonedTime, format } from 'date-fns-tz';

const DISPLAY_TZ = 'Asia/Tokyo';

function formatEventTime(utcString: string): string {
  const zoned = toZonedTime(new Date(utcString), DISPLAY_TZ);
  return format(zoned, 'HH:mm', { timeZone: DISPLAY_TZ });
}
```
