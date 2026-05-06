# ディレクトリ構成

---

## モノレポ全体構成

```
scheduler/
├── README.md
├── package.json                  # ワークスペースルート (pnpm workspaces)
├── pnpm-workspace.yaml
├── tsconfig.base.json            # 全パッケージ共通の TS 設定
├── .env.example                  # 環境変数テンプレート（.gitignore に .env* を追加済み）
├── .github/
│   └── workflows/
│       ├── ci.yml                # テスト・Lint・型チェック
│       └── deploy.yml            # main ブランチへの push で ConoHa にデプロイ
│
├── frontend/                     # Vite + React + TypeScript
├── backend/                      # Hono (Node.js / TypeScript)
├── shared/                       # frontend/backend 間の共有モジュール
└── scripts/                      # cron worker・デプロイスクリプト等
```

---

## frontend/

```
frontend/
├── package.json
├── tsconfig.json                  # extends tsconfig.base.json
├── vite.config.ts
├── vitest.config.ts
├── playwright.config.ts
├── index.html
├── public/
│   ├── manifest.json              # PWA マニフェスト（将来対応）
│   └── icons/
│
└── src/
    ├── main.tsx                   # エントリーポイント
    ├── App.tsx                    # ルーティング定義
    │
    ├── features/                  # 機能単位のモジュール（Feature Slicing）
    │   ├── calendar/              # カレンダー表示機能
    │   │   ├── components/
    │   │   │   ├── CalendarGrid.tsx
    │   │   │   ├── EventBlock.tsx         # カレンダー上のイベントブロック
    │   │   │   ├── OverlapBadge.tsx       # 重複バッジ
    │   │   │   └── OverlapListModal.tsx   # 重複一覧モーダル
    │   │   ├── hooks/
    │   │   │   ├── useCalendarEvents.ts   # TanStack Query ラッパー
    │   │   │   ├── useLongPress.ts        # 長押しカスタムフック
    │   │   │   └── useOverlapDetect.ts    # 重複検出ロジック
    │   │   └── index.ts
    │   │
    │   ├── event-detail/          # イベント詳細表示機能
    │   │   ├── components/
    │   │   │   ├── EventDetailModal.tsx
    │   │   │   ├── DisplayFieldRenderer.tsx   # display schema 汎用レンダラー
    │   │   │   ├── ReadonlyBanner.tsx          # source管理中のバナー
    │   │   │   └── DetachConfirmDialog.tsx
    │   │   ├── custom-renderers/
    │   │   │   ├── index.ts               # customRenderers マップ
    │   │   │   ├── StudyEventDetail.tsx   # study ソース用カスタムレンダラー
    │   │   │   └── ShiftEventDetail.tsx   # shift ソース用カスタムレンダラー
    │   │   └── index.ts
    │   │
    │   ├── event-form/            # イベント作成・編集フォーム
    │   │   ├── components/
    │   │   │   ├── EventFormModal.tsx
    │   │   │   ├── RecurrenceSettings.tsx  # 繰り返し設定
    │   │   │   └── ReminderSettings.tsx
    │   │   ├── hooks/
    │   │   │   ├── useCreateEvent.ts
    │   │   │   └── useUpdateEvent.ts
    │   │   └── index.ts
    │   │
    │   └── event-delete/          # 削除フロー
    │       ├── components/
    │       │   └── DeleteConfirmDialog.tsx  # 状態遷移付き削除確認ダイアログ
    │       ├── hooks/
    │       │   └── useDeleteEvent.ts
    │       └── index.ts
    │
    ├── components/                # 共通 UI コンポーネント
    │   ├── Toast/
    │   │   ├── Toast.tsx
    │   │   ├── ToastContainer.tsx
    │   │   └── toast-store.ts     # Zustand store
    │   ├── Button/
    │   ├── Spinner/
    │   ├── Dialog/
    │   ├── BottomSheet/
    │   └── Badge/
    │
    ├── lib/
    │   ├── api-client.ts          # fetch ラッパー (base URL, error handling)
    │   ├── date-utils.ts          # date-fns-tz ラッパー (JST 変換等)
    │   └── query-client.ts        # TanStack Query の QueryClient 設定
    │
    └── tests/
        ├── unit/                  # Vitest ユニットテスト
        │   ├── overlap-detect.test.ts
        │   └── long-press.test.ts
        └── e2e/                   # Playwright E2E テスト
            ├── create-event.spec.ts
            ├── delete-event.spec.ts
            └── overlap-badge.spec.ts
```

