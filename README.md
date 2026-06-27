# speed-marubatsu

リアルタイム・ルーム制の **連打マルバツ**。WebSocket でブラウザ間に盤面を同期する。
URL の `?room=xxx` でルームを分けて対戦する（**ルームマッチング型**）。

ターン制ではなく、**両者そろって同時スタート → 空きマスを連打で奪い合う**。マスごとの
綱引きゲージを先に振り切った側がそのマスを取り、先に 3 つ並べた方が勝ち。

サーバが盤面の唯一の正本で、クライアント (React) は**届いた state をそのまま描くだけ**。

> ベーシックな（ターン制の）マルバツは `sample/proper`・`sample/beginner` ブランチに分けてある。

## アーキテクチャ

```
shared/messages.ts ← WS メッセージの正準 (Zod)。型導出 + 実行時検証 + asyncapi 生成
shared/game.ts     ← ゲームの純粋ロジック。reduce(state, action, by) の 1 関数に集約 (全環境で共有)
shared/room.ts     ← ?room=xxx の解決 (DEFAULT_ROOM / roomFromQuery)
                       ├─ server/app.ts   … Render 用: Express + express-ws。ルームを Map で保持
                       └─ worker/          … Cloudflare 用: Worker + Durable Object
                            ├─ index.ts    … /ws をルーム名ごとの DO に振り分け、他は静的配信
                            └─ room.ts     … 1 ルーム = 1 Durable Object (盤面を保持・配信)
web/               ← React + Vite クライアント。WS の state を描画し Action を送るだけ
```

**state 更新の設計**: すべての更新は `reduce(state, action, by)` に集約。Render も Cloudflare も
「受信した Action を、着手者のマーク `by` 付きで reduce に通して新しい state を作り、全員へ
ブロードキャストする」だけ。

- クライアント → サーバ (Action): `{ type: 'ready' }` (スタート) / `{ type: 'tap', index }` (連打) / `{ type: 'reset' }`
- サーバ → クライアント: `{ type: 'joined', mark }` / `{ type: 'presence', seats }` / `{ type: 'state', state }`
- `state` = `{ phase, board, meters, ready, winner }`（`phase`: ready→playing→finished、`meters`: 各マスの綱引きゲージ）

**ルール**: `ready` を両者が押すと `phase` が同時に `playing` へ（**同時スタート**）。`tap` は綱引きゲージを
X は +1 / O は −1 動かし、`±TAPS_TO_CLAIM` に達したマスを獲得。**競合は WS 受信順**にサーバが処理して
解決する（先に届いた連打が効く）。

**プレイヤー設計 (1P/2P)**: ルームへの先着で `X=1P` / `O=2P`、3 人目以降は観戦 (`mark: null`)。
観戦者は操作不可。権限・フェーズ判定は `shared/game.ts` の `canAct()` で server / worker 共通。

## WebSocket メッセージ定義

`shared/messages.ts` の **Zod スキーマが唯一の正準**。ここから

- TS 型を導出 (`z.infer`)
- 受信時の実行時バリデーション (`actionSchema.safeParse`)。server / worker とも不正メッセージは無視する
- AsyncAPI ドキュメント (`asyncapi.yaml`) を生成 — OpenAPI の WebSocket 版

```bash
npm run gen:asyncapi   # shared/messages.ts → asyncapi.yaml を再生成
```

`asyncapi.yaml` は自動生成物。手で編集せず `shared/messages.ts` を直して再生成する。
[AsyncAPI Studio](https://studio.asyncapi.com/) に貼ると HTML ドキュメントとして閲覧できる。

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

## 割り切り (雛形)

- 席は接続順で割り当て。認証はなく、再接続すると空いた席に入り直す
- 勝敗判定は `shared/game.ts` の 8 ライン判定
- 連打ゲージ (`TAPS_TO_CLAIM`) に減衰は無く、押し合いの純粋な総和で決まる（調整余地あり）
