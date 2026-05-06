# Scheduler — スケジュール管理アプリ（改良版）

## プロジェクト概要

ConoHa VPS 上で動作する個人向けスケジュール管理アプリ。
既存の Firebase + プレーンJS 実装を刷新し、複数アプリ（勉強管理・シフト）からの予定を集約する「ハブ」として設計する。

Google Calendar との同期は GAS 経由を維持しつつ、リアルタイム同期によるストレスを排除するため Outbox パターンを採用する。

---

## 決定事項サマリ

| 項目 | 決定内容 |
|------|----------|
| Frontend | Vite + React + TypeScript + TanStack Query |
| Backend | Hono (Node.js/TS) on ConoHa VPS |
| DB | PostgreSQL + Drizzle Kit |
| 認証 | なし（個人利用・UX優先） |
| テスト | Vitest (unit) + Playwright (E2E) |
| デプロイ | GitHub Actions + SSH rsync + systemd |
| GAS | Calendar アダプタのみ（旧 Firebase 直アクセスは廃止） |
| 同期方式 | Outbox パターン（5分/30分 cron + 日次ウィンドウバッチ） |
| 繰り返し | 個別インスタンス展開（RRULE展開なし） |
| 集約方式 | プラグイン型ソース（ImportEvent スキーマ） |

詳細は `docs/adr/` 配下の ADR を参照。

---

## アーキテクチャ概観

```
[勉強管理アプリ] ─push→ ┐
[シフトアプリ]   ─push→ ├→ [Scheduler API (Hono on ConoHa)] ←→ [PostgreSQL]
[手動入力UI]     ─────→ ┘                │
                                          ↓
                                    [sync_queue]
                                          ↓
                              [push worker (5min cron)]
                              [pull worker (30min cron)]
                              [window batch (daily)]
                                          ↓
                                    [GAS Web App (Calendar adapter)]
                                          ↓
                                  [Google Calendar (primary)]
```

---

## ディレクトリ構成

```
scheduler/
├── README.md
├── docs/
│   ├── adr/
│   │   ├── 001-tech-stack.md
│   │   ├── 002-firebase-removal-and-sync.md
│   │   └── 003-plugin-source-architecture.md
│   ├── data-model.md
│   ├── sync-design.md
│   ├── source-plugin.md
│   ├── ui-ux-improvements.md
│   └── directory-structure.md
├── frontend/          # Vite + React + TypeScript
├── backend/           # Hono (Node.js/TS)
├── shared/
│   └── types/         # 共有型定義 (ImportEvent 等)
└── scripts/           # cron worker, deployment scripts
```

詳細は `docs/directory-structure.md` を参照。

---

## ドキュメント一覧

| ファイル | 内容 |
|----------|------|
| `docs/adr/001-tech-stack.md` | 技術スタック選定の理由 |
| `docs/adr/002-firebase-removal-and-sync.md` | Firebase廃止・Outbox同期への移行理由 |
| `docs/adr/003-plugin-source-architecture.md` | プラグイン型集約・display schema設計の理由 |
| `docs/data-model.md` | ER図・テーブル定義・ImportEventスキーマ |
| `docs/sync-design.md` | Google Calendar同期の詳細フロー |
| `docs/source-plugin.md` | ソースプラグイン実装仕様・API定義 |
| `docs/ui-ux-improvements.md` | UI/UX改善の設計仕様 |
| `docs/directory-structure.md` | モノレポ構成の詳細 |

---

## 開発開始手順（プレースホルダ）

> 実装着手時に各セクションを埋めること。

### 前提条件

- Node.js v22+
- pnpm v9+
- PostgreSQL v16+
- ConoHa VPS（Ubuntu 22.04 推奨）

### ローカル環境セットアップ

```bash
# リポジトリクローン
git clone <repository-url>
cd scheduler

# 依存インストール
pnpm install

# 環境変数設定
cp backend/.env.example backend/.env
# backend/.env を編集（DB接続情報など）

# DBマイグレーション
pnpm --filter backend db:migrate

# 開発サーバー起動
pnpm dev  # frontend + backend を並列起動
```

### テスト実行

```bash
# ユニットテスト
pnpm test

# E2Eテスト
pnpm test:e2e
```

### デプロイ

```bash
# GitHub Actions による自動デプロイ（main ブランチへの push で発火）
# 詳細は .github/workflows/deploy.yml を参照
```

---

## 関連リポジトリ・サービス

| 名称 | 用途 |
|------|------|
| 旧 scdl_mgr | Firebase + プレーンJS 版（参照用） |
| GAS Web App | Google Calendar アダプタ |
| Google Calendar | 最終的なイベント同期先 |
