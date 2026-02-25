const MAX_TIMEOUT_MS = 2_147_483_647;

function _sleep(ms) {
  return new Promise((r) => setTimeout(r, Math.min(ms, MAX_TIMEOUT_MS)));
}

export class RateLimiter {
  constructor({ interval, maxRequests }) {
    this._interval   = interval;
    this._maxReq     = maxRequests;
    this._timestamps = [];
    this._start      = 0;
    this._chain      = Promise.resolve();
  }

  get enabled() {
    return this._interval > 0 && this._maxReq > 0;
  }

  async _acquireSlot() {
    const { _interval: iv, _maxReq: max } = this;
    while (true) {
      const now = Date.now();
      while (
        this._start < this._timestamps.length &&
        now - this._timestamps[this._start] >= iv
      ) {
        this._start++;
      }

      const active = this._timestamps.length - this._start;
      if (active < max) {
        this._timestamps.push(now);
        if (this._start > 100) {
          this._timestamps = this._timestamps.slice(this._start);
          this._start = 0;
        }
        return;
      }

      const wait = iv - (now - this._timestamps[this._start]);
      await _sleep(Math.max(1, wait));
    }
  }

  enqueue(task) {
    const run = this._chain.then(async () => {
      await this._acquireSlot();
      return task();
    });
    this._chain = run.then(() => {}, () => {});
    return run;
  }
}
