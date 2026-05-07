# 残り手順（VPS デプロイ）

現状: lifeapp ユーザで `/srv/life_app` を clone 済み。3 DB（scheduler / study / shift）作成済み。

DB パスワード:
- `SCHEDULER_DB_PASS=PpyPsFoE8TBSkttlb7dzztOS`
- `STUDY_DB_PASS=OOYCO84GfRFvqxlEgAIff20i`
- `SHIFT_DB_PASS=LzBRRNtlF7dbFtPP1WCcScO3`

---

## 1. 3つの .env ファイルを作成（lifeapp で）

### 1-1. scheduler

```bash
nano /srv/life_app/scheduler/backend/.env
```

中身（3行）:

```
PORT=3030
DATABASE_URL=postgresql://scheduler:PpyPsFoE8TBSkttlb7dzztOS@localhost:5432/scheduler
SYNC_ENABLED=false
```

`Ctrl+O` Enter → `Ctrl+X`

### 1-2. study

```bash
nano /srv/life_app/study/backend/.env
```

中身（5行）:

```
PORT=3001
DATABASE_URL=postgresql://study:OOYCO84GfRFvqxlEgAIff20i@localhost:5432/study
SCHEDULER_API_URL=http://localhost:3030
SCHEDULER_SOURCE_ID=study
SCHEDULER_PUSH_ENABLED=true
```

`Ctrl+O` Enter → `Ctrl+X`

### 1-3. shift

```bash
nano /srv/life_app/shift/backend/.env
```

中身（5行）:

```
PORT=3002
DATABASE_URL=postgresql://shift:LzBRRNtlF7dbFtPP1WCcScO3@localhost:5432/shift
SCHEDULER_API_URL=http://localhost:3030
SCHEDULER_SOURCE_ID=shift
SCHEDULER_PUSH_ENABLED=true
```

`Ctrl+O` Enter → `Ctrl+X`

### 1-4. 権限制限

```bash
chmod 600 /srv/life_app/scheduler/backend/.env
chmod 600 /srv/life_app/study/backend/.env
chmod 600 /srv/life_app/shift/backend/.env
```

確認:

```bash
ls -l /srv/life_app/*/backend/.env
```

→ 3つすべて `-rw-------` になればOK。

---

## 2. pnpm install（lifeapp で）

```bash
cd /srv/life_app
```

```bash
pnpm install --frozen-lockfile
```

数分かかる。最後に `Done in ...` が出ればOK。

---

## 3. backend ビルド（lifeapp で）

```bash
pnpm --filter @scheduler/backend build
```

```bash
pnpm --filter @study/backend build
```

```bash
pnpm --filter @shift/backend build
```

各々 `tsc` が走り、エラーなく終わればOK。

---

## 4. DB マイグレーション（lifeapp で）

```bash
pnpm --filter @scheduler/backend db:migrate
```

```bash
pnpm --filter @study/backend db:migrate
```

```bash
pnpm --filter @shift/backend db:migrate
```

各々 `migrations applied successfully!` が出ればOK。

---

## 5. scheduler の sources シード（lifeapp で）

```bash
cd /srv/life_app/scheduler/backend && pnpm exec tsx --env-file=.env src/db/seed.ts && cd /srv/life_app
```

→ `Seeded sources: ...` が出ればOK。

---

## 6. frontend ビルド（lifeapp で）

```bash
VITE_BASE=/scheduler/ VITE_API_BASE=/scheduler/api pnpm --filter @scheduler/frontend build
```

```bash
VITE_BASE=/study/ VITE_API_BASE=/study/api pnpm --filter @study/frontend build
```

```bash
VITE_BASE=/shift/ VITE_API_BASE=/shift/api pnpm --filter @shift/frontend build
```

各々 `built in ...ms` が出ればOK。

---

## 7. systemd ユニット配置（root で）

lifeapp から root に戻る:

```bash
exit
```

systemd ユニット 3つをコピー:

```bash
cp /srv/life_app/deploy/scheduler-api.service /etc/systemd/system/
cp /srv/life_app/deploy/study-api.service /etc/systemd/system/
cp /srv/life_app/deploy/shift-api.service /etc/systemd/system/
```

