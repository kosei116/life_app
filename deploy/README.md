# Deploy life_app to ConoHa VPS

ConoHa VPS（IPアクセス・パス分け）に scheduler / study / shift をまとめてデプロイする手順。

## URL 構成（IPのみ・HTTPのみ）

| アプリ | URL |
|--------|-----|
| scheduler (集約ハブ) | `http://160.251.207.174/scheduler/` |
| study | `http://160.251.207.174/study/` |
| shift | `http://160.251.207.174/shift/` |

ルート `/` は `/scheduler/` にリダイレクト。

## ポート割り当て（VPS内・localhost）

| サービス | ポート |
|----------|--------|
| Caddy | 80 |
| scheduler-api | 3030 |
| study-api | 3001 |
| shift-api | 3002 |
| Postgres | 5432 |

## Postgres DB 構成

単一インスタンスに 3 DB:

| DB | User |
|----|------|
| `scheduler` | scheduler |
| `study` | study |
| `shift` | shift |

---

## 既存 scheduler の撤去 (root)

旧構成（`/srv/scheduler` + scheduler-api.service）を停止・削除：

```bash
ssh root@160.251.207.174

systemctl stop scheduler-api 2>/dev/null || true
systemctl disable scheduler-api 2>/dev/null || true
rm -f /etc/systemd/system/scheduler-api.service
systemctl daemon-reload

# 旧ユーザを残す場合は飛ばす。完全に作り直すなら:
# userdel -r scheduler
# 旧 DB を残す場合は飛ばす。再利用するなら旧名のまま使える。

rm -rf /srv/scheduler
```

---

## STEP 1: 共通ユーザ作成 (root)

```bash
adduser --disabled-password --gecos "" lifeapp
usermod -aG sudo lifeapp
echo "lifeapp ALL=(ALL) NOPASSWD: /bin/systemctl restart scheduler-api study-api shift-api, /bin/systemctl reload caddy" \
  > /etc/sudoers.d/lifeapp
mkdir -p /srv && chown lifeapp:lifeapp /srv
```

## STEP 2: 基盤パッケージ (root)

```bash
apt update && apt upgrade -y
apt install -y curl git build-essential ufw rsync
ufw allow OpenSSH
ufw allow 80
ufw --force enable
```

## STEP 3: PostgreSQL (root)

既存の `scheduler` DB が使えるならそのまま。新規なら：

```bash
apt install -y postgresql postgresql-contrib

# 3つの DB / ユーザを作成（パスワードを生成・記録）
SCH_PASS=$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)
STD_PASS=$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)
SHF_PASS=$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)

echo "===== MEMO THESE ====="
echo "SCHEDULER_DB_PASS=$SCH_PASS"
echo "STUDY_DB_PASS=$STD_PASS"
echo "SHIFT_DB_PASS=$SHF_PASS"
echo "======================"

sudo -u postgres psql <<SQL
CREATE USER scheduler WITH PASSWORD '$SCH_PASS';
CREATE DATABASE scheduler OWNER scheduler;
CREATE USER study WITH PASSWORD '$STD_PASS';
CREATE DATABASE study OWNER study;
CREATE USER shift WITH PASSWORD '$SHF_PASS';
CREATE DATABASE shift OWNER shift;
SQL
```

## STEP 4: Node.js (root)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
corepack enable
corepack prepare pnpm@9.12.0 --activate
node -v && pnpm -v
```

## STEP 5: コード取得 (lifeapp)

```bash
sudo -iu lifeapp
cd /srv
git clone https://github.com/kosei116/life_app.git
cd life_app
```

## STEP 6: バックエンド .env 作成 (lifeapp)

`scheduler/backend/.env`:

```bash
cat > /srv/life_app/scheduler/backend/.env <<'EOF'
PORT=3030
DATABASE_URL=postgresql://scheduler:SCHEDULER_DB_PASS@localhost:5432/scheduler
SYNC_ENABLED=false
EOF
chmod 600 /srv/life_app/scheduler/backend/.env
# SCHEDULER_DB_PASS を実際の値に置換
nano /srv/life_app/scheduler/backend/.env
```

`study/backend/.env`:

```bash
cat > /srv/life_app/study/backend/.env <<'EOF'
PORT=3001
DATABASE_URL=postgresql://study:STUDY_DB_PASS@localhost:5432/study
SCHEDULER_API_URL=http://localhost:3030
SCHEDULER_SOURCE_ID=study
SCHEDULER_PUSH_ENABLED=true
EOF
chmod 600 /srv/life_app/study/backend/.env
nano /srv/life_app/study/backend/.env
```

`shift/backend/.env`:

```bash
cat > /srv/life_app/shift/backend/.env <<'EOF'
PORT=3002
DATABASE_URL=postgresql://shift:SHIFT_DB_PASS@localhost:5432/shift
SCHEDULER_API_URL=http://localhost:3030
SCHEDULER_SOURCE_ID=shift
SCHEDULER_PUSH_ENABLED=true
EOF
chmod 600 /srv/life_app/shift/backend/.env
nano /srv/life_app/shift/backend/.env
```

## STEP 7: ビルド & マイグレーション (lifeapp)

```bash
cd /srv/life_app
pnpm install --frozen-lockfile

