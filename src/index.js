export { UwuzuClient } from './client.js';
export { UwuzuError, UwuzuAuthError, UwuzuNotFoundError, UwuzuAPIError, UwuzuRateLimitError, UwuzuNetworkError, isUwuzuError } from './errors.js';
import { UwuzuClient } from './client.js';

export const Scopes = Object.freeze({
  READ_ME:              'read:me',
  WRITE_ME:             'write:me',
  READ_UEUSE:           'read:ueuse',
  READ_USERS:           'read:users',
  WRITE_UEUSE:          'write:ueuse',
  WRITE_FOLLOW:         'write:follow',
  WRITE_FAVORITE:       'write:favorite',
  READ_NOTIFICATIONS:   'read:notifications',
  WRITE_NOTIFICATIONS:  'write:notifications',
  WRITE_BOOKMARK:       'write:bookmark',
  READ_BOOKMARK:        'read:bookmark',
  ADMIN_READ_USERS:     'read:admin:users',
  ADMIN_WRITE_SANCTION: 'write:admin:user-sanction',
  ADMIN_READ_REPORTS:   'read:admin:reports',
  ADMIN_WRITE_REPORTS:  'write:admin:reports',
});

export function createClient(domain = 'uwuzu.net', token, opts = {}) {
  return new UwuzuClient({ domain, token, ...opts });
}

export async function collect(gen) {
  const result = [];
  for await (const item of gen) result.push(item);
  return result;
}
