# speed-marubatsu

リアルタイム・ルーム制の **連打マルバツ**。ターン制ではなく、両者そろって同時スタート →
空きマスを連打で奪い合い、先に 3 つ並べた方が勝ち。URL の `?room=xxx` でルームを分けて対戦する。

## あそびかた

- 2 人で同じ URL（同じ room）を開く → それぞれ「スタート」を押す
- 両者そろうと同時に開始。空きマスを**連打**して綱引きゲージを自分の側へ振り切ると、そのマスを獲得
- 先に 3 つ並べたら勝ち

## 開発

```bash
npm install

npm run server     # WebSocket サーバ http://localhost:3001
npm run web        # React 開発サーバ http://localhost:5173 (/ws は 3001 に proxy)
```

ブラウザのタブを 2 つ開くと対戦できる。別ルームは `?room=abc` を付ける。

```bash
npm test           # ゲームロジックのテスト (vitest)
npm run deploy     # Cloudflare へデプロイ (speed-marubatsu)
```

> 本番相当を 1 プロセスで確認したいときは `npm run build` 後に `npm run server` だけでよい
> （express が `web/dist` を配信する）。

## ドキュメント / 関連

- **内部設計**（state / メッセージ / サーバ構成 / デプロイ）: [docs/DESIGN.md](docs/DESIGN.md)
- ベーシックな（ターン制の）マルバツ: `sample/proper`・`sample/beginner` ブランチ
