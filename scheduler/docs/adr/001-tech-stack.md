# ADR 001: 技術スタック選定

## ステータス

Accepted / 2026-05-02

---

## 文脈

既存の scdl_mgr は Firebase Realtime Database + プレーンJS で構築されており、以下の課題がある。

- Firebase への依存によりローカル開発・テストが困難
- プレーンJS では型安全性がなく、拡張時にバグが混入しやすい
- Google Calendar との同期がリアルタイムで設計されており、操作のたびに Calendar API を叩くストレスがある
- TanStack Query / Drizzle など現代的なデータ管理ライブラリが使えない
- 認証を Firebase Auth に依存しており、個人利用では過剰

ConoHa VPS に移行するにあたり、技術スタック全体を刷新する。

---

## 決定

### Frontend: Vite + React + TypeScript + TanStack Query

**Vite**
- esbuild ベースの高速 HMR により開発体験が大幅に向上する
- Create React App はメンテ停止状態であり、現時点では Vite が業界標準

**React**
- 既存コードに React の知識が蓄積されており、学習コストが最小
- エコシステムの成熟度が高く、必要なライブラリが揃っている

**TypeScript**
- ソースプラグインの ImportEvent スキーマなど、複数コンポーネント間で型を共有するユースケースに必須
- `shared/types/` で backend/frontend 間の型共有が可能になる
- バグの早期発見によりメンテナンスコストを下げる

**TanStack Query**
- サーバー状態（イベント一覧など）とクライアント状態（UIの開閉）を明確に分離できる
- 楽観的更新・キャッシュ無効化・リトライが宣言的に書ける
- `useQuery` / `useMutation` でローディング/エラー状態を統一的に扱える

### Backend: Hono (Node.js/TypeScript)

- Express より型安全で、Zod バリデーションとの統合がシームレス
- Edge/Node/Bun すべてで動作するため将来の実行環境変更に柔軟
- 軽量（依存ゼロに近い）で ConoHa VPS の限られたリソースに適している
- OpenAPI スキーマ自動生成プラグインが存在し、API ドキュメントを維持しやすい
- Fastify と比較した場合、TypeScript ファーストな API がより直感的

### DB: PostgreSQL + Drizzle Kit

**PostgreSQL**
- TIMESTAMPTZ（タイムゾーン付き日時）型のネイティブサポートが必須要件
- JSON カラムで `metadata.raw` などの半構造データを扱える
- SQLite より本番環境での実績・ツールが豊富
- ConoHa VPS 上での自己ホストが容易（apt install postgresql）

**Drizzle ORM / Drizzle Kit**
- TypeScript-first で、スキーマ定義とマイグレーションが一元管理できる
- クエリビルダーが SQL に近い記述で、生成 SQL を把握しやすい（N+1 対策を明示的に行える）
- `drizzle-kit generate` でマイグレーションファイルを自動生成
- Prisma と比較して実行時のオーバーヘッドが小さい

### インフラ: ConoHa VPS

- 月額固定コストで予測可能な費用（Firebase の従量課金と異なる）
- 日本リージョンで低レイテンシ
- SSH + systemd による直接デプロイでシンプルな運用
- PostgreSQL、Node.js、Nginx を同一サーバーで運用できる小規模構成に適している

### テスト: Vitest + Playwright

**Vitest**
- Vite と同じ設定ファイルを共有でき、セットアップコストが低い
- Jest 互換 API でスムーズに移行・学習できる
- TypeScript のトランスパイルが高速

**Playwright**
- クロスブラウザ E2E テストをコードで記述できる
- 長押しなどの複合操作（`page.mouse.down()` + タイマー）を再現できる
- スクリーンショット・トレースによるデバッグが充実

### デプロイ: GitHub Actions + SSH rsync + systemd

- 外部サービス（Vercel/Railway 等）への依存なしで完結する
- `rsync` で差分ファイルのみ転送し、デプロイ時間を最小化
- `systemd` の `Restart=always` でプロセスの自動復旧
- GitHub Actions の secrets で SSH 秘密鍵・環境変数を安全に管理

---

## 結果

- 型安全な フルスタック TypeScript 構成が実現する
- `shared/types/` の ImportEvent 型が frontend/backend/外部ソースアプリで共有できる
- Firebase SDK への依存が完全に排除され、オフラインでの開発・テストが可能になる
- 月額固定コストで運用コストが予測可能になる

### トレードオフ（受け入れるコスト）

| コスト | 評価 |
|--------|------|
| VPS の初期セットアップ（Nginx/SSL/systemd 設定） | 一度きり、かつ一般的な作業で資料が豊富 |
| Firebase の無料枠がなくなる | ConoHa の月額は小さく許容範囲 |
| マネージド DB でないため自分でバックアップ | pg_dump の cron を設定するだけで解決 |

---

## 代替案と却下理由

| 代替案 | 却下理由 |
|--------|----------|
| **Next.js (フルスタック)** | SSR は不要（個人 SPA）。API ルートを Next.js 内に閉じ込めると Hono の型安全ルーティングが使えなくなる |
| **Prisma (ORM)** | 生成クライアントの抽象度が高く、N+1 回避の意図が不明瞭になりがち。Drizzle の SQL-like API の方が学習に適している |
| **Firebase (継続)** | 課題の根本原因であり継続しない |
| **SQLite** | TIMESTAMPTZ のネイティブ対応が弱い。同時接続の考慮が不要な個人利用ではあるが、ツール・運用の成熟度で PostgreSQL を選択 |
| **SvelteKit** | React の既存知識・エコシステムを捨てるコストが見合わない |
| **Railway / Fly.io** | 月額が ConoHa より高くなる可能性があり、VPS の運用知識習得という学習目標とも合わない |