---

## backend/

```
backend/
├── package.json
├── tsconfig.json
├── .env.example
│
├── src/
│   ├── index.ts                   # Hono アプリのエントリーポイント + systemd 起動
│   ├── app.ts                     # Hono インスタンス生成・ミドルウェア登録
│   │
│   ├── routes/                    # エンドポイント定義
│   │   ├── events.ts              # GET/POST/PUT/PATCH/DELETE /api/events
│   │   ├── sources.ts             # PUT/POST/DELETE /api/sources/:id/events
│   │   └── health.ts              # GET /health
│   │
│   ├── db/
│   │   ├── schema.ts              # Drizzle スキーマ定義（全テーブル）
│   │   ├── migrations/            # drizzle-kit generate で自動生成
│   │   │   └── 0001_initial.sql
│   │   └── index.ts               # DB 接続・クライアント export
│   │
│   ├── services/                  # ビジネスロジック
│   │   ├── event-service.ts       # イベント CRUD・recurrence 展開
│   │   ├── source-sync-service.ts # ImportEvent の upsert・差分削除
│   │   └── detach-service.ts      # ownership 変更ロジック
│   │
│   ├── validators/                # Zod バリデーションスキーマ
│   │   ├── import-event.ts
│   │   └── event-query.ts
│   │
│   └── middleware/
│       ├── error-handler.ts       # 全体エラーハンドラ
│       └── request-logger.ts      # リクエストログ
│
└── tests/
    └── unit/
        ├── source-sync-service.test.ts
        └── event-service.test.ts
```

---

## shared/types/

```
shared/
├── package.json
├── tsconfig.json
└── types/
    ├── import-event.ts            # ImportEvent 型定義
    ├── display-field.ts           # DisplayField / DisplayAction 型定義
    ├── event.ts                   # Event (API レスポンス) 型定義
    └── index.ts                   # re-export まとめ
```

frontend・backend 両方が `@scheduler/types` としてインポートする。

```json
// pnpm-workspace.yaml
packages:
  - 'frontend'
  - 'backend'
  - 'shared'
```

```json
// frontend/package.json (抜粋)
{
  "dependencies": {
    "@scheduler/types": "workspace:*"
  }
}
```

---

## scripts/

```
scripts/
├── package.json
├── tsconfig.json
├── push-worker.ts                 # sync_queue flush → GAS push (5分 cron)
├── pull-worker.ts                 # GAS から差分 pull (30分 cron)
├── window-batch.ts                # 同期ウィンドウ管理 (日次 cron)
└── lib/
    ├── gas-client.ts              # GAS Web App との通信クライアント
    └── db.ts                      # DB 接続（backend/src/db/index.ts を共用）
```

---

## .github/workflows/

### ci.yml（PR・push 時）

```yaml
jobs:
  ci:
    steps:
      - pnpm install
      - pnpm --filter shared build    # 型定義をビルド
      - pnpm --filter backend typecheck
      - pnpm --filter frontend typecheck
      - pnpm --filter backend test
      - pnpm --filter frontend test
      - pnpm --filter frontend build  # ビルドが通るか確認
```

### deploy.yml（main ブランチへの push 時）

```yaml
jobs:
  deploy:
    steps:
      - pnpm install
      - pnpm build                     # frontend + backend をビルド
      - rsync -avz --delete dist/ user@conoha:/opt/scheduler/
      - ssh user@conoha "systemctl restart scheduler-api.service"
```

---

## ConoHa VPS 上のディレクトリ

```
/opt/scheduler/
├── frontend/dist/                 # Nginx で配信する静的ファイル
├── backend/dist/                  # Node.js で実行するバンドル
├── scripts/dist/                  # cron worker のバンドル
├── .env                           # 本番環境変数（git 管理外）
└── logs/                          # アプリケーションログ（systemd journal が主）
```

### Nginx 設定イメージ

```nginx
server {
    listen 443 ssl;
    server_name scheduler.example.com;

    # 静的ファイル (frontend)
    location / {
        root /opt/scheduler/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # API プロキシ (backend)
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### systemd サービス一覧

| サービス名 | 種類 | 実行間隔 |
|-----------|------|---------|
| `scheduler-api.service` | 常駐 (Restart=always) | — |
| `scheduler-push.timer` + `.service` | oneshot + timer | 5分 |
| `scheduler-pull.timer` + `.service` | oneshot + timer | 30分 |
| `scheduler-window-batch.timer` + `.service` | oneshot + timer | 日次 03:00 JST |
