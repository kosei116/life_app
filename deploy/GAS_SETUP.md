# GAS (Google Apps Script) 連携セットアップ

scheduler のイベントを Google Calendar に push / 双方向同期するための GAS Web App を作る。

## 何が起きるか

```
[scheduler API]  ── POST mutations ──→  [GAS Web App]  ──→  [Google Calendar]
                 ←── GET events ──                       ←──
```

scheduler が 5 分 / 30 分 cron で GAS を叩いて push/pull する。

---

## 1. GAS プロジェクト作成

1. https://script.google.com を開く
2. 左上「新しいプロジェクト」をクリック
3. プロジェクト名を `scheduler-calendar-adapter` 等に変更（任意）

## 2. Calendar API（Advanced Service）を有効化

1. 左サイドバー「サービス +」をクリック
2. 一覧から **Calendar API** を選ぶ
3. ID は `Calendar`（デフォルト）のまま「追加」

## 3. コードを貼り付け

1. デフォルトの `コード.gs` を全選択 → 削除
2. リポジトリの `scheduler/scripts/gas/calendar-adapter.gs` の中身（335行）を **全部コピペ**
3. ローカル Mac で：
   ```bash
   pbcopy < /Users/kosei/dev/life_app/scheduler/scripts/gas/calendar-adapter.gs
   ```
   でクリップボードにコピーできます
4. GAS エディタにペースト → Cmd+S（保存）

## 4. CALENDAR_ID を確認（任意・通常は変更不要）

`primary` のままなら自分のメインカレンダーに同期されます。
別カレンダーを使う場合は冒頭の：

```js
const CALENDAR_ID = 'primary';
```

を `xxxxxxx@group.calendar.google.com` 等に変更。

## 5. デプロイ（Web App として公開）

1. 右上「デプロイ」→「新しいデプロイ」
2. 種類：「**ウェブアプリ**」
3. 設定：
   - 説明：`scheduler v1`
   - 次のユーザーとして実行：**自分**
   - アクセス権：**自分のみ** ※後述の認証で URL に共有秘密キーを混ぜる方式が無いため、ここは「全員」に開く必要があります
   
   → **「全員」を選択**
   
   ※URL は推測不可能なので実質的なシークレット扱い。
4. 「デプロイ」をクリック → アクセス権の承認画面
5. 「アクセスを承認」→ Google アカウント選択 → 「詳細」→ 「（プロジェクト名）に移動（安全ではないページ）」→ 「許可」
6. デプロイ完了画面に **ウェブアプリ URL** が表示される（`https://script.google.com/macros/s/.../exec`）

→ **この URL をメモ**

## 6. 動作確認（Mac で）

URL の末尾に `?action=events` を付けてブラウザで開く。

```
https://script.google.com/macros/s/.../exec?action=events
```

→ JSON で `{"success":true, "events":[...]}` が返ればOK（既存の Google Calendar の予定が出ます）。

---

## 7. VPS 側の設定

### 7-1. scheduler の .env を更新（lifeapp で）

```bash
sudo -iu lifeapp
nano /srv/life_app/scheduler/backend/.env
```

末尾に追加（または既存の空欄を上書き）：

```
GAS_WEBAPP_URL=https://script.google.com/macros/s/.../exec
GAS_CALENDAR_ID=primary
```

そして `SYNC_ENABLED=false` を：

```
SYNC_ENABLED=true
```

に変更。

`Ctrl+O` Enter → `Ctrl+X`。

### 7-2. サービス再起動（root で）

```bash
exit
systemctl restart scheduler-api
systemctl status scheduler-api --no-pager
```

→ `active (running)` ならOK。

### 7-3. ログ確認

```bash
journalctl -u scheduler-api -f --no-pager
```

`[sync] starting...` 等のログが流れたらOK。`Ctrl+C` で抜ける。

---

## 8. 動作確認（手動 push / pull）

scheduler の UI 右上「同期」ボタン押下、または curl：

```bash
curl -X POST http://localhost:3030/api/sync/push
curl -X POST http://localhost:3030/api/sync/pull
```

それぞれ `{"data": {...}}` が返り、Google Calendar 側で予定が増減することを確認。

---

## 9. 自動同期 (cron)

`SYNC_ENABLED=true` で systemd 起動時に scheduler.ts の cron が走り、5分 / 30分 / 日次で同期されます。
何もしなくてOK。

---

## トラブル

### `GAS_WEBAPP_URL is not set`
→ .env が読まれていない。systemd の `EnvironmentFile=/srv/life_app/scheduler/backend/.env` を確認、サービス再起動。

### `Authorization required`
→ GAS のアクセス権が「自分のみ」になっている。デプロイ設定を「全員」に変更。

### Google Calendar に予定が出ない
- GAS Web App URL に `?action=events` を付けてブラウザでアクセス、JSON が返るか
- Calendar 側で `description` に `schedule_mgr_id:xxx` のタグが入った予定を確認
- scheduler の `event_id` と Calendar の予定が `sync_mapping` テーブルで紐付いているか：
  ```bash
  sudo -u postgres psql -d scheduler -c "SELECT * FROM sync_mapping LIMIT 10;"
  ```

### 重複が出る
→ `clear` アクションで一度全消し可能：
```
https://script.google.com/macros/s/.../exec?action=clear
```
（schedule_mgr_id タグ付きの予定だけ消える）