pnpm --filter @scheduler/backend build
pnpm --filter @study/backend build
pnpm --filter @shift/backend build

pnpm --filter @scheduler/backend db:migrate
pnpm --filter @study/backend db:migrate
pnpm --filter @shift/backend db:migrate

# scheduler の sources を seed
pnpm --filter @scheduler/backend exec tsx --env-file=.env src/db/seed.ts

VITE_BASE=/scheduler/ VITE_API_BASE=/scheduler/api \
  pnpm --filter @scheduler/frontend build
VITE_BASE=/study/ VITE_API_BASE=/study/api \
  pnpm --filter @study/frontend build
VITE_BASE=/shift/ VITE_API_BASE=/shift/api \
  pnpm --filter @shift/frontend build
```

## STEP 8: systemd ユニット (root)

```bash
exit  # lifeapp から root に戻る

cp /srv/life_app/deploy/scheduler-api.service /etc/systemd/system/
cp /srv/life_app/deploy/study-api.service /etc/systemd/system/
cp /srv/life_app/deploy/shift-api.service /etc/systemd/system/

systemctl daemon-reload
systemctl enable --now scheduler-api study-api shift-api
systemctl status scheduler-api study-api shift-api --no-pager
```

## STEP 9: Caddy (root)

既に Caddy が入っているならスキップ：

```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy
```

設定ファイル配置：

```bash
cp /srv/life_app/deploy/Caddyfile /etc/caddy/Caddyfile
chown root:caddy /etc/caddy/Caddyfile

# 静的ファイルが Caddy から読めるように
chmod o+rx /srv /srv/life_app
chmod -R o+rX /srv/life_app/scheduler/frontend/dist \
              /srv/life_app/study/frontend/dist \
              /srv/life_app/shift/frontend/dist

systemctl reload caddy
systemctl status caddy --no-pager
```

## STEP 10: 動作確認

ブラウザで以下を開く：

- `http://160.251.207.174/` → scheduler に redirect
- `http://160.251.207.174/study/`
- `http://160.251.207.174/shift/`

API ヘルスチェック：

```bash
curl http://localhost:3030/health
curl http://localhost:3001/health
curl http://localhost:3002/health
```

---

## データ移行（ローカル → 本番）

ローカル DB を VPS に移行：

```bash
# === ローカル側 (Mac) ===
# 各 DB をダンプ
docker exec scheduler-postgres pg_dump -U scheduler scheduler > /tmp/scheduler.sql
docker exec scheduler-postgres pg_dump -U study study > /tmp/study.sql
docker exec scheduler-postgres pg_dump -U shift shift > /tmp/shift.sql

# VPS に転送
scp /tmp/scheduler.sql /tmp/study.sql /tmp/shift.sql root@160.251.207.174:/tmp/

# === VPS 側 (root) ===
# サービス停止
systemctl stop scheduler-api study-api shift-api

# 既存データを破棄してリストア（注意: 本番上書き）
sudo -u postgres psql -c "DROP DATABASE scheduler;"
sudo -u postgres psql -c "CREATE DATABASE scheduler OWNER scheduler;"
sudo -u postgres psql -d scheduler -f /tmp/scheduler.sql

sudo -u postgres psql -c "DROP DATABASE study;"
sudo -u postgres psql -c "CREATE DATABASE study OWNER study;"
sudo -u postgres psql -d study -f /tmp/study.sql

sudo -u postgres psql -c "DROP DATABASE shift;"
sudo -u postgres psql -c "CREATE DATABASE shift OWNER shift;"
sudo -u postgres psql -d shift -f /tmp/shift.sql

# サービス再開
systemctl start scheduler-api study-api shift-api
```

---

## 更新デプロイ

```bash
sudo -iu lifeapp
/srv/life_app/deploy/update.sh
```

---

## トラブルシューティング

ログを見る：

```bash
journalctl -u scheduler-api -n 100 --no-pager
journalctl -u study-api -n 100 --no-pager
journalctl -u shift-api -n 100 --no-pager
journalctl -u caddy -n 100 --no-pager
```

Caddy 設定検証：

```bash
caddy validate --config /etc/caddy/Caddyfile
```
