export class UwuzuError extends Error {
  constructor(message: string, status?: number);
  status?: number;
  code?: string;
}

export class UwuzuAuthError extends UwuzuError {
  constructor(message?: string, code?: string);
  code: string;
}

export class UwuzuNotFoundError extends UwuzuError {
  constructor(message?: string);
  code: 'not_found';
}

export class UwuzuAPIError extends UwuzuError {
  constructor(opts: {
    message: string;
    status: number;
    endpoint: string;
    serverResponse: unknown;
    code?: string;
  });
  endpoint: string;
  serverResponse: unknown;
  code: string | null;
}

export class UwuzuRateLimitError extends UwuzuAPIError {
  constructor(opts: {
    message: string;
    status: number;
    endpoint: string;
    serverResponse: unknown;
    retryAfter: number | null;
  });
  retryAfter: number | null;
  code: 'rate_limit';
}

export class UwuzuNetworkError extends UwuzuError {
  constructor(message: string, cause?: unknown);
  cause: unknown;
  code: 'network_error';
}

export function isUwuzuError(err: unknown): err is UwuzuError;

export interface RetryOptions {
  maxAttempts?: number;
  baseDelay?: number;
}

export interface RateLimitOptions {
  interval?: number;
  maxRequests?: number;
}

export interface HookOptions {
  beforeRequest?: (ctx: { path: string; method: string; params: Record<string, unknown> }) => void | Promise<void>;
  afterResponse?: (ctx: { path: string; method: string; status: number; data: unknown }) => void | Promise<void>;
}

export interface ClientOptions {
  domain: string;
  token?: string;
  retry?: RetryOptions;
  rateLimit?: RateLimitOptions;
  timeout?: number;
  hooks?: HookOptions;
  fetch?: typeof globalThis.fetch;
}

export interface Role {
  name: string;
  color: string;
  effect: string;
  id: string;
}

export interface User {
  userid?: string;
  username?: string;
  profile?: string;
  user_icon?: string;
  user_header?: string;
  registered_date?: string;
  followee?: string[];
  followee_cnt?: number;
  follower?: string[];
  follower_cnt?: number;
  ueuse_cnt?: number;
  isBot?: boolean;
  isAdmin?: boolean;
  role?: Role[];
  online_status?: string;
  language?: string;
  mailaddress?: string;
  last_login_datetime?: string;
  last_login_ipaddress?: string;
  real_online_status?: string;
  is_2fa_configured?: boolean;
  [key: string]: unknown;
}

export interface PostAccount {
  username: string;
  userid: string;
  user_icon: string;
  user_header: string;
  is_bot: boolean;
}

export interface Post {
  uniqid?: string;
  replyid?: string;
  reuseid?: string;
  text?: string;
  account?: PostAccount;
  photo1?: string;
  photo2?: string;
  photo3?: string;
  photo4?: string;
  video1?: string;
  favorite?: string[];
  favorite_cnt?: string;
  datetime?: string;
  abi?: string;
  abidatetime?: string;
  nsfw?: boolean;
  [key: string]: unknown;
}

export interface NotificationFrom {
  username: string;
  userid: string;
  user_icon: string;
  user_header: string;
}

export interface Notification {
  from?: NotificationFrom;
  category?: string;
  title?: string;
  text?: string;
  datetime?: string;
  valueid?: string;
  is_checked?: boolean;
  [key: string]: unknown;
}

export interface Favorite {
  favorite_list?: string;
  success?: boolean;
  [key: string]: unknown;
}

export interface ServerInfo {
  server_info?: {
    server_name: string;
    server_icon: string;
    server_description: string;
    adminstor: { name: string; email: string };
    terms_url: string;
    privacy_policy_url: string;
    max_ueuse_length: number;
    invitation_code: boolean;
    account_migration: boolean;
    usage: { users: number; ueuse: number };
  };
  software?: {
    name: string;
    version: string;
    repository: string;
  };
  server_notice?: Array<{
    title: string;
    note: string;
    editor: string;
    datetime: string;
  }>;
  [key: string]: unknown;
}

export interface CreatePostResult {
  uniqid: string;
  userid: string;
  [key: string]: unknown;
}

export interface Report {
  reported_userid: string;
  total_count: number;
  details: Array<{
    uniqid: string;
    reporter_userid: string;
    message: string;
    datetime: string;
  }>;
}

export type Scope =
  | "read:me"
  | "write:me"
  | "read:ueuse"
  | "read:users"
  | "write:ueuse"
  | "write:follow"
  | "write:favorite"
  | "read:notifications"
  | "write:notifications"
  | "write:bookmark"
  | "read:bookmark"
  | "read:admin:users"
  | "write:admin:user-sanction"
  | "read:admin:reports"
  | "write:admin:reports";

