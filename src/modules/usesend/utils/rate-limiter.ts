export class RateLimiter {
  private count: number = 0
  private lastResetTime: number = Date.now()
  private readonly maxPerMinute: number
  private readonly windowMs: number = 60000 // 1 minute in milliseconds

  constructor(maxPerMinute: number = 60) {
    this.maxPerMinute = maxPerMinute
  }

  async checkLimit(): Promise<void> {
    const now = Date.now()

    // Reset counter if window has passed
    if (now - this.lastResetTime >= this.windowMs) {
      this.count = 0
      this.lastResetTime = now
    }

    // If limit reached, wait until window resets
    if (this.count >= this.maxPerMinute) {
      const waitTime = this.windowMs - (now - this.lastResetTime)
      await new Promise((resolve) => setTimeout(resolve, waitTime))
      this.count = 0
      this.lastResetTime = Date.now()
    }

    this.count++
  }

  reset(): void {
    this.count = 0
    this.lastResetTime = Date.now()
  }

  getCurrentCount(): number {
    return this.count
  }

  getTimeUntilReset(): number {
    const now = Date.now()
    return Math.max(0, this.windowMs - (now - this.lastResetTime))
  }
}
