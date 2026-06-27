# 内部設計 (speed-marubatsu)

README の補足。state の形・メッセージ・サーバ構成など実装寄りの話をここにまとめる。

## アーキテクチャ

```
shared/messages.ts ← WS メッセージの正準 (Zod)。型導出 + 実行時検証 + asyncapi 生成
shared/game.ts     ← ゲームの純粋ロジック。reduce(state, action, by) を入口に集約 (全環境で共有)
shared/room.ts     ← ?room=xxx の解決 (DEFAULT_ROOM / roomFromQuery)
                       ├─ server/app.ts   … Render 用: Express + express-ws。ルームを Map で保持
                       └─ worker/          … Cloudflare 用: Worker + Durable Object
                            ├─ index.ts    … /ws をルーム名ごとの DO に振り分け、他は静的配信
                            └─ room.ts     … 1 ルーム = 1 Durable Object (盤面を保持・配信)
web/               ← React + Vite クライアント。WS の state を描画し Action を送るだけ
```

サーバが盤面の唯一の正本で、クライアント (React) は**届いた state をそのまま描くだけ**。

## state 更新の設計

すべての更新は `shared/game.ts` の `reduce(state, action, by)` を入口に集約する。Render も
Cloudflare も「受信した Action を、着手者のマーク `by` 付きで reduce に通して新しい state を
作り、全員へブロードキャストする」だけ。

- `reduce` はディスパッチャで、中身はアクション別の純粋関数 (`applyReady` / `applyTap`) に振り分ける
- 変化が無いときは同じ state 参照を返す → 呼び出し側が「効いたか」を `===` で判定できる
- `by` = その操作をしたプレイヤーのマーク。server が socket の席から渡す (クライアントは詐称できない)

`state` の形:

```ts
{
  phase: 'ready' | 'playing' | 'finished'
  board:  (Mark | null)[]   // 確定したマス (9)
  meters: number[]          // 各マスの綱引きゲージ (正=X寄り / 負=O寄り)
  ready:  { X: boolean; O: boolean }  // 各プレイヤーがスタートを押したか
  winner: Mark | null
}
```

## ルール

- `ready` を両者が押すと `phase` が同時に `playing` へ（**同時スタート**。サーバが両者へ一斉配信）
- `tap` は綱引きゲージを X は +1 / O は −1 動かし、`±TAPS_TO_CLAIM` に達したマスを獲得
- **競合は WS 受信順**にサーバが処理して解決する（先に届いた連打が効く）
- 勝者が出る or 全マス埋まり (引き分け) で `phase = 'finished'`

### プレイヤー設計 (1P/2P)

ルームへの先着で `X=1P` / `O=2P`、3 人目以降は観戦 (`mark: null`)。観戦者は操作不可。
権限・フェーズ判定は `shared/game.ts` の `canAct()` で server / worker 共通（reset=常時 /
ready=ready 中のみ / tap=playing 中のみ）。

## WebSocket メッセージ

- クライアント → サーバ (Action): `{ type: 'ready' }` / `{ type: 'tap', index }` / `{ type: 'reset' }`
- サーバ → クライアント: `{ type: 'joined', mark }` / `{ type: 'presence', seats }` / `{ type: 'state', state }`

`shared/messages.ts` の **Zod スキーマが唯一の正準**。ここから

- TS 型を導出 (`z.infer`)
- 受信時の実行時バリデーション (`actionSchema.safeParse`)。server / worker とも不正メッセージは無視する
- AsyncAPI ドキュメント (`asyncapi.yaml`) を生成 — OpenAPI の WebSocket 版

```bash
npm run gen:asyncapi   # shared/messages.ts → asyncapi.yaml を再生成
```

`asyncapi.yaml` は自動生成物。手で編集せず `shared/messages.ts` を直して再生成する。
[AsyncAPI Studio](https://studio.asyncapi.com/) に貼ると HTML ドキュメントとして閲覧できる。

## デプロイ

- Cloudflare Worker 名は `speed-marubatsu`（`wrangler.jsonc`）。ベーシック版の `marubatsu` とは
  別 Worker としてデプロイされ、上書きしない
- `npm run deploy` = `vite build && wrangler deploy`

## 割り切り (雛形)

- 席は接続順で割り当て。認証はなく、再接続すると空いた席に入り直す
- 勝敗判定は `shared/game.ts` の 8 ライン判定
- 連打ゲージ (`TAPS_TO_CLAIM`) に減衰は無く、押し合いの純粋な総和で決まる（調整余地あり）

## 関連ブランチ

ベーシックな（ターン制の）マルバツは別ブランチに分けてある:

- `sample/proper` … zod 版（スキーマで型導出＋実行時検証）
- `sample/beginner` … zod 撤去版（素の type + 手書き検証、初学者向け構成）
