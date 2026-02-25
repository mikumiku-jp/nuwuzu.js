import { UwuzuError, UwuzuAuthError, UwuzuNotFoundError, UwuzuAPIError, UwuzuRateLimitError, UwuzuNetworkError } from './errors.js';
import { RateLimiter } from './rate-limiter.js';

const DEFAULT_RETRY_MAX   = 3;
const DEFAULT_RETRY_DELAY = 500;
const DEFAULT_RL_INTERVAL = 1000;
const DEFAULT_RL_MAX_REQ  = 10;
const MAX_TIMEOUT_MS      = 2_147_483_647;
const MAX_POST_TEXT_LENGTH = 5_000;
const MAX_IMAGE_B64_LENGTH = 8_000_000;

export class UwuzuClient {
  constructor({ domain = 'uwuzu.net', token, retry = {}, rateLimit = {}, timeout, hooks, fetch: customFetch } = {}) {
    UwuzuClient._validateDomain(domain);

    this.domain   = domain;
    this.token    = token ?? null;
    this._baseURL = `https://${domain}/api`;

    const retryMax   = Number.isInteger(retry.maxAttempts) ? retry.maxAttempts : DEFAULT_RETRY_MAX;
    const retryDelay = Number.isInteger(retry.baseDelay)   ? retry.baseDelay   : DEFAULT_RETRY_DELAY;
    if (retryMax < 1)   throw new UwuzuError('retry.maxAttempts must be >= 1');
    if (retryDelay < 0) throw new UwuzuError('retry.baseDelay must be >= 0');

    this._retryMax   = retryMax;
    this._retryDelay = retryDelay;
    this._timeout    = typeof timeout === 'number' && timeout > 0 ? Math.min(timeout, MAX_TIMEOUT_MS) : 0;
    this._hooks      = hooks ?? {};
    this._fetch      = customFetch ?? globalThis.fetch;

    const rlInterval = Number.isInteger(rateLimit.interval)    ? rateLimit.interval    : DEFAULT_RL_INTERVAL;
    const rlMaxReq   = Number.isInteger(rateLimit.maxRequests) ? rateLimit.maxRequests : DEFAULT_RL_MAX_REQ;
    this._rl         = new RateLimiter({ interval: rlInterval, maxRequests: rlMaxReq });
    this._tokenFetch = null;
  }

  static _validateDomain(domain) {
    if (typeof domain !== 'string' || domain.length === 0) {
      throw new UwuzuError('domain is required');
    }
    if (domain !== domain.trim() || /\s/.test(domain)) {
      throw new UwuzuError('domain must not contain whitespace');
    }
    if (/^https?:\/\//i.test(domain)) {
      throw new UwuzuError('domain must not include a protocol (http:// or https://)');
    }
    if (/[/\\?#@]/.test(domain)) {
      throw new UwuzuError('domain contains invalid characters');
    }

    let parsed;
    try {
      parsed = new URL(`https://${domain}`);
    } catch {
      throw new UwuzuError('domain format is invalid');
    }

    if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
      throw new UwuzuError('domain format is invalid');
    }
    if (domain !== parsed.host && domain !== parsed.hostname) {
      throw new UwuzuError('domain format is invalid');
    }
  }

  static _sleep(ms) {
    return new Promise((r) => setTimeout(r, Math.min(ms, MAX_TIMEOUT_MS)));
  }

  static _httpMessage(status) {
    const map = {
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      408: 'Request Timeout',
      409: 'Conflict',
      422: 'Unprocessable Entity',
      429: 'Rate Limit Exceeded',
      500: 'Internal Server Error',
      502: 'Bad Gateway',
      503: 'Service Unavailable',
      504: 'Gateway Timeout',
    };
    return map[status] ?? `HTTP Error ${status}`;
  }

