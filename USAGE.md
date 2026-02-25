# nuwuzu.js 完全リファレンス

uwuzu系サービスAPIラッパー

---

## 目次

1. [インストール](#インストール)
2. [クイックスタート](#クイックスタート)
3. [クライアントの作成](#クライアントの作成)
4. [認証](#認証)
5. [自分のアカウント](#自分のアカウント)
6. [投稿（ueuse）](#投稿ueuse)
7. [ユーザー操作](#ユーザー操作)
8. [お気に入り](#お気に入り)
9. [通知](#通知)
10. [ブックマーク](#ブックマーク)
11. [サーバー情報](#サーバー情報)
12. [管理者操作](#管理者操作)
13. [全件取得（ページネーション）](#全件取得ページネーション)
14. [エラーハンドリング](#エラーハンドリング)
15. [高度なオプション](#高度なオプション)
16. [スコープ一覧](#スコープ一覧)

---

## インストール

```bash
npm install nuwuzu.js
```

---

## クイックスタート

```js
import { createClient } from "nuwuzu.js";

const client = createClient("uwuzu.net", "access-token");

const posts = await client.getTimeline({ limit: 20 });
console.log(posts);
```

---

## クライアントの作成

### `createClient(domain?, token?, opts?)`

最もシンプルな作成方法。

```js
import { createClient } from "nuwuzu.js";

// ドメイン省略 → デフォルト: 'uwuzu.net'
const client = createClient();

// ドメイン指定
const client = createClient("uwuzu.net");

// ドメイン + トークン
const client = createClient("uwuzu.net", "my-token");

// 全オプション指定
const client = createClient("uwuzu.net", "my-token", {
  retry: { maxAttempts: 3, baseDelay: 500 },
  rateLimit: { interval: 1000, maxRequests: 10 },
  timeout: 10000,
});
```

### `new UwuzuClient(options)`

クラスを直接インスタンス化する場合。

```js
import { UwuzuClient } from "nuwuzu.js";

const client = new UwuzuClient({
  domain: "uwuzu.net", // 必須（プロトコル不要）
  token: "access-token", // 省略可
  retry: {
    maxAttempts: 3, // リトライ回数（デフォルト: 3）
    baseDelay: 500, // 初期待機時間 ms（デフォルト: 500）
  },
  rateLimit: {
    interval: 1000, // レート制限ウィンドウ ms（デフォルト: 1000）
    maxRequests: 10, // ウィンドウ内の最大リクエスト数（デフォルト: 10）
  },
  timeout: 10000, // 1リクエストのタイムアウト ms（省略時: 無制限）
  hooks: {
    beforeRequest: ({ path, method, params }) => {
      console.log(`→ ${method} ${path}`);
      // params 内の token は '***' にマスクされている
    },
    afterResponse: ({ path, status, data }) => {
      console.log(`← ${status} ${path}`);
    },
  },
  fetch: customFetch, // カスタム fetch 実装（省略時: globalThis.fetch）
});
```

**domain の制約：**

- `http://` / `https://` プレフィックスは不可（例: ❌ `https://uwuzu.net` → ✅ `uwuzu.net`）
- パス・クエリ・ハッシュ・`@` を含む文字列は不可
- 空白を含む文字列は不可

---

## 認証

### OAuth フロー

uwuzu は独自 OAuth フローを使用します。

**ステップ1: 認証 URL を生成する**

> **注意:** `getAuthURL` は REST API を呼び出しません。ブラウザをリダイレクトさせるための URL を組み立てるユーティリティ関数です。

```js
import { Scopes } from "nuwuzu.js";

const url = client.getAuthURL({
  sessionId: "unique-session-id", // セッションを識別するID（自分で生成）
  client: "MyApp", // アプリ名
  scope: [Scopes.READ_ME, Scopes.READ_UEUSE, Scopes.WRITE_UEUSE],
  icon: "https://example.com/icon.png", // 省略可
  about: "My awesome app", // 省略可
  callback: "https://example.com/callback", // 省略可
});

// ユーザーをこの URL にリダイレクト
console.log(url);
// → https://uwuzu.net/api/auth?session=...&client=MyApp&scope=...
```

**ステップ2: ユーザーが認証後、トークンを取得する**

```js
const result = await client.fetchToken("unique-session-id");
if (result.success) {
  console.log("token:", result.token);
  console.log("userid:", result.userid);
  // client.token は自動で設定される
}
```

`fetchToken` は同じ sessionId で同時に複数回呼び出されても、リクエストは1回のみ送信されます。

---

## 自分のアカウント

### `getMe()` → `Promise<User>`

ログイン中のユーザー情報を取得します。

```js
const me = await client.getMe();
console.log(me.userid);
console.log(me.username);
console.log(me.profile);
console.log(me.isAdmin);
console.log(me.follower_cnt);
```

### `updateSettings(opts?)` → `Promise<{ success? }>`

プロフィールを更新します。

```js
await client.updateSettings({
  username: "新しい名前",
  profile: "自己紹介文",
  icon: "base64-encoded-image", // 省略可
  header: "base64-encoded-image", // 省略可
});
```

---

## 投稿（ueuse）

### `getTimeline(opts?)` → `Promise<Post[]>`

タイムラインを取得します。

```js
const posts = await client.getTimeline();
const posts = await client.getTimeline({ limit: 20, page: 1 });

for (const post of posts) {
  console.log(post.uniqid); // 投稿ID
  console.log(post.text); // テキスト
  console.log(post.account.userid); // 投稿者ID
  console.log(post.nsfw); // NSFW フラグ
  console.log(post.datetime); // 投稿日時
  console.log(post.favorite_cnt); // いいね数
}
```

### `getPost(uniqid)` → `Promise<Post[]>`

特定の投稿を取得します。

```js
const posts = await client.getPost("post-unique-id");
```

### `getReplies(uniqid, opts?)` → `Promise<Post[]>`

投稿へのリプライ一覧を取得します。

```js
const replies = await client.getReplies("post-id", { limit: 10, page: 1 });
```

### `getMentions(opts?)` → `Promise<Post[]>`

自分へのメンション一覧を取得します。

```js
const mentions = await client.getMentions({ limit: 20 });
```

### `searchPosts(keyword, opts?)` → `Promise<Post[]>`

キーワードで投稿を検索します。

```js
const results = await client.searchPosts("キーワード", { limit: 20 });
```

### `createPost(opts)` → `Promise<CreatePostResult>`

投稿を作成します。

```js
// テキストのみ
const result = await client.createPost({ text: "Hello, world!" });

// リプライ
const result = await client.createPost({
  text: "@user リプライです",
  replyid: "reply-target-uniqid",
});

// リポスト（Reuse）
const result = await client.createPost({
  text: "コメントつきリポスト",
  reuseid: "reuse-target-uniqid",
});

// 画像つき（base64）
const result = await client.createPost({
  text: "写真",
  nsfw: false,
  image1: "data:image/jpeg;base64,...", // 最大 8MB
  image2: "...", // 省略可（最大4枚）
});

console.log(result.uniqid); // 作成された投稿ID
```

**制約：**

- `text` は必須、最大 5,000 文字
- `image1`〜`image4` は base64 文字列、各最大 8MB

### `deletePost(uniqid)` → `Promise<{ success?, uniqid?, userid? }>`

投稿を削除します。

```js
await client.deletePost("post-id");
```

---

## ユーザー操作

### `getUser(userid)` → `Promise<User>`

ユーザー情報を取得します。

```js
const user = await client.getUser("target-userid");
console.log(user.username);
console.log(user.follower_cnt);
console.log(user.followee_cnt);
```

### `follow(userid)` / `unfollow(userid)`

フォロー・アンフォローします。

```js
await client.follow("target-userid");
await client.unfollow("target-userid");
```

---

## お気に入り

### `toggleFavorite(uniqid)` → `Promise<Favorite>`

いいねをトグルします（つけていなければ追加、つけていれば解除）。

```js
const result = await client.toggleFavorite("post-id");
console.log(result.favorite_list); // いいねしたユーザー
```

### `getFavorite(uniqid)` → `Promise<Favorite>`

いいね情報を取得します。

```js
const result = await client.getFavorite("post-id");
```

---

## 通知

### `getNotifications(opts?)` → `Promise<Record<string, Notification>>`

通知一覧を取得します。

```js
const notifs = await client.getNotifications({ limit: 20, page: 1 });
for (const [key, notif] of Object.entries(notifs)) {
  if (notif.category === "follow") {
    console.log(`${notif.from.username} にフォローされました`);
  }
  if (notif.category === "favorite") {
    console.log(`投稿がいいねされました`);
  }
}
```

### `readNotifications()` → `Promise<{ success? }>`

全通知を既読にします。

```js
await client.readNotifications();
```

---

## ブックマーク

### `getBookmarks(opts?)` → `Promise<Post[]>`

ブックマーク一覧を取得します。

```js
const bookmarks = await client.getBookmarks({ limit: 20 });
```

---

## サーバー情報

### `getServerInfo()` → `Promise<ServerInfo>`

認証不要。サーバー情報を取得します。

```js
const info = await client.getServerInfo();
console.log(info.server_info.server_name);
console.log(info.server_info.usage.users);
console.log(info.software.version);
if (info.server_notice) {
  for (const notice of info.server_notice) {
    console.log(notice.title, notice.note);
  }
}
```

---

## 管理者操作

管理者権限が必要です。

### `adminGetUser(userid)` → `Promise<User>`

ユーザーの詳細情報（IPアドレス等）を取得します。

```js
const user = await client.adminGetUser("target-userid");
console.log(user.last_login_ipaddress);
console.log(user.last_login_datetime);
```

### `adminSanction(opts)` → `Promise<{ success?, userid? }>`

ユーザーに制裁を行います。

```js
// 凍結
await client.adminSanction({ userid: "target-userid", type: "frozen" });

// 凍結解除
await client.adminSanction({ userid: "target-userid", type: "unfrozen" });

// BAN（really フラグ必須）
await client.adminSanction({
  userid: "target-userid",
  type: "ban",
  really: "yes",
});

// 通知のみ送る
await client.adminSanction({
  userid: "target-userid",
  type: "notification",
  notification_title: "ご注意",
  notification_message: "利用規約に違反しています",
});

// type の選択肢: 'notification' | 'frozen' | 'unfrozen' | 'ban'
```

### `adminGetReports(opts?)` → `Promise<{ success?, data? }>`

通報一覧を取得します。

```js
const { data: reports } = await client.adminGetReports({ limit: 20 });
for (const report of reports) {
  console.log(report.reported_userid, report.total_count);
  for (const detail of report.details) {
    console.log(detail.reporter_userid, detail.message);
  }
}
```

### `adminResolveReport(opts?)` → `Promise<{ success?, reported_userid? }>`

通報を解決済みにします。

```js
// ユーザーID で解決
await client.adminResolveReport({ reported_userid: "target-userid" });

// 投稿ID で解決
await client.adminResolveReport({ uniqid: "post-id" });
```

---

## 全件取得（ページネーション）

`*All` メソッドは `AsyncGenerator` を返します。ページを自動的に繰り返し取得し、全件を yield します。

### 使用例

```js
import { collect } from "nuwuzu.js";

// for-await-of で1件ずつ処理（メモリ効率が良い）
for await (const post of client.timelineAll()) {
  console.log(post.text);
}

// collect() で全件を配列に収集
const allPosts = await collect(client.timelineAll());
console.log(allPosts.length);
```

### 共通オプション

全 `*All` メソッドで以下のオプションが使えます。

```js
client.timelineAll({
  limit: 20, // 1ページあたりの件数
  page: 1, // 開始ページ（デフォルト: 1）
  maxPages: 5, // 最大ページ数（省略時: 無制限）
  signal: abortSignal, // AbortSignal で途中キャンセル可能
});
```

### メソッド一覧

| メソッド                    | 返す型                         | 説明             |
| --------------------------- | ------------------------------ | ---------------- |
| `timelineAll(opts?)`        | `AsyncGenerator<Post>`         | タイムライン全件 |
| `bookmarksAll(opts?)`       | `AsyncGenerator<Post>`         | ブックマーク全件 |
| `mentionsAll(opts?)`        | `AsyncGenerator<Post>`         | メンション全件   |
| `notificationsAll(opts?)`   | `AsyncGenerator<Notification>` | 通知全件         |
| `repliesAll(uniqid, opts?)` | `AsyncGenerator<Post>`         | リプライ全件     |
| `searchAll(keyword, opts?)` | `AsyncGenerator<Post>`         | 検索結果全件     |

### AbortController でキャンセル

```js
const ac = new AbortController();

setTimeout(() => ac.abort(), 2000);

try {
  for await (const post of client.timelineAll({ signal: ac.signal })) {
    console.log(post.text);
  }
} catch (err) {
  if (err instanceof UwuzuNetworkError) {
    console.log("キャンセルされました");
  }
}
```

---

## エラーハンドリング

全エラーは `UwuzuError` のサブクラスです。`err.code` で `switch` 文による分岐が書けます。

### エラークラス一覧

| クラス                | `err.code`                       | 発生条件                            |
| --------------------- | -------------------------------- | ----------------------------------- |
| `UwuzuError`          | —                                | バリデーションエラー等の基底クラス  |
| `UwuzuAuthError`      | `'unauthorized'` / `'forbidden'` | 認証失敗（401/403）、トークン未設定 |
| `UwuzuNotFoundError`  | `'not_found'`                    | リソース未存在（404）               |
| `UwuzuAPIError`       | `'token_invalid'` 等 / `null`    | APIエラー（`success: false`）       |
| `UwuzuRateLimitError` | `'rate_limit'`                   | レート制限（429）                   |
| `UwuzuNetworkError`   | `'network_error'`                | ネットワーク障害、タイムアウト      |

### switch で分岐

```js
import {
  isUwuzuError,
  UwuzuNetworkError,
  UwuzuRateLimitError,
} from "nuwuzu.js";

try {
  const me = await client.getMe();
} catch (err) {
  if (!isUwuzuError(err)) throw err;

  switch (err.code) {
    case "unauthorized":
      console.error("トークンが無効か期限切れです");
      break;
    case "forbidden":
      console.error("権限がありません");
      break;
    case "not_found":
      console.error("リソースが見つかりません");
      break;
    case "rate_limit":
      // UwuzuRateLimitError は retryAfter プロパティを持つ
      console.error(`レート制限: ${err.retryAfter ?? "?"}秒後に再試行`);
      break;
    case "network_error":
      console.error("通信エラー:", err.message);
      break;
    case "token_invalid":
      console.error("トークンが無効です。再認証が必要です");
      break;
    case "invalid_response":
      console.error("サーバーから不正なレスポンスが返されました");
      break;
    default:
      console.error(err.message);
  }
}
```

### instanceof で分岐

```js
import {
  UwuzuAuthError,
  UwuzuNotFoundError,
  UwuzuRateLimitError,
  UwuzuNetworkError,
} from "nuwuzu.js";

try {
  await client.getMe();
} catch (err) {
  if (err instanceof UwuzuRateLimitError) {
    const wait = err.retryAfter ?? 60;
    console.log(`${wait}秒後に再試行します`);
    await new Promise((r) => setTimeout(r, wait * 1000));
  } else if (err instanceof UwuzuAuthError) {
    console.error(`認証エラー (${err.code}):`, err.message);
    // err.code === 'unauthorized' → トークン無効
    // err.code === 'forbidden'    → 権限不足
  } else if (err instanceof UwuzuNotFoundError) {
    console.error("リソースが見つかりません");
  } else if (err instanceof UwuzuNetworkError) {
    console.error("ネットワークエラー:", err.message);
    console.error("原因:", err.cause);
  }
}
```

### `UwuzuAPIError` の詳細情報

```js
import { UwuzuAPIError } from "nuwuzu.js";

try {
  await client.getMe();
} catch (err) {
  if (err instanceof UwuzuAPIError) {
    console.log(err.endpoint); // 失敗したエンドポイント
    console.log(err.status); // HTTP ステータスコード
    console.log(err.serverResponse); // サニタイズ済みのサーバーレスポンス
    // serverResponse には success / error_code / message が含まれる
  }
}
```

---

## 高度なオプション

### リトライ設定

5xx エラーと 429 レート制限は自動リトライされます。指数バックオフを使用。

```js
const client = createClient("uwuzu.net", "token", {
  retry: {
    maxAttempts: 5, // 最大5回試みる（デフォルト: 3）
    baseDelay: 1000, // 初回待機 1000ms（2回目: 2000ms、3回目: 4000ms…）
  },
});
```

リトライ待機時間: `baseDelay * 2^(attempt - 1)`

- 1回目失敗 → 1000ms 待機
- 2回目失敗 → 2000ms 待機
- 3回目失敗 → 4000ms 待機

429 の場合は `Retry-After` ヘッダーがあればその値を優先します。

### レート制限（クライアント側）

```js
const client = createClient("uwuzu.net", "token", {
  rateLimit: {
    interval: 1000, // 1000ms ウィンドウ（デフォルト: 1000）
    maxRequests: 5, // ウィンドウ内 5リクエストまで（デフォルト: 10）
  },
});

// 無効化
const client = createClient("uwuzu.net", "token", {
  rateLimit: { interval: 0, maxRequests: 0 },
});
```

### タイムアウト

```js
const client = createClient("uwuzu.net", "token", {
  timeout: 5000, // 5秒でタイムアウト → UwuzuNetworkError がスローされる
});
```

### デバッグフック

```js
const client = createClient("uwuzu.net", "token", {
  hooks: {
    beforeRequest: ({ path, method, params }) => {
      console.log(`[REQ] ${method} ${path}`, params);
    },
    afterResponse: ({ path, status, data }) => {
      console.log(`[RES] ${status} ${path}`, data);
    },
  },
});
```

### カスタム fetch

```js
// Node.js 環境で undici を使う場合
import { fetch } from "undici";
const client = createClient("uwuzu.net", "token", { fetch });

// プロキシ経由
import { ProxyAgent, fetch as undiciFetch } from "undici";
const dispatcher = new ProxyAgent("http://proxy:8080");
const proxyFetch = (url, init) => undiciFetch(url, { ...init, dispatcher });
const client = createClient("uwuzu.net", "token", {
  fetch: proxyFetch,
});

// テストでモック（vitest）
import { vi } from "vitest";
const mockFetch = vi.fn().mockResolvedValue({
  ok: true,
  status: 200,
  headers: { get: () => null },
  json: async () => ({ userid: "u1", username: "test" }),
});
const client = createClient("uwuzu.net", "token", { fetch: mockFetch });
```

---

## スコープ一覧

`Scopes` オブジェクトで OAuth スコープを参照できます。

```js
import { Scopes } from "nuwuzu.js";
```

| 定数名                        | スコープ文字列                | 権限内容                 |
| ----------------------------- | ----------------------------- | ------------------------ |
| `Scopes.READ_ME`              | `'read:me'`                   | 自分のプロフィールを読む |
| `Scopes.WRITE_ME`             | `'write:me'`                  | プロフィールを更新する   |
| `Scopes.READ_UEUSE`           | `'read:ueuse'`                | タイムライン・投稿を読む |
| `Scopes.WRITE_UEUSE`          | `'write:ueuse'`               | 投稿・削除する           |
| `Scopes.READ_USERS`           | `'read:users'`                | ユーザー情報を読む       |
| `Scopes.WRITE_FOLLOW`         | `'write:follow'`              | フォロー・アンフォロー   |
| `Scopes.WRITE_FAVORITE`       | `'write:favorite'`            | いいね                   |
| `Scopes.READ_NOTIFICATIONS`   | `'read:notifications'`        | 通知を読む               |
| `Scopes.WRITE_NOTIFICATIONS`  | `'write:notifications'`       | 通知を既読にする         |
| `Scopes.READ_BOOKMARK`        | `'read:bookmark'`             | ブックマークを読む       |
| `Scopes.WRITE_BOOKMARK`       | `'write:bookmark'`            | ブックマークを追加・削除 |
| `Scopes.ADMIN_READ_USERS`     | `'read:admin:users'`          | ユーザー詳細（管理者）   |
| `Scopes.ADMIN_WRITE_SANCTION` | `'write:admin:user-sanction'` | 制裁（管理者）           |
| `Scopes.ADMIN_READ_REPORTS`   | `'read:admin:reports'`        | 通報一覧（管理者）       |
| `Scopes.ADMIN_WRITE_REPORTS`  | `'write:admin:reports'`       | 通報解決（管理者）       |

---

## TypeScript

nuwuzu.js は型定義を同梱しています。

```ts
import {
  UwuzuClient,
  createClient,
  collect,
  Scopes,
  isUwuzuError,
  UwuzuError,
  UwuzuAuthError,
  UwuzuNotFoundError,
  UwuzuAPIError,
  UwuzuRateLimitError,
  UwuzuNetworkError,
} from "nuwuzu.js";

import type {
  ClientOptions,
  RetryOptions,
  RateLimitOptions,
  HookOptions,
  User,
  Post,
  Notification,
  Favorite,
  ServerInfo,
  CreatePostResult,
  Report,
  Scope,
} from "nuwuzu.js";
```
