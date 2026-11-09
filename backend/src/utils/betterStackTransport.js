const Transport = require('winston-transport');

/**
 * Winston transport that ships structured logs to Better Stack Telemetry
 * (cloud log management) over its HTTPS ingestion API.
 *
 * Logs are buffered and sent in small batches so a burst of requests does not
 * become a burst of outbound HTTP calls. Shipping is best-effort: if Better
 * Stack is unreachable the API keeps working and the failure is reported once
 * on stderr (never through winston itself, which would loop).
 */
class BetterStackTransport extends Transport {
  constructor(opts = {}) {
    super(opts);
    this.endpoint = `https://${opts.ingestingHost}`;
    this.sourceToken = opts.sourceToken;
    this.batchSize = opts.batchSize || 50;
    this.flushIntervalMs = opts.flushIntervalMs || 2000;
    this.fetchImpl = opts.fetchImpl || globalThis.fetch;
    this.buffer = [];
    this.lastErrorReportedAt = 0;

    this.timer = setInterval(() => {
      this.flush();
    }, this.flushIntervalMs);
    // Do not keep the process alive just to ship logs.
    if (typeof this.timer.unref === 'function') this.timer.unref();
  }

  log(info, callback) {
    setImmediate(() => this.emit('logged', info));

    const { timestamp, level, message, ...meta } = info;
    this.buffer.push({
      dt: timestamp || new Date().toISOString(),
      level,
      message,
      ...meta,
    });

    if (this.buffer.length >= this.batchSize) this.flush();
    callback();
  }

  async flush() {
    if (this.buffer.length === 0 || typeof this.fetchImpl !== 'function') return;
    const batch = this.buffer.splice(0, this.buffer.length);

    try {
      const res = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.sourceToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(batch),
      });
      if (!res.ok) this.reportFailure(`HTTP ${res.status}`);
    } catch (err) {
      this.reportFailure(err.message);
    }
  }

  reportFailure(reason) {
    const now = Date.now();
    // Rate-limit our own error output to once a minute.
    if (now - this.lastErrorReportedAt < 60000) return;
    this.lastErrorReportedAt = now;
    // eslint-disable-next-line no-console
    console.error(`[logger] Could not ship logs to Better Stack: ${reason}`);
  }

  close() {
    clearInterval(this.timer);
    return this.flush();
  }
}

module.exports = BetterStackTransport;