  static _parseRetryAfter(res) {
    const v = res.headers.get('Retry-After') ?? res.headers.get('X-RateLimit-Reset');
    if (!v) return null;
    const n = Number(v);
    if (!isNaN(n)) {
      if (n > 1_000_000_000) return Math.max(0, Math.ceil(n - Date.now() / 1000));
      return Math.max(0, Math.min(n, MAX_TIMEOUT_MS / 1000));
    }
    const d = new Date(v);
    if (!isNaN(d.getTime())) return Math.max(0, Math.ceil((d.getTime() - Date.now()) / 1000));
    return null;
  }

  static _networkMessage(err) {
    const msg  = err?.message ?? '';
    const code = err?.code    ?? '';
    if (/ENOTFOUND|getaddrinfo/i.test(msg) || code === 'ENOTFOUND') return 'Network Error — host not found';
    if (/ECONNREFUSED/i.test(msg)          || code === 'ECONNREFUSED') return 'Network Error — connection refused';
    if (/ETIMEDOUT|timeout/i.test(msg)     || code === 'ETIMEDOUT')  return 'Network Error — request timed out';
    if (/ECONNRESET/i.test(msg)            || code === 'ECONNRESET') return 'Network Error — connection reset';
    if (/CERT|SSL|TLS/i.test(msg))                                   return 'Network Error — TLS/certificate error';
    return 'Network Error — failed to connect to server';
  }

  static _apiErrorMessage(data) {
    const codeMap = {
      token_invalid:     'Invalid token',
      token_expired:     'Token expired',
      not_found:         'Resource not found',
      ueuse_not_found:   'Post not found',
      user_not_found:    'User not found',
      permission_denied: 'Permission denied',
      rate_limit:        'Rate Limit Exceeded',
      invalid_param:     'Invalid parameter',
      server_error:      'Server error',
    };
    const ec = Object.prototype.hasOwnProperty.call(data, 'error_code') ? data.error_code : null;
    if (ec && codeMap[ec]) return codeMap[ec];
    const msg = Object.prototype.hasOwnProperty.call(data, 'message')    ? data.message    : null;
    const err = Object.prototype.hasOwnProperty.call(data, 'error')      ? data.error      : null;
    return String(msg ?? ec ?? err ?? 'request failed');
  }

  static _sanitizeServerResponse(data) {
    if (!data || typeof data !== 'object') return null;
    const safe = Object.create(null);
    const SAFE_KEYS = ['success', 'error_code', 'message', 'error', 'status', 'code'];
    for (const k of SAFE_KEYS) {
      if (Object.prototype.hasOwnProperty.call(data, k)) safe[k] = data[k];
    }
    return safe;
  }

  static _maskSensitiveParams(params) {
    const masked = { ...params };
    if (Object.prototype.hasOwnProperty.call(masked, 'token')) {
      masked.token = '***';
    }
    return masked;
  }

  _prepareParams(params, requireToken) {
    if (requireToken) {
      if (!this.token) throw new UwuzuAuthError('token is not set — call fetchToken() first');
      params = { token: this.token, ...params };
    }

    for (const k of ['limit', 'page']) {
      const v = params[k];
      if (v != null && (!Number.isInteger(v) || v < 0)) {
        throw new UwuzuError(`parameter "${k}" must be a non-negative integer`);
      }
    }

    for (const k of Object.keys(params)) {
      if (params[k] == null) delete params[k];
    }

    return params;
  }

