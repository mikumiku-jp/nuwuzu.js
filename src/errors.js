export class UwuzuError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'UwuzuError';
    this.status = status;
  }
}

export class UwuzuAuthError extends UwuzuError {
  constructor(message = 'authentication failed', code = 'unauthorized') {
    super(message, 401);
    this.name = 'UwuzuAuthError';
    this.code = code;
  }
}

export class UwuzuNotFoundError extends UwuzuError {
  constructor(message = 'resource not found') {
    super(message, 404);
    this.name = 'UwuzuNotFoundError';
    this.code = 'not_found';
  }
}

export class UwuzuAPIError extends UwuzuError {
  constructor({ message, status, endpoint, serverResponse, code }) {
    super(message, status);
    this.name = 'UwuzuAPIError';
    this.endpoint = endpoint;
    this.serverResponse = serverResponse;
    this.code = code ?? serverResponse?.error_code ?? null;
  }
}

export class UwuzuRateLimitError extends UwuzuAPIError {
  constructor({ message, status, endpoint, serverResponse, retryAfter }) {
    super({ message, status, endpoint, serverResponse, code: 'rate_limit' });
    this.name = 'UwuzuRateLimitError';
    this.retryAfter = retryAfter ?? null;
  }
}

export class UwuzuNetworkError extends UwuzuError {
  constructor(message, cause) {
    super(message);
    this.name = 'UwuzuNetworkError';
    this.cause = cause;
    this.code = 'network_error';
  }
}

export function isUwuzuError(err) {
  return err instanceof UwuzuError;
}
