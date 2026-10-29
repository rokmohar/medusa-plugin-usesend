import { UseSend } from 'usesend-js'
import { render } from '@react-email/render'
import { MedusaError } from '@medusajs/framework/utils'
import {
  INotificationProvider,
  ProviderSendNotificationDTO,
  ProviderSendNotificationResultsDTO,
} from '@medusajs/framework/types'
import {
  EnvironmentConfig,
  RetryConfig,
  UseSendEmailAttachment,
  UseSendEmailOptions,
  UseSendEmailTemplate,
} from '../types'
import { TemplateRepository } from '../templates/template-repository'
import { RateLimiter } from '../utils/rate-limiter'
import { RetryStrategy } from '../utils/retry-strategy'
import { isRecord, readString } from '../utils/type-guards'

type SendEmailPayload = Parameters<UseSend['emails']['send']>[0]
type SendEmailError = NonNullable<Awaited<ReturnType<UseSend['emails']['send']>>['error']>

const ENVIRONMENTS = ['development', 'staging', 'production'] as const satisfies readonly (keyof EnvironmentConfig)[]
type EnvironmentName = (typeof ENVIRONMENTS)[number]

const BACKOFF_STRATEGIES = ['linear', 'exponential'] as const satisfies readonly NonNullable<RetryConfig['backoff']>[]

const isBackoffStrategy = (value: unknown) => BACKOFF_STRATEGIES.some((strategy) => strategy === value)

const isEnvironmentName = (value: string): value is EnvironmentName => ENVIRONMENTS.some((name) => name === value)

const isAttachment = (value: unknown): value is UseSendEmailAttachment =>
  isRecord(value) && readString(value, 'filename') !== undefined && readString(value, 'content') !== undefined

const toAttachments = (value: unknown): UseSendEmailAttachment[] =>
  Array.isArray(value) ? value.filter(isAttachment) : []

const formatSendError = (error: SendEmailError): string => {
  const source: unknown = error

  if (!isRecord(source)) {
    return String(source)
  }

  const detail = isRecord(source.error) ? source.error : source
  const message = readString(detail, 'message')
  const code = readString(detail, 'code')

  if (!message) {
    return code ?? JSON.stringify(error)
  }

  return code ? `${message} (${code})` : message
}

export class UseSendService implements INotificationProvider {
  private client: UseSend
  private options: UseSendEmailOptions
  private templateRepository: TemplateRepository
  private rateLimiter: RateLimiter
  private retryStrategy: RetryStrategy

  constructor(_: any, options: Record<any, any>) {
    const validOptions = this.toPluginOptions(options)
    this.client = new UseSend(validOptions.api_key, validOptions?.url)
    this.options = this.applyEnvironmentConfig(validOptions)
    this.templateRepository = TemplateRepository.getInstance()
    this.rateLimiter = new RateLimiter(this.options.rateLimit?.maxPerMinute)
    this.retryStrategy = new RetryStrategy({
      maxAttempts: this.options.retry?.maxAttempts ?? 3,
      delay: this.options.retry?.delay ?? 1000,
      backoff: this.options.retry?.backoff ?? 'exponential',
    })
  }

