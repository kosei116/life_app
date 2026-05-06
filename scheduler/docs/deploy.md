# Deploy to ConoHa VPS

## STEP 1: SSH

```bash
ssh root@160.251.207.174
```

## STEP 2: 基盤セットアップ (root)

```bash
apt update && apt upgrade -y && \
apt install -y curl git build-essential ufw && \
ufw allow OpenSSH && \
ufw allow 80 && \
ufw allow 443 && \
ufw --force enable && \
adduser --disabled-password --gecos "" scheduler && \
usermod -aG sudo scheduler && \
echo "scheduler ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/scheduler && \
mkdir -p /srv && chown scheduler:scheduler /srv
```

## STEP 3: PostgreSQL (root)

```bash
apt install -y postgresql postgresql-contrib && \
DB_PASS=$(openssl rand -base64 24 | tr -d '/+=' | head -c 24) && \
echo "===== MEMO THIS =====" && \
echo "DB_PASS=$DB_PASS" && \
echo "=====================" && \
sudo -u postgres psql <<SQL
CREATE USER scheduler WITH PASSWORD '$DB_PASS';
CREATE DATABASE scheduler OWNER scheduler;
SQL
```

## STEP 4: Node.js (scheduler ユーザー)

```bash
sudo -iu scheduler
```

```bash
curl -fsSL https://fnm.vercel.app/install | bash && \
source ~/.bashrc && \
fnm install 20 && \
fnm default 20 && \
corepack enable && \
corepack prepare pnpm@latest --activate && \
echo "===== MEMO THIS =====" && \
echo "NODE_PATH=$(which node)" && \
echo "=====================" && \
node -v && pnpm -v
```

## STEP 5: コード取得 (scheduler)

```bash
cd /srv && \
git clone https://github.com/kosei116/scheduler.git && \
cd scheduler && \
cp backend/.env.example backend/.env && \
chmod 600 backend/.env
```

```bash
nano /srv/scheduler/backend/.env
```

```
DATABASE_URL=postgresql://scheduler:nZAS73V1V4Pp1ikpeAolklem@localhost:5432/scheduler
PORT=3030
NODE_ENV=production
SYNC_ENABLED=true
GAS_WEBAPP_URL=
GAS_CALENDAR_ID=primary
```

```bash
cd /srv/scheduler && \
pnpm install --frozen-lockfile && \
pnpm --filter @scheduler/backend build && \
pnpm --filter @scheduler/backend db:migrate && \
pnpm --filter @scheduler/frontend build
```

## STEP 6: systemd (root)

```bash
exit
```

```bash
cp /srv/scheduler/deploy/scheduler-api.service /etc/systemd/system/
```

```bash
systemctl daemon-reload && \
systemctl enable --now scheduler-api && \
systemctl status scheduler-api --no-pager
```

```bash
journalctl -u scheduler-api -n 50 --no-pager
```

## STEP 7: Caddy (root)

```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https && \
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg && \
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list && \
apt update && apt install -y caddy && \
cp /srv/scheduler/deploy/Caddyfile /etc/caddy/Caddyfile
```

```bash
systemctl reload caddy && \
systemctl status caddy --no-pager
```

## STEP 8: 動作確認

ブラウザで `http://160.251.207.174` を開く。

## STEP 9: 更新デプロイ

```bash
sudo -iu scheduler
/srv/scheduler/deploy/update.sh
```
