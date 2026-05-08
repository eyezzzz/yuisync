import { HttpError } from './http.js'

/**
 * In-memory sliding-window rate limiter.
 * For multi-process / multi-instance deployments, swap for Redis-backed limiter.
 */
export class RateLimiter {
  #windows = new Map()
  #maxRequests
  #windowMs
  #cleanupInterval

  constructor({ maxRequests = 30, windowMs = 60_000 } = {}) {
    this.#maxRequests = maxRequests
    this.#windowMs = windowMs

    // Purge stale entries every 2 minutes
    this.#cleanupInterval = setInterval(() => this.#cleanup(), 120_000)
    this.#cleanupInterval.unref()
  }

  /**
   * Check and consume a request slot for the given key.
   * Throws HttpError(429) if the limit is exceeded.
   */
  consume(key) {
    const now = Date.now()
    const cutoff = now - this.#windowMs

    let record = this.#windows.get(key)
    if (!record) {
      record = { timestamps: [] }
      this.#windows.set(key, record)
    }

    // Drop timestamps older than the window
    record.timestamps = record.timestamps.filter((ts) => ts > cutoff)

    if (record.timestamps.length >= this.#maxRequests) {
      const retryAfter = Math.ceil((record.timestamps[0] + this.#windowMs - now) / 1000)
      throw new HttpError(429, `Rate limit exceeded. Try again in ${retryAfter}s.`)
    }

    record.timestamps.push(now)
  }

  #cleanup() {
    const cutoff = Date.now() - this.#windowMs
    for (const [key, record] of this.#windows) {
      record.timestamps = record.timestamps.filter((ts) => ts > cutoff)
      if (record.timestamps.length === 0) {
        this.#windows.delete(key)
      }
    }
  }

  destroy() {
    clearInterval(this.#cleanupInterval)
    this.#windows.clear()
  }
}

// ── Pre-configured instances ─────────────────────────────────────────────────

/** General API: 60 req / 60s per IP */
export const apiLimiter = new RateLimiter({ maxRequests: 60, windowMs: 60_000 })

/** Chat / AI endpoints: 15 req / 60s per IP */
export const chatLimiter = new RateLimiter({ maxRequests: 15, windowMs: 60_000 })

/** Admin write endpoints: 10 req / 60s per IP */
export const adminWriteLimiter = new RateLimiter({ maxRequests: 10, windowMs: 60_000 })

/** Fiscal endpoints: 5 req / 60s per IP */
export const fiscalLimiter = new RateLimiter({ maxRequests: 5, windowMs: 60_000 })