  async _request(path, params = {}, { method = 'POST', requireToken = true, allowedErrorCodes = [], signal } = {}) {
    params = this._prepareParams(params, requireToken);

    const url     = `${this._baseURL}/${path}`;
    const retries = this._retryMax;
    const delay   = this._retryDelay;

    if (this._hooks.beforeRequest) {
      await this._hooks.beforeRequest({
        path,
        method,
        params: UwuzuClient._maskSensitiveParams(params),
      });
    }

    for (let attempt = 1; ; attempt++) {
      let abortCtrl = null;
      let timeoutId = null;

      if (this._timeout > 0 || signal != null) {
        abortCtrl = new AbortController();

        if (signal != null) {
          if (signal.aborted) {
            throw new UwuzuNetworkError('Request was aborted', signal.reason);
          }
          signal.addEventListener('abort', () => abortCtrl.abort(signal.reason), { once: true });
        }

        if (this._timeout > 0) {
          timeoutId = setTimeout(
            () => abortCtrl.abort(new UwuzuNetworkError(`Request timed out after ${this._timeout}ms`)),
            this._timeout
          );
        }
      }

      let res;
      try {
        const doFetch = () => {
          if (method === 'GET') {
            return abortCtrl
              ? this._fetch(`${url}${this._buildQS(params)}`, { signal: abortCtrl.signal })
              : this._fetch(`${url}${this._buildQS(params)}`);
          }
          const body = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params) };
          return this._fetch(url, abortCtrl ? { ...body, signal: abortCtrl.signal } : body);
        };

        res = await (this._rl.enabled ? this._rl.enqueue(doFetch) : doFetch());
      } catch (networkErr) {
        if (abortCtrl?.signal.aborted) {
          const reason = abortCtrl.signal.reason;
          if (reason instanceof UwuzuNetworkError) throw reason;
          throw new UwuzuNetworkError('Request was aborted', reason);
        }
        const msg = UwuzuClient._networkMessage(networkErr);
        if (attempt >= retries) throw new UwuzuNetworkError(msg, networkErr);
        await UwuzuClient._sleep(delay * (2 ** (attempt - 1)));
        continue;
      } finally {
        if (timeoutId != null) clearTimeout(timeoutId);
      }

      if (res.status === 401) throw new UwuzuAuthError('Unauthorized — token may be invalid or expired');
      if (res.status === 403) throw new UwuzuAuthError('Forbidden — insufficient permissions for this operation', 'forbidden');
      if (res.status === 404) throw new UwuzuNotFoundError();

      if (res.status === 429) {
        const retryAfter = UwuzuClient._parseRetryAfter(res);
        if (attempt < retries) {
          const waitMs = retryAfter != null ? retryAfter * 1000 : delay * (2 ** (attempt - 1));
          await UwuzuClient._sleep(waitMs);
          continue;
        }
        const msg = retryAfter != null
          ? `Rate Limit Exceeded — retry after ${retryAfter}s`
          : 'Rate Limit Exceeded';
        throw new UwuzuRateLimitError({ message: msg, status: 429, endpoint: path, serverResponse: null, retryAfter });
      }

      if (!res.ok) {
        if (res.status >= 500 && attempt < retries) {
          await UwuzuClient._sleep(delay * (2 ** (attempt - 1)));
          continue;
        }
        throw new UwuzuAPIError({
          message: UwuzuClient._httpMessage(res.status),
          status: res.status,
          endpoint: path,
          serverResponse: null,
        });
      }

      let data;
      try {
        data = await res.json();
      } catch (parseErr) {
        throw new UwuzuAPIError({
          message: 'Invalid response — server returned non-JSON body',
          status: res.status,
          endpoint: path,
          serverResponse: null,
          code: 'invalid_response',
        });
      }

      if (this._hooks.afterResponse) {
        await this._hooks.afterResponse({ path, method, status: res.status, data });
      }

      if (data !== null && typeof data === 'object' && !Array.isArray(data)) {
        const isError = data.success === false || (data.error_code != null && !data.success);
        if (isError && !allowedErrorCodes.includes(data.error_code)) {
          throw new UwuzuAPIError({
            message: UwuzuClient._apiErrorMessage(data),
            status: res.status,
            endpoint: path,
            serverResponse: UwuzuClient._sanitizeServerResponse(data),
          });
        }
      }

