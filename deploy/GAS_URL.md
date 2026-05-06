# 既存 GAS Web App URL

過去のセッションログから発見・動作確認済み:

```
https://script.google.com/macros/s/AKfycbxbInbVE4WRy6o-Nh71Wm9ka_v08SJhy8p7jVG5_YE2di3is1h7XWAgRLc2kX0zQqI0ag/exec
```

## VPS に適用する手順

lifeapp で .env 編集:

```bash
sudo -iu lifeapp
```

```bash
nano /srv/life_app/scheduler/backend/.env
```

以下のように書き換え（5行）:

```
PORT=3030
DATABASE_URL=postgresql://scheduler:PpyPsFoE8TBSkttlb7dzztOS@localhost:5432/scheduler
SYNC_ENABLED=true
GAS_WEBAPP_URL=https://script.google.com/macros/s/AKfycbxbInbVE4WRy6o-Nh71Wm9ka_v08SJhy8p7jVG5_YE2di3is1h7XWAgRLc2kX0zQqI0ag/exec
GAS_CALENDAR_ID=primary
```

`Ctrl+O` Enter → `Ctrl+X`

確認:

```bash
cat /srv/life_app/scheduler/backend/.env
```

root に戻って再起動:

```bash
exit
```

```bash
systemctl restart scheduler-api
```

```bash
journalctl -u scheduler-api -n 20 --no-pager
```

`GAS_WEBAPP_URL is not set` エラーが消えてればOK。

## 動作確認

```bash
curl -X POST http://localhost:3030/api/sync/push
```

```bash
curl -X POST http://localhost:3030/api/sync/pull
```

200 系レスポンスが返れば成功。Google Calendar の予定が反映されるか確認。