リロード + 起動:

```bash
systemctl daemon-reload
systemctl enable --now scheduler-api study-api shift-api
```

確認:

```bash
systemctl status scheduler-api --no-pager
systemctl status study-api --no-pager
systemctl status shift-api --no-pager
```

3つすべて `active (running)` であればOK。

ログ確認（エラーが出てる場合）:

```bash
journalctl -u scheduler-api -n 50 --no-pager
journalctl -u study-api -n 50 --no-pager
journalctl -u shift-api -n 50 --no-pager
```

---

## 8. API ヘルスチェック（root で）

```bash
curl http://localhost:3030/health
curl http://localhost:3001/health
curl http://localhost:3002/health
```

各々 `{"status":"ok",...}` が返ればOK。

---

## 9. Caddy 設定差し替え（root で）

```bash
cp /srv/life_app/deploy/Caddyfile /etc/caddy/Caddyfile
```

静的ファイルを Caddy が読めるように:

```bash
chmod o+rx /srv /srv/life_app
chmod -R o+rX /srv/life_app/scheduler/frontend/dist
chmod -R o+rX /srv/life_app/study/frontend/dist
chmod -R o+rX /srv/life_app/shift/frontend/dist
```

リロード:

```bash
systemctl reload caddy
systemctl status caddy --no-pager
```

→ `active (running)` ならOK。

---

## 10. 動作確認（ブラウザ）

| URL | 期待 |
|-----|------|
| http://160.251.207.174/ | `/scheduler/` にリダイレクト |
| http://160.251.207.174/scheduler/ | scheduler カレンダー（イベントは空） |
| http://160.251.207.174/study/ | study（学期登録なし） |
| http://160.251.207.174/shift/ | shift（職場登録なし） |

ここまでで「動く」状態。データはまだ入ってない。

---

## 11. データ移行（Mac → VPS）

### 11-1. Mac 側でダンプを scp 転送

Mac のターミナルで（`<PORT>` は SSH ポート番号）:

```bash
scp -P <PORT> /tmp/life_app_dumps/*.sql root@160.251.207.174:/tmp/
```

### 11-2. VPS で root に戻る

すでに root なら不要。lifeapp なら `exit`。

### 11-3. サービス停止

```bash
systemctl stop scheduler-api study-api shift-api
```

### 11-4. scheduler DB 上書き

```bash
sudo -u postgres psql -c "DROP DATABASE scheduler;"
sudo -u postgres psql -c "CREATE DATABASE scheduler OWNER scheduler;"
sudo -u postgres psql -d scheduler -f /tmp/scheduler.sql
```

### 11-5. study DB 上書き

```bash
sudo -u postgres psql -c "DROP DATABASE study;"
sudo -u postgres psql -c "CREATE DATABASE study OWNER study;"
sudo -u postgres psql -d study -f /tmp/study.sql
```

### 11-6. shift DB 上書き

```bash
sudo -u postgres psql -c "DROP DATABASE shift;"
sudo -u postgres psql -c "CREATE DATABASE shift OWNER shift;"
sudo -u postgres psql -d shift -f /tmp/shift.sql
```

### 11-7. サービス再開

```bash
systemctl start scheduler-api study-api shift-api
```

---

## 12. 最終確認（ブラウザ）

| URL | 期待 |
|-----|------|
| http://160.251.207.174/scheduler/ | カレンダーに study/shift/manual イベント表示 |
| http://160.251.207.174/study/ | Tabler に学期・科目・タスク表示 |
| http://160.251.207.174/shift/ | Part-time にシフト・収入表示 |

---

## トラブル時

```bash
journalctl -u scheduler-api -n 100 --no-pager
journalctl -u study-api -n 100 --no-pager
journalctl -u shift-api -n 100 --no-pager
journalctl -u caddy -n 100 --no-pager
```

Caddy 設定検証:

```bash
caddy validate --config /etc/caddy/Caddyfile
```

更新時:

```bash
sudo -iu lifeapp
/srv/life_app/deploy/update.sh
```
