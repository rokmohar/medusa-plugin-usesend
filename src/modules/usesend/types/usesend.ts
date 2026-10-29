import { ReactElement } from 'react'

export interface RetryConfig {
  /**
   * Maximum number of retry attempts for failed email sends
   * @default 3
   */
  maxAttempts?: number

  /**
   * Base delay between retries in milliseconds
   * @default 1000
   */
  delay?: number

  /**
   * Retry backoff strategy
   * - linear: delay increases linearly with each attempt
   * - exponential: delay doubles with each attempt
   * @default 'exponential'
   */
  backoff?: 'linear' | 'exponential'
}

export interface RateLimitConfig {
  /**
   * Maximum number of emails that can be sent per minute
   * @default 60
   */
  maxPerMinute?: number
}

export interface EnvironmentConfig {
  /**
   * Development environment specific configuration
   */
  development?: Partial<UseSendEmailOptions>

  /**
   * Staging environment specific configuration
   */
  staging?: Partial<UseSendEmailOptions>

  /**
   * Production environment specific configuration
   */
  production?: Partial<UseSendEmailOptions>
}

export interface UseSendEmailOptions {
  /**
   * useSend API URL
   * @example 'https://app.usesend.com'
   */
  url?: string

  /**
   * useSend API key
   * @example 'sk_test_123456789'
   */
  api_key: string

  /**
   * Default sender email address
   * @example 'no-reply@example.com'
   */
  from: string

  /**
   * Custom template directory path
   * @default 'src/templates/emails'
   */
  templateDir?: string

  /**
   * Retry configuration for failed email sends
   */
  retry?: RetryConfig

  /**
   * Rate limiting configuration
   */
  rateLimit?: RateLimitConfig

  /**
   * Environment-specific configuration overrides
   */
  environment?: EnvironmentConfig
}

export interface TemplateMetadata {
  /**
   * Template version
   * @default '1.0.0'
   */
  version?: string

  /**
   * Template description
   */
  description?: string

  /**
   * Template tags for categorization
   */
  tags?: string[]

  /**
   * Template category
   */
  category?: string
}

export interface UseSendEmailAttachment {
  /**
   * Attachment filename including extension, e.g. 'invoice-PP1-R1-42.pdf'
   */
  filename: string

  /**
   * Base64-encoded file content
   */
  content: string
}

export interface UseSendEmailTemplate {
  /**
   * Email subject line
   */
  subject: string

  /**
   * Template version
   * @default '1.0.0'
   */
  version?: string

  /**
   * Template metadata
   */
  metadata?: TemplateMetadata

  /**
   * Template content
   */
  content: {
    /**
     * React component for template
     * Receives template data as props
     */
    react?: (...props: any[]) => ReactElement

    /**
     * HTML content for template
     * Can include template variables using {{variableName}} syntax
     */
    html?: string
  }
}
