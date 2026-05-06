# 既存の GAS Web App を再利用する手順

旧 scheduler 時代に作った GAS Web App をそのまま使う。

## 1. GAS Web App URL を取得

ブラウザ（Mac）で：

1. https://script.google.com を開く
2. 「マイプロジェクト」から **既存の Calendar adapter プロジェクト** を開く
3. 右上「デプロイ」→「**デプロイを管理**」
4. アクティブなデプロイの「ウェブアプリ」欄の URL をコピー：
   ```
   https://script.google.com/macros/s/AKfycbz.../exec
   ```

## 2. 動作確認（任意）

URL 末尾に `?action=events` をつけてブラウザで開く：

```
https://script.google.com/macros/s/AKfycbz.../exec?action=events
```

→ JSON で `{"success":true, "events":[...]}` が返ればOK。

---

## 3. VPS の .env を更新

lifeapp で .env を開く（root から）：

```bash
sudo -iu lifeapp
```

```bash
nano /srv/life_app/scheduler/backend/.env
```

**3 行を以下に書き換え／追記**：

```
GAS_WEBAPP_URL=https://script.google.com/macros/s/AKfycbz.../exec
GAS_CALENDAR_ID=primary
SYNC_ENABLED=true
```

`SYNC_ENABLED=false` の行があれば `true` に変更。`GAS_WEBAPP_URL` `GAS_CALENDAR_ID` 行が既にあれば値を更新。なければ末尾に追記。

`Ctrl+O` Enter → `Ctrl+X` で保存。

確認：

```bash
cat /srv/life_app/scheduler/backend/.env
```

→ 5〜6行（PORT / DATABASE_URL / SYNC_ENABLED=true / GAS_WEBAPP_URL / GAS_CALENDAR_ID）が表示されればOK。

---

## 4. サービス再起動（root で）

lifeapp から root に戻る：

```bash
exit
```

```bash
systemctl restart scheduler-api
```

```bash
systemctl status scheduler-api --no-pager
```

→ `active (running)` ならOK。

---

## 5. ログ確認

```bash
journalctl -u scheduler-api -n 30 --no-pager
```

`GAS_WEBAPP_URL is not set` のエラーが消えてればOK。`Ctrl+C` で抜ける。

---

## 6. 動作確認

scheduler UI 右上「同期」ボタンを押す、または VPS で curl：

```bash
curl -X POST http://localhost:3030/api/sync/push
```

```bash
curl -X POST http://localhost:3030/api/sync/pull
```

それぞれ `{"data": {...}}` が返り、500 エラーが出なければ成功。

Google Calendar 側に新しい予定（study タスク・shift シフト・class 授業）が反映されるか確認してください。

---

## トラブル

### 500 が再発する

ログ確認：

```bash
journalctl -u scheduler-api -n 50 --no-pager
```

- `GAS_WEBAPP_URL is not set` がまだ出る → `.env` が読まれてない。systemctl restart 漏れ。
- `403 Forbidden` 等 → GAS のアクセス権が「自分のみ」になってる。GAS デプロイ設定を「全員」に変える必要あり。
- `Authorization required` → GAS のスクリプト承認が切れてる。GAS エディタで再デプロイ。

### Calendar に予定が出ない

- `?action=events` が JSON 返すか
- `sync_mapping` テーブルの中身を確認：
  ```bash
  sudo -u postgres psql -d scheduler -c "SELECT * FROM sync_mapping LIMIT 5;"
  ```

### 重複イベントが出た

GAS の clear アクションで全消し（`schedule_mgr_id` タグ付きのみ）：

```
https://script.google.com/macros/s/.../exec?action=clear
```

そのあと VPS 側で再 push：

```bash
curl -X POST http://localhost:3030/api/sync/push
```
