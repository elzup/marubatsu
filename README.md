# marubatsu

リアルタイム・ルーム制マルバツ (Tic Tac Toe)。WebSocket でブラウザ間に盤面を同期する。
URL の `?room=xxx` でルームを分けて対戦する（**ルームマッチング型**）。

サーバが盤面の唯一の正本で、クライアント (React) は**届いた state をそのまま描くだけ**。

## アーキテクチャ

```
shared/game.ts   ← ゲームの純粋ロジック。reduce(state, action) の 1 関数に集約 (全環境で共有)
                       ├─ server/app.ts   … Render 用: Express + express-ws。ルームを Map で保持
                       └─ worker/          … Cloudflare 用: Worker + Durable Object
                            ├─ index.ts    … /ws をルーム名ごとの DO に振り分け、他は静的配信
                            └─ room.ts     … 1 ルーム = 1 Durable Object (盤面を保持・配信)
web/             ← React + Vite クライアント。WS の state を描画し Action を送るだけ
```

**state 更新の設計**: すべての更新は `reduce(state, action)` に集約。Render も Cloudflare も
「受信した Action を reduce に通して新しい state を作り、全員へブロードキャストする」だけ。

- Action: `{ type: 'move', index }` / `{ type: 'reset' }`
- サーバ → クライアント: `{ type: 'state', state: { board, turn, winner } }`

## 開発

```bash
npm install

# ターミナル 1: WebSocket サーバ (Render と同じ実体)
npm run server     # http://localhost:3001

# ターミナル 2: React 開発サーバ (HMR。/ws は 3001 に proxy)
npm run web        # http://localhost:5173
```

ブラウザのタブを 2 つ開くと同期して対戦できる。別ルームは `?room=abc` を付ける。

> 本番相当を 1 プロセスで確認したいときは `npm run build` 後に `npm run server` だけでよい
> （express が `web/dist` を配信する）。

## デプロイ

### Render

`render.yaml` をそのまま使う。`npm install && npm run build` でビルドし、`npm run start`
(= `tsx server/app.ts`) で常駐。express が React 成果物の配信と `/ws` の両方を担当する。

### Cloudflare

```bash
npm run deploy     # vite build → wrangler deploy
```

`wrangler.jsonc` で 1 ルーム = 1 Durable Object（無料プランでも使える SQLite-backed DO）。
`/ws?room=xxx` は同名なら必ず同じ DO に届き、静的アセット (`web/dist`) は Worker が配信する。

## 割り切り (雛形)

- 盤面はルーム内で共有。プレイヤーごとの X/O 固定割り当てはしていない（手番のマークを誰でも置ける）
- 勝敗判定は `shared/game.ts` の 8 ライン判定
