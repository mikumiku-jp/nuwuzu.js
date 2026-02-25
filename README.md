# nuwuzu.js

uwuzu 系サービス向け API クライアントライブラリ（Node.js / ブラウザ対応）

## インストール

```bash
npm install nuwuzu.js
```

## クイックスタート

```js
import { createClient } from "nuwuzu.js";

const client = createClient("uwuzu.net", "your-access-token");

// タイムライン取得
const posts = await client.getTimeline({ limit: 20 });

// 投稿
await client.createPost({ text: "Hello, uwuzu!" });
```

## 主な機能

- タイムライン・投稿・返信・検索・お気に入り・ブックマーク
- OAuth トークン取得フロー
- 自動リトライ（指数バックオフ）
- クライアントサイドレート制限
- タイムアウト・AbortSignal 対応
- TypeScript 型定義同梱

## ドキュメント

詳しい使い方は [USAGE.md](https://github.com/mikumiku-jp/nuwuzu.js/blob/main/USAGE.md) を参照してください。

## ライセンス

MIT