export const Scopes: Readonly<
  Record<
    | "READ_ME"
    | "WRITE_ME"
    | "READ_UEUSE"
    | "READ_USERS"
    | "WRITE_UEUSE"
    | "WRITE_FOLLOW"
    | "WRITE_FAVORITE"
    | "READ_NOTIFICATIONS"
    | "WRITE_NOTIFICATIONS"
    | "WRITE_BOOKMARK"
    | "READ_BOOKMARK"
    | "ADMIN_READ_USERS"
    | "ADMIN_WRITE_SANCTION"
    | "ADMIN_READ_REPORTS"
    | "ADMIN_WRITE_REPORTS",
    Scope
  >
>;

export function createClient(
  domain?: string,
  token?: string,
  opts?: Omit<ClientOptions, "domain" | "token">,
): UwuzuClient;

export function collect<T>(gen: AsyncIterable<T>): Promise<T[]>;

export class UwuzuClient {
  constructor(options: ClientOptions);
  readonly domain: string;
  token: string | null;

  getAuthURL(opts: {
    sessionId: string;
    client: string;
    scope: string[];
    icon?: string;
    about?: string;
    callback?: string;
  }): string;
  fetchToken(sessionId: string): Promise<{
    success: boolean;
    username?: string;
    userid?: string;
    token?: string;
  }>;

  getServerInfo(): Promise<ServerInfo>;

  getMe(): Promise<User>;
  getNotifications(opts?: {
    limit?: number;
    page?: number;
  }): Promise<Record<string, Notification | unknown>>;
  readNotifications(): Promise<{ success?: boolean }>;
  updateSettings(opts?: {
    username?: string;
    profile?: string;
    icon?: string;
    header?: string;
  }): Promise<{ success?: boolean }>;

  getUser(userid: string): Promise<User>;
  follow(userid: string): Promise<{ userid?: string; success?: boolean }>;
  unfollow(userid: string): Promise<{ userid?: string; success?: boolean }>;

  getTimeline(opts?: { limit?: number; page?: number }): Promise<Post[]>;
  getPost(uniqid: string): Promise<Post[]>;
  getReplies(
    uniqid: string,
    opts?: { limit?: number; page?: number },
  ): Promise<Post[]>;
  getMentions(opts?: { limit?: number; page?: number }): Promise<Post[]>;
  searchPosts(
    keyword: string,
    opts?: { limit?: number; page?: number },
  ): Promise<Post[]>;
  createPost(opts: {
    text: string;
    nsfw?: boolean;
    replyid?: string;
    reuseid?: string;
    image1?: string;
    image2?: string;
    image3?: string;
    image4?: string;
  }): Promise<CreatePostResult>;
  deletePost(
    uniqid: string,
  ): Promise<{ uniqid?: string; userid?: string; success?: boolean }>;
  getBookmarks(opts?: { limit?: number; page?: number }): Promise<Post[]>;

  toggleFavorite(uniqid: string): Promise<Favorite>;
  getFavorite(uniqid: string): Promise<Favorite>;

  timelineAll(opts?: {
    limit?: number;
    page?: number;
    maxPages?: number;
    signal?: AbortSignal;
  }): AsyncGenerator<Post, void, unknown>;
  bookmarksAll(opts?: {
    limit?: number;
    page?: number;
    maxPages?: number;
    signal?: AbortSignal;
  }): AsyncGenerator<Post, void, unknown>;
  notificationsAll(opts?: {
    limit?: number;
    page?: number;
    maxPages?: number;
    signal?: AbortSignal;
  }): AsyncGenerator<Notification, void, unknown>;
  repliesAll(
    uniqid: string,
    opts?: { limit?: number; page?: number; maxPages?: number; signal?: AbortSignal },
  ): AsyncGenerator<Post, void, unknown>;
  mentionsAll(opts?: {
    limit?: number;
    page?: number;
    maxPages?: number;
    signal?: AbortSignal;
  }): AsyncGenerator<Post, void, unknown>;
  searchAll(
    keyword: string,
    opts?: { limit?: number; page?: number; maxPages?: number; signal?: AbortSignal },
  ): AsyncGenerator<Post, void, unknown>;

  adminGetUser(userid: string): Promise<User>;
  adminSanction(opts: {
    userid: string;
    type: "notification" | "frozen" | "unfrozen" | "ban";
    notification_title?: string;
    notification_message?: string;
    really?: string;
  }): Promise<{ success?: boolean; userid?: string }>;
  adminGetReports(opts?: {
    limit?: number;
    page?: number;
  }): Promise<{ success?: boolean; data?: Report[] }>;
  adminResolveReport(opts?: {
    reported_userid?: string;
    uniqid?: string;
  }): Promise<{ success?: boolean; reported_userid?: string }>;
}
