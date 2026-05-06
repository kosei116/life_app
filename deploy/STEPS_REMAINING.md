# 残り手順（データ移行 → 動作確認）

現状:
- ✅ Caddy 起動・動作確認まで完了
- ⏳ DB ダンプを VPS に取り込んで上書きリストアする

Gist URL:
```
https://gist.github.com/kosei116/c2759e07138603d74cfd4b106e2e55d6
```

Raw 取得用ベース URL:
```
https://gist.githubusercontent.com/kosei116/c2759e07138603d74cfd4b106e2e55d6/raw
```

---

## 1. ダンプを VPS にダウンロード（root で）

`/tmp` に移動：

```bash
cd /tmp
```

ベース URL を変数に入れる（ターミナル折り返し回避）：

```bash
GIST=https://gist.githubusercontent.com/kosei116/c2759e07138603d74cfd4b106e2e55d6/raw
```

確認：

```bash
echo $GIST
```

3 ファイルダウンロード：

```bash
curl -L -o scheduler.sql $GIST/scheduler.sql
```

```bash
curl -L -o study.sql $GIST/study.sql
```

```bash
curl -L -o shift.sql $GIST/shift.sql
```

サイズ確認：

```bash
ls -la /tmp/*.sql
```

期待値:
- `scheduler.sql` 約 440KB
- `study.sql` 約 35KB
- `shift.sql` 約 29KB

ファイル先頭が SQL になってるか確認：

```bash
head -3 /tmp/scheduler.sql
```

→ `--` で始まるコメント行が出ればOK（HTML が降ってきてたらリダイレクト失敗）。

---

## 2. サービス停止（root で）

```bash
systemctl stop scheduler-api
```

```bash
systemctl stop study-api
```

```bash
systemctl stop shift-api
```

---

## 3. scheduler DB 上書き（root で）

```bash
sudo -u postgres psql -c "DROP DATABASE scheduler;"
```

```bash
sudo -u postgres psql -c "CREATE DATABASE scheduler OWNER scheduler;"
```

```bash
sudo -u postgres psql -d scheduler -f /tmp/scheduler.sql
```

最後のは大量に `SET` `CREATE TABLE` `INSERT` 等が出力されますが、最後にエラーなく終わればOK。

---

## 4. study DB 上書き（root で）

```bash
sudo -u postgres psql -c "DROP DATABASE study;"
```

```bash
sudo -u postgres psql -c "CREATE DATABASE study OWNER study;"
```

```bash
sudo -u postgres psql -d study -f /tmp/study.sql
```

---

## 5. shift DB 上書き（root で）

```bash
sudo -u postgres psql -c "DROP DATABASE shift;"
```

```bash
sudo -u postgres psql -c "CREATE DATABASE shift OWNER shift;"
```

```bash
sudo -u postgres psql -d shift -f /tmp/shift.sql
```

---

## 6. サービス再開（root で）

```bash
systemctl start scheduler-api
```

```bash
systemctl start study-api
```

```bash
systemctl start shift-api
```

---

## 7. ヘルスチェック（root で）

```bash
curl http://localhost:3030/health
```

```bash
curl http://localhost:3001/health
```

```bash
curl http://localhost:3002/health
```

3つとも `{"status":"ok",...}` が返ればOK。

データ件数の確認（任意）：

```bash
sudo -u postgres psql -d scheduler -c "SELECT source, COUNT(*) FROM events GROUP BY source;"
```

```bash
sudo -u postgres psql -d study -c "SELECT COUNT(*) FROM tasks;"
```

```bash
sudo -u postgres psql -d shift -c "SELECT COUNT(*) FROM shifts;"
```

---

## 8. ブラウザで動作確認

| URL | 期待 |
|-----|------|
| `http://160.251.207.174/` | `/scheduler/` にリダイレクト |
| `http://160.251.207.174/scheduler/` | カレンダーに study/shift/manual イベント表示 |
| `http://160.251.207.174/study/` | Tabler に学期・科目・タスク表示 |
| `http://160.251.207.174/shift/` | Part-time にシフト・収入表示 |

---

## 9. 後片付け

ダンプファイル削除：

```bash
rm /tmp/scheduler.sql /tmp/study.sql /tmp/shift.sql
```

Gist 削除（Mac で）：

```bash
gh gist delete c2759e07138603d74cfd4b106e2e55d6
```

---

## 10. 更新デプロイ（今後）

コードに変更を加えた後、Mac で push → VPS で：

```bash
sudo -iu lifeapp
/srv/life_app/deploy/update.sh
```

---

## トラブル時

サービスログ：

```bash
journalctl -u scheduler-api -n 100 --no-pager
```

```bash
journalctl -u study-api -n 100 --no-pager
```

```bash
journalctl -u shift-api -n 100 --no-pager
```

```bash
journalctl -u caddy -n 100 --no-pager
```

Caddy 検証：

```bash
caddy validate --config /etc/caddy/Caddyfile
```