      return data;
    }
  }

  _buildQS(params) {
    const keys = Object.keys(params);
    if (keys.length === 0) return '';
    return '?' + keys.map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`).join('&');
  }

  async *_paginate(fetchPage, { limit, page = 1, maxPages, signal } = {}, arrayKeys) {
    const hasLimit = typeof limit === 'number' && limit > 0;
    let current = page;
    let fetched = 0;
    let prevFirstId = null;

    while (true) {
      if (signal?.aborted) break;

      const data  = await fetchPage({ limit, page: current });
      const items = UwuzuClient._extractArray(data, arrayKeys);
      if (items.length === 0) break;

      const firstId = items[0]?.uniqid ?? items[0]?.id ?? null;
      if (firstId != null && firstId === prevFirstId) break;
      prevFirstId = firstId;

      for (const item of items) yield item;

      fetched++;
      if (maxPages !== undefined && fetched >= maxPages) break;
      if (hasLimit && items.length < limit) break;
      current++;
    }
  }

  static _extractArray(data, keys) {
    if (Array.isArray(data)) return data;
    if (data == null || typeof data !== 'object') return [];

    for (const k of keys) {
      if (Object.prototype.hasOwnProperty.call(data, k) && Array.isArray(data[k])) return data[k];
    }

    const numericKeys = Object.keys(data).filter((k) => /^\d+$/.test(k));
    if (numericKeys.length > 0) {
      return numericKeys.sort((a, b) => Number(a) - Number(b)).map((k) => data[k]);
    }

    return [];
  }

  getAuthURL({ sessionId, client, scope, icon, about, callback }) {
    if (!sessionId) throw new UwuzuError('sessionId is required');
    if (!client)    throw new UwuzuError('client is required');
    if (!scope?.length) throw new UwuzuError('scope requires at least one entry');

    const q = new URLSearchParams({ session: sessionId, client, scope: scope.join(',') });
    if (icon)     q.set('icon', icon);
    if (about)    q.set('about', about);
    if (callback) q.set('callback', callback);

    return `https://${this.domain}/api/auth?${q.toString()}`;
  }

  async fetchToken(sessionId) {
    if (!sessionId) throw new UwuzuError('sessionId is required');
    if (this._tokenFetch) return this._tokenFetch;
    this._tokenFetch = this._request('token/get', { session: sessionId }, { requireToken: false })
      .then((data) => {
        if (data.token) this.token = data.token;
        return data;
      })
      .finally(() => { this._tokenFetch = null; });
    return this._tokenFetch;
  }

  getServerInfo() {
    return this._request('serverinfo-api', {}, { method: 'GET', requireToken: false });
  }

  getMe() {
    return this._request('me/');
  }

  getNotifications({ limit, page } = {}) {
    return this._request('me/notification/', { limit, page });
  }

  readNotifications() {
    return this._request('me/notification/read');
  }

  updateSettings({ username, profile, icon, header } = {}) {
    return this._request('me/settings/', { username, profile, icon, header });
  }

  getUser(userid) {
    return this._request('users/', { userid });
  }

  follow(userid) {
    return this._request('users/follow', { userid });
  }

  unfollow(userid) {
    return this._request('users/unfollow', { userid });
  }

  getTimeline({ limit, page } = {}) {
    return this._request('ueuse/', { limit, page });
  }

  getPost(uniqid) {
    return this._request('ueuse/get', { uniqid });
  }

  getReplies(uniqid, { limit, page } = {}) {
    return this._request('ueuse/replies', { uniqid, limit, page });
  }

  getMentions({ limit, page } = {}) {
    return this._request('ueuse/mentions', { limit, page }, { allowedErrorCodes: ['ueuse_not_found'] });
  }

  searchPosts(keyword, { limit, page } = {}) {
    return this._request('ueuse/search', { keyword, limit, page });
  }

  createPost({ text, nsfw, replyid, reuseid, image1, image2, image3, image4 }) {
    if (typeof text !== 'string' || text.length === 0) {
      throw new UwuzuError('text is required');
    }
    if (text.length > MAX_POST_TEXT_LENGTH) {
      throw new UwuzuError(`text must be <= ${MAX_POST_TEXT_LENGTH} characters`);
    }

    for (const [key, value] of Object.entries({ image1, image2, image3, image4 })) {
      if (value == null) continue;
      if (typeof value !== 'string') {
        throw new UwuzuError(`${key} must be a base64 string`);
      }
      if (value.length > MAX_IMAGE_B64_LENGTH) {
        throw new UwuzuError(`${key} is too large`);
      }
    }

    return this._request('ueuse/create', { text, nsfw, replyid, reuseid, image1, image2, image3, image4 });
  }

  deletePost(uniqid) {
    return this._request('ueuse/delete', { uniqid });
  }

  getBookmarks({ limit, page } = {}) {
    return this._request('ueuse/bookmark/', { limit, page }, { allowedErrorCodes: ['ueuse_not_found'] });
  }

  toggleFavorite(uniqid) {
    return this._request('favorite/change', { uniqid });
  }

  getFavorite(uniqid) {
    return this._request('favorite/get', { uniqid });
  }

  static _TIMELINE_KEYS = ['ueuse', 'posts', 'timeline', 'items'];
  static _BOOKMARK_KEYS = ['ueuse', 'posts', 'bookmarks', 'items'];
  static _NOTIF_KEYS    = ['notifications', 'items'];
  static _REPLIES_KEYS  = ['replies', 'ueuse', 'posts', 'items'];
  static _MENTIONS_KEYS = ['mentions', 'ueuse', 'posts', 'items'];
  static _SEARCH_KEYS   = ['results', 'ueuse', 'posts', 'items'];

  timelineAll({ signal, ...opts } = {}) {
    return this._paginate(
      ({ limit, page }) => this.getTimeline({ limit, page }),
      { ...opts, signal },
      UwuzuClient._TIMELINE_KEYS
    );
  }

  bookmarksAll({ signal, ...opts } = {}) {
    return this._paginate(
      ({ limit, page }) => this.getBookmarks({ limit, page }),
      { ...opts, signal },
      UwuzuClient._BOOKMARK_KEYS
    );
  }

  notificationsAll({ signal, ...opts } = {}) {
    return this._paginate(
      ({ limit, page }) => this.getNotifications({ limit, page }),
      { ...opts, signal },
      UwuzuClient._NOTIF_KEYS
    );
  }

  repliesAll(uniqid, { signal, ...opts } = {}) {
    return this._paginate(
      ({ limit, page }) => this.getReplies(uniqid, { limit, page }),
      { ...opts, signal },
      UwuzuClient._REPLIES_KEYS
    );
  }

  mentionsAll({ signal, ...opts } = {}) {
    return this._paginate(
      ({ limit, page }) => this.getMentions({ limit, page }),
      { ...opts, signal },
      UwuzuClient._MENTIONS_KEYS
    );
  }

  searchAll(keyword, { signal, ...opts } = {}) {
    return this._paginate(
      ({ limit, page }) => this.searchPosts(keyword, { limit, page }),
      { ...opts, signal },
      UwuzuClient._SEARCH_KEYS
    );
  }

  adminGetUser(userid) {
    return this._request('admin/users/', { userid });
  }

  adminSanction({ userid, type, notification_title, notification_message, really }) {
    return this._request('admin/users/sanction', {
      userid, type, notification_title, notification_message, really,
    });
  }

  adminGetReports({ limit, page } = {}) {
    return this._request('admin/reports/', { limit, page });
  }

  adminResolveReport({ reported_userid, uniqid } = {}) {
    if (!reported_userid && !uniqid) {
      throw new UwuzuError('reported_userid or uniqid is required');
    }
    return this._request('admin/reports/resolve', { reported_userid, uniqid });
  }
}
