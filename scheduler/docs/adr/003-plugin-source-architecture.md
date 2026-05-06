# ADR 003: プラグイン型ソース集約と Display Schema 駆動レンダリング

## ステータス

Accepted / 2026-05-02

---

## 文脈

Scheduler を「ハブ」として位置付け、以下のソースからイベントを集約する必要がある。

- **manual**: Scheduler 上で直接作成したイベント
- **study**: 勉強管理アプリから push されるイベント
- **shift**: シフトアプリから push されるイベント
- （将来）その他の外部アプリ

各ソースのイベントは「表示したい情報の種類」が異なる。例えば勉強イベントは「教科・進捗・参考書名」を表示したく、シフトイベントは「勤務場所・時給・メモ」を表示したい。

### 問題

この状況に対して、ナイーブに実装すると以下のいずれかの問題が発生する。

1. **ソース別のコンポーネントを Frontend に書く**: 新ソース追加のたびに Frontend を改修・デプロイする必要がある
2. **全フィールドを `events` テーブルに追加する**: テーブルが肥大化し、null カラムが増える。ソース固有の知識が Scheduler の DB に漏れ込む

---

## 決定

### 1. プラグイン型ソース集約アーキテクチャの採用

ソースアプリは統一の `ImportEvent` スキーマに従い、Scheduler API に PUT/POST/DELETE するだけでよい。Scheduler 側はソース固有のロジックを持たない。

新ソースを追加する手順は以下の 2 ステップのみ。

1. `sources` テーブルに 1 行 INSERT（name, color, icon 等）
2. 外部アプリ側で `ImportEvent` 形式を push する実装を追加する

Scheduler 本体のコード変更は不要。

```
[study app]  ──PUT /api/sources/study/events──→  ┐
[shift app]  ──PUT /api/sources/shift/events──→  ├→  [Scheduler API]  ←→  [PostgreSQL]
[manual UI]  ──POST /api/events──────────────→  ┘
```

#### (source, source_event_id) による冪等 Upsert

```sql
INSERT INTO events (source, source_event_id, ...)
VALUES (...)
ON CONFLICT (source, source_event_id)
DO UPDATE SET ...;
```

PUT `/api/sources/{source_id}/events` は全件 upsert であり、送信リストに含まれない既存レコードを論理削除する（差分削除）。

### 2. Ownership モデルの導入

imported イベント（source = 'study' / 'shift' 等）はデフォルトで **readonly** とし、Scheduler 上での直接編集を禁止する。

ユーザーが「切り離し（detach）」操作を行った場合、`ownership` を `'detached'` に変更し、以降はソースからの push による上書きを停止する。

```
ownership: 'source'   → 読み取り専用。ソースの push で常に上書きされる
ownership: 'detached' → Scheduler で編集可能。ソースの push は無視される
```

### 3. Display Schema 駆動レンダリングの採用（案 C）

各ソースの詳細表示内容をサーバー側で制御し、Frontend は汎用レンダラーで描画する。

#### イベント詳細取得レスポンス例

```json
{
  "data": {
    "id": "...",
    "title": "数学 - 微分積分",
    "start": "2026-05-02T09:00:00Z",
    "source": "study",
    "metadata": {
      "display": {
        "fields": [
          { "type": "badge",    "label": "教科",   "value": "数学" },
          { "type": "progress", "label": "進捗",   "value": 65, "max": 100 },
          { "type": "text",     "label": "参考書",  "value": "青チャート" },
          { "type": "tags",     "label": "タグ",   "value": ["微分", "積分"] }
        ],
        "actions": [
          { "label": "アプリで開く", "url": "studyapp://sessions/abc123" }
        ]
      },
      "raw": { ... }
    }
  }
}
```

Frontend はこの `fields` 配列をイテレートし、`type` に応じたコンポーネントで描画する。
ソース固有のカスタムレンダラーを登録することも可能（フォールバックチェーン）。

#### フォールバックチェーン

```
customRenderer（ソース別に登録可能）
    ↓ なければ
displaySchema（fields 配列を汎用コンポーネントで描画）
    ↓ なければ
raw KV 表示（metadata.raw の全フィールドをキー:値でフラットに表示）
```

---

## 結果

- 新しいソースアプリを追加しても **Scheduler のコードを変更せずに** 表示内容を制御できる
- Frontend のリリースなしに表示フィールドを変更できる（DBや外部アプリ側の変更のみ）
- `events` テーブルはソース非依存の共通フィールドのみを持ち、ソース固有データは `metadata.raw` に JSON として格納される
- imported イベントへの上書き注記は `event_overrides` テーブルで管理し、元データを汚染しない

### トレードオフ（受け入れるコスト）

| コスト | 評価 |
|--------|------|
| ImportEvent スキーマの変更が外部アプリに影響する | semver で管理し、後方互換性を保つ |
| Frontend がレンダリングロジックをサーバーに依存する | Scheduler が個人利用なので許容範囲。カスタムレンダラーで上書き可能 |
| detach 後はソースとの乖離が発生する可能性 | 意図的な操作であり仕様上の挙動 |

---

## 代替案と却下理由

| 代替案 | 却下理由 |
|--------|----------|
| **案 A: ソース別コンポーネントを Frontend に実装** | 新ソース追加のたびに Frontend 改修・デプロイが必要。Scheduler の関心事にソース固有ロジックが侵食する |
| **案 B: `events` テーブルにソース別カラムを追加** | テーブルが肥大化し、null カラムが増え続ける。ソース非依存のはずの Scheduler DB がソース仕様を知る必要が生じる |
| **Webhook 受信（Pull 型の逆）** | 外部アプリが常時稼働している前提が必要。push 型の方がシンプルで制御しやすい |
| **ownership なし（全件編集可能）** | ソースからの push でユーザーの手動修正が上書きされ、混乱を招く |