  async send(notification: ProviderSendNotificationDTO): Promise<ProviderSendNotificationResultsDTO> {
    const template = this.templateRepository.getTemplate(notification.template)

    if (!template) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Couldn't find an email template for ${notification.template}`,
      )
    }

    const emailOptions: SendEmailPayload = {
      from: notification.from ?? this.options.from,
      to: [notification.to],
      subject: notification.content?.subject ?? template.subject,
    }

    if (template.content.react) {
      emailOptions.html = await this.renderTemplate(notification.template, template.content.react, notification.data)
    } else if (template.content.html) {
      emailOptions.html = template.content.html
    }

    // Medusa passes attachments as a top-level field. The legacy `data.attachments`
    // location is still supported for backwards compatibility.
    const attachments = toAttachments(notification.attachments ?? notification.data?.attachments)

    if (attachments.length > 0) {
      emailOptions.attachments = attachments.map(({ filename, content }) => ({ filename, content }))
    }

    return this.sendWithRetry(emailOptions)
  }

  hasTemplate(key: string) {
    return this.templateRepository.hasTemplate(key)
  }

  getTemplate(key: string) {
    return this.templateRepository.getTemplate(key)
  }

  addTemplate(key: string, template: UseSendEmailTemplate) {
    this.templateRepository.addTemplate(key, template)
  }

  removeTemplate(key: string) {
    this.templateRepository.removeTemplate(key)
  }

  setTemplates(templates: Record<string, UseSendEmailTemplate>) {
    this.templateRepository.setTemplates(templates)
  }

  addTemplates(templates: Record<string, UseSendEmailTemplate>) {
    this.templateRepository.addTemplates(templates)
  }

  mergeTemplates(templates: Record<string, UseSendEmailTemplate>) {
    this.templateRepository.mergeTemplates(templates)
  }

  removeTemplates(key: string[]) {
    this.templateRepository.removeTemplates(key)
  }

  static validateOptions(options: Record<any, any>) {
    const errors: string[] = []

    // Required fields validation
    if (!options.api_key) {
      errors.push('Option `api_key` is required in the useSend options')
    }
    if (!options.from) {
      errors.push('Option `from` is required in the useSend options')
    }

    // URL validation if provided
    if (options.url && !options.url.startsWith('http')) {
      errors.push('Option `url` must be a valid HTTP(S) URL')
    }

    // Rate limit validation
    if (options.rateLimit) {
      if (options.rateLimit.maxPerMinute !== undefined) {
        if (options.rateLimit.maxPerMinute < 1) {
          errors.push('Rate limit maxPerMinute must be greater than 0')
        }
        if (!Number.isInteger(options.rateLimit.maxPerMinute)) {
          errors.push('Rate limit maxPerMinute must be an integer')
        }
      }
    }

    // Retry configuration validation
    if (options.retry) {
      if (options.retry.maxAttempts !== undefined) {
        if (options.retry.maxAttempts < 1) {
          errors.push('Retry maxAttempts must be greater than 0')
        }
        if (!Number.isInteger(options.retry.maxAttempts)) {
          errors.push('Retry maxAttempts must be an integer')
        }
      }
      if (options.retry.delay !== undefined) {
        if (options.retry.delay < 0) {
          errors.push('Retry delay must be non-negative')
        }
        if (!Number.isInteger(options.retry.delay)) {
          errors.push('Retry delay must be an integer')
        }
      }
      if (options.retry.backoff !== undefined && !isBackoffStrategy(options.retry.backoff)) {
        errors.push(`Retry backoff must be one of: ${BACKOFF_STRATEGIES.join(', ')}`)
      }
    }

    // Environment configuration validation
    if (options.environment) {
      Object.keys(options.environment).forEach((env) => {
        if (!isEnvironmentName(env)) {
          errors.push(`Invalid environment "${env}". Must be one of: ${ENVIRONMENTS.join(', ')}`)
        }
      })
    }

    if (errors.length > 0) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, `Invalid useSend configuration:\n${errors.join('\n')}`)
    }
  }

  private applyEnvironmentConfig(options: UseSendEmailOptions): UseSendEmailOptions {
    const env = process.env.NODE_ENV || 'development'
    const envConfig = isEnvironmentName(env) ? options.environment?.[env] : undefined

    if (envConfig) {
      return {
        ...options,
        ...envConfig,
      }
    }

    return options
  }

  private async renderTemplate(
    name: string,
    component: NonNullable<UseSendEmailTemplate['content']['react']>,
    data: ProviderSendNotificationDTO['data'],
  ): Promise<string> {
    try {
      return await render(component(data))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      throw new MedusaError(MedusaError.Types.INVALID_DATA, `Failed to render email template "${name}": ${message}`)
    }
  }

  private async sendWithRetry(emailOptions: SendEmailPayload): Promise<ProviderSendNotificationResultsDTO> {
    return this.retryStrategy.execute(async () => {
      await this.rateLimiter.checkLimit()
      const { data, error } = await this.client.emails.send(emailOptions)

      if (error) {
        throw new MedusaError(MedusaError.Types.INVALID_DATA, `Failed to send email: ${formatSendError(error)}`)
      }
      if (!data) {
        throw new MedusaError(MedusaError.Types.INVALID_DATA, 'No data returned')
      }

      return { id: data.emailId }
    })
  }

  private toPluginOptions(options: Record<any, any>): UseSendEmailOptions {
    const isValid = (o: Record<any, any>): o is UseSendEmailOptions => {
      UseSendService.validateOptions(o)
      return true
    }
    if (isValid(options)) {
      return options
    }
    throw new MedusaError(MedusaError.Types.INVALID_DATA, 'Invalid options for the useSend plugin')
  }
}
