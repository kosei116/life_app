# ADR 002: Firebase 廃止と Outbox パターンによる Google Calendar 同期

## ステータス

Accepted / 2026-05-02

---

## 文脈

### 現状の問題

旧 scdl_mgr では Firebase Realtime Database を中心に構成されており、Google Calendar との同期は GAS が Firebase を直接ポーリング・書き込みする構造になっている。

```
[旧アーキテクチャ]
[プレーンJS UI] ←→ [Firebase RTDB] ←→ [GAS (定期実行)] ←→ [Google Calendar]
```

この構成には以下の問題がある。

1. **リアルタイム同期ストレス**: Firebase のリアルタイムリスナーにより、UI 操作のたびに Calendar API が発火しやすく、Calendar 側の変更が即座に跳ね返ってくることで競合・混乱が起きる
2. **Firebase への強依存**: SDK のバージョンアップ・価格改定・仕様変更の影響を直接受ける
3. **GAS が司令塔**: GAS が Firebase を直接読み書きしており、障害時の責任範囲が不明確
4. **オフライン開発不可**: Firebase エミュレータなしでは本番 DB を使うしかない
5. **型安全性なし**: プレーンJS + Firebase SDK では型補完が効かない

### 要求

- Google Calendar との同期を維持しつつ、リアルタイム同期によるストレスを排除する
- ConoHa VPS が「司令塔」になり、GAS は Calendar の薄いアダプタに縮小する
- 障害時に同期が途切れても、再実行で正しい状態に収束できる（冪等性）

---

## 決定

### 1. Firebase を完全廃止し、PostgreSQL に移行する

- アプリのデータ永続化を PostgreSQL に一本化する
- GAS の Firebase 直アクセス機能は廃止し、ConoHa API 経由に変更する
- Firebase Auth も廃止（個人利用のため認証なし）

### 2. Google Calendar 同期に Outbox パターンを採用する

#### フロー概要

```
[アプリ操作]
     │
     ▼
[events テーブル] ──書き込みと同時──→ [sync_queue テーブル]
                                              │
                              ┌───────────────┼───────────────┐
                              ▼               ▼               ▼
                       [push worker]  [pull worker]  [window batch]
                        (5分 cron)    (30分 cron)     (日次 cron)
                              │               │               │
                              └───────────────┴───────────────┘
                                              │
                                             GAS Web App
                                   (Calendar アダプタ on Google)
                                              │
                                       Google Calendar
```

#### 各ワーカーの役割

| ワーカー | 実行間隔 | 処理内容 |
|---------|---------|---------|
| **push worker** | 5分 cron | `sync_queue` の未送信レコードを GAS に送信し、`google_event_id` を `sync_mapping` に記録する |
| **pull worker** | 30分 cron | GAS 経由で Calendar API の `syncToken` を使い差分を取得。既知の `schedule_mgr_id` タグを持つイベントは無視する（ループ防止） |
| **window batch** | 日次 cron | 同期ウィンドウ（-1ヶ月〜+6ヶ月）の管理。範囲外になったイベントを Calendar から削除、新たに範囲内になったイベントを push キューに積む |

### 3. GAS の役割を Calendar アダプタに限定する

GAS は以下の処理のみを担当する。

- ConoHa API からの push 要求を受け取り、Calendar API で insert/update/delete を実行する
- ConoHa API からの pull 要求に対し、`syncToken` ベースの差分を返す
- `description` フィールドへの `schedule_mgr_id:<uuid>` タグの付与

GAS は自律的な判断・Firebase アクセス・スケジュール管理ロジックを一切持たない。

### 4. 競合解決ルール: アプリ側を source of truth とする

- Calendar 側での変更（手動編集）は pull 時に取り込むが、`sync_queue` に既存の push が残っている場合はアプリ側を優先する
- Last-Write-Wins ではなく、`scheduler` が常に source of truth
- pull で取り込んだ変更は `event_overrides` に保存し、元の `events` レコードを上書きしない

### 5. 同期ループ防止

push 時に GAS が Calendar イベントの `description` に以下のタグを埋め込む。

```
schedule_mgr_id:550e8400-e29b-41d4-a716-446655440000
```

pull worker は取得したイベントの `description` をパースし、既知の UUID であれば取り込みをスキップする。

### 6. 削除の扱い

- DB: `events.deleted_at` に TIMESTAMPTZ を記録（論理削除）
- Calendar: GAS 経由で物理削除
- `sync_mapping`: `tombstone = true` を残す（重複削除リクエストの防止）

---

## 結果

- UI の操作がすぐに Calendar に反映されなくなるが、最大 5 分の遅延は個人利用で許容範囲
- Calendar 側での手動編集は 30 分以内に取り込まれる
- ネットワーク障害・GAS のタイムアウト時でも `sync_queue` にレコードが残るため、次回 cron 実行時に自動リカバリされる
- Firebase SDK への依存が完全に排除され、ローカル開発が PostgreSQL のみで完結する

### トレードオフ（受け入れるコスト）

| コスト | 評価 |
|--------|------|
| 最大 5 分の push 遅延 | 個人利用では許容範囲 |
| 30 分の pull 遅延 | Calendar を直接確認する頻度を考慮すると許容範囲 |
| cron の管理 | systemd timer で管理し、ログも systemd journal で確認できる |

---

## 代替案と却下理由

| 代替案 | 却下理由 |
|--------|----------|
| **Firebase 継続 + webhook** | リアルタイムストレスの根本原因を解消できない。Firebase への依存も残る |
| **Calendar API を直接呼ぶ（GAS 廃止）** | ConoHa から OAuth2 認証を管理する必要が生じ、トークン管理・リフレッシュの複雑さが増す。GAS の Google Account 認証を使い回す現構成の方がシンプル |
| **リアルタイム同期を維持（Webhook 受信）** | Calendar からの push 通知の受信には公開エンドポイントと証明書が必要で設定が複雑。30分ポーリングで十分 |
| **Outbox なし（直接 GAS 呼び出し）** | API 操作と同期を同一トランザクションで扱えず、同期失敗時にリカバリ手段がない |
