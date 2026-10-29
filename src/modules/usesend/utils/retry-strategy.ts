import { toError } from './type-guards'

export interface RetryOptions {
  maxAttempts: number
  delay: number
  backoff?: 'linear' | 'exponential'
  /**
   * Decides whether a failed attempt is worth repeating. Every error is retried by default.
   */
  isRetryable?: (error: Error) => boolean
}

export class RetryStrategy {
  private readonly options: RetryOptions

  constructor(options: RetryOptions) {
    this.options = {
      maxAttempts: options.maxAttempts,
      delay: options.delay,
      backoff: options.backoff || 'linear',
      isRetryable: options.isRetryable,
    }
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= this.options.maxAttempts; attempt++) {
      try {
        return await operation()
      } catch (error) {
        lastError = toError(error)

        if (this.options.isRetryable && !this.options.isRetryable(lastError)) {
          break
        }

        if (attempt < this.options.maxAttempts) {
          const waitTime = this.calculateWaitTime(attempt)
          await new Promise((resolve) => setTimeout(resolve, waitTime))
        }
      }
    }

    throw lastError || new Error('Operation failed after all retry attempts')
  }

  private calculateWaitTime(attempt: number): number {
    if (this.options.backoff === 'exponential') {
      return this.options.delay * Math.pow(2, attempt - 1)
    }
    return this.options.delay * attempt
  }
}
