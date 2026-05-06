# life_app

個人向け life アプリ集の monorepo。3 アプリ + 共有 types。

## 構成

| パッケージ | 説明 | ローカル |
|-----------|------|---------|
| `scheduler/` | 集約ハブ + Google Calendar 同期 | API :3030 / Web :5173 |
| `study/` | 勉強管理 (時間割・タスク・進捗) | API :3001 / Web :5174 |
| `shift/` | バイトシフト管理 (収入計算) | API :3002 / Web :5175 |
| `shared/` | 共有型 (`@life-app/types`) | - |

## ローカル起動

前提: Docker, Node 20+, pnpm 9

```bash
# Postgres を Docker で起動（scheduler/docker-compose.yml）
cd scheduler && docker compose up -d && cd ..

# 依存インストール
pnpm install

# 各 .env を作成
cp scheduler/backend/.env.example scheduler/backend/.env  # 無ければ deploy/README.md 参照
cp study/backend/.env.example     study/backend/.env
cp shift/backend/.env.example     shift/backend/.env

# DB マイグレーション
pnpm --filter @scheduler/backend db:migrate
pnpm --filter @study/backend     db:migrate
pnpm --filter @shift/backend     db:migrate

# scheduler の sources を seed
pnpm --filter @scheduler/backend exec tsx --env-file=.env src/db/seed.ts

# 起動 (個別ターミナル)
pnpm --filter @scheduler/backend  dev
pnpm --filter @scheduler/frontend dev
pnpm --filter @study/backend      dev
pnpm --filter @study/frontend     dev
pnpm --filter @shift/backend      dev
pnpm --filter @shift/frontend     dev
```

## デプロイ

`deploy/README.md` を参照（ConoHa VPS にパス分けで 3 アプリをデプロイ）。

## アーキテクチャ

study / shift で発生したイベント（タスク・授業・シフト）は、各アプリの backend が
scheduler に push し、scheduler が一元管理 → Google Calendar に同期する。

```
[study]   ─push→ ┐
[shift]   ─push→ ├→ [scheduler API] ─→ [Postgres]
[manual]  ───── ┘                         │
                                          ↓
                                   [Google Calendar]
```
