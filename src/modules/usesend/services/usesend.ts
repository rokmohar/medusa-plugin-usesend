import { randomUUID } from 'crypto'
import { UseSend } from 'usesend-js'
import { render, toPlainText } from '@react-email/render'
import { z } from 'zod'
import { MedusaError } from '@medusajs/framework/utils'
import {
  INotificationProvider,
  Logger,
  ProviderSendNotificationDTO,
  ProviderSendNotificationResultsDTO,
} from '@medusajs/framework/types'
import {
  EnvironmentConfig,
  RetryConfig,
  UseSendContact,
  UseSendEmailAttachment,
  UseSendEmailOptions,
  UseSendEmailTemplate,
} from '../types'
import { localeCandidates, TemplateRepository } from '../templates/template-repository'
import { RateLimiter } from '../utils/rate-limiter'
import { RetryStrategy } from '../utils/retry-strategy'
import { isRecord, readString } from '../utils/type-guards'

type SendEmailPayload = Parameters<UseSend['emails']['send']>[0]

const ENVIRONMENTS = ['development', 'staging', 'production'] as const satisfies readonly (keyof EnvironmentConfig)[]
type EnvironmentName = (typeof ENVIRONMENTS)[number]

const BACKOFF_STRATEGIES = ['linear', 'exponential'] as const satisfies readonly NonNullable<RetryConfig['backoff']>[]

/**
 * useSend API error codes worth retrying. Anything else, such as an invalid recipient, fails the same way again.
 */
const RETRYABLE_CODES = ['INTERNAL_SERVER_ERROR', 'RATE_LIMITED']

const isBackoffStrategy = (value: unknown) => BACKOFF_STRATEGIES.some((strategy) => strategy === value)

const isEnvironmentName = (value: string): value is EnvironmentName => ENVIRONMENTS.some((name) => name === value)

const isAttachment = (value: unknown): value is UseSendEmailAttachment =>
  isRecord(value) && readString(value, 'filename') !== undefined && readString(value, 'content') !== undefined

const toAttachments = (value: unknown): UseSendEmailAttachment[] =>
  Array.isArray(value) ? value.filter(isAttachment) : []

/**
 * Network errors and the retryable useSend codes are retried. Errors this plugin raises itself are not.
 */
const isRetryable = (error: Error) =>
  !(error instanceof MedusaError) || RETRYABLE_CODES.some((code) => code === error.code)

const describeApiError = (error: unknown): { message: string; code?: string } => {
  if (!isRecord(error)) {
    return { message: String(error) }
  }

  const detail = isRecord(error.error) ? error.error : error
  const message = readString(detail, 'message')
  const code = readString(detail, 'code')

  if (!message) {
    return { message: code ?? JSON.stringify(error), code }
  }

  return { message: code ? `${message} (${code})` : message, code }
}

const toApiError = (action: string, error: unknown) => {
  const { message, code } = describeApiError(error)

  return new MedusaError(MedusaError.Types.INVALID_DATA, `Failed to ${action}: ${message}`, code)
}

const recipientsSchema = z.union([z.string().min(1), z.array(z.string().min(1)).min(1)])

/**
 * Per-email options, passed in the `provider_data` field of `createNotifications`.
 */
export const providerDataSchema = z.object({
  replyTo: recipientsSchema.optional(),
  cc: recipientsSchema.optional(),
  bcc: recipientsSchema.optional(),
  headers: z.record(z.string(), z.string()).optional(),
  scheduledAt: z.iso.datetime({ offset: true }).optional(),
  templateId: z.string().min(1).optional(),
  variables: z.record(z.string(), z.string()).optional(),
  locale: z.string().min(1).optional(),
})

export type UseSendProviderData = z.infer<typeof providerDataSchema>

export interface RenderedEmail {
  subject: string
  html?: string
  text?: string
}

type InjectedDependencies = {
  logger: Pick<Logger, 'info' | 'warn'>
}

export class UseSendService implements INotificationProvider {
  private client: UseSend
  private options: UseSendEmailOptions
  private logger: Pick<Logger, 'info' | 'warn'>
  private templateRepository: TemplateRepository
  private rateLimiter: RateLimiter
  private retryStrategy: RetryStrategy

  constructor({ logger }: InjectedDependencies, options: Record<any, any>) {
    const validOptions = this.toPluginOptions(options)
    this.client = new UseSend(validOptions.api_key, validOptions?.url)
    this.options = this.applyEnvironmentConfig(validOptions)
    this.logger = logger
    this.templateRepository = TemplateRepository.getInstance()
    this.rateLimiter = new RateLimiter(this.options.rateLimit?.maxPerMinute)
    this.retryStrategy = new RetryStrategy({
      maxAttempts: this.options.retry?.maxAttempts ?? 3,
      delay: this.options.retry?.delay ?? 1000,
      backoff: this.options.retry?.backoff ?? 'exponential',
      isRetryable,
    })
  }

  async send(notification: ProviderSendNotificationDTO): Promise<ProviderSendNotificationResultsDTO> {
    const providerData = this.parseProviderData(notification.provider_data)
    const payload = await this.buildPayload(notification, providerData)
    const notificationId = isRecord(notification) ? readString(notification, 'id') : undefined

    if (this.options.redirectTo) {
      this.redirect(payload, this.options.redirectTo)
    }

    if (this.options.dryRun) {
      this.logger.info(
        `[usesend] Dry run, not sending "${payload.subject ?? payload.templateId}" to ${String(payload.to)} (template "${notification.template}")`,
      )

      return { id: `dry-run-${randomUUID()}` }
    }

    return this.sendWithRetry(payload, notificationId)
  }

  hasTemplate(key: string) {
    return this.templateRepository.hasTemplate(key)
  }

  /**
   * Returns a template, picking the variant of `locale` (or the `defaultLocale` option) when one exists.
   */
  getTemplate(key: string, locale?: string) {
    return this.templateRepository.getTemplate(key, [
      ...localeCandidates(locale),
      ...localeCandidates(this.options.defaultLocale),
    ])
  }

  addTemplate(key: string, template: UseSendEmailTemplate, locale?: string) {
    this.logWarnings(key, this.templateRepository.addTemplate(key, template, locale))
  }

  removeTemplate(key: string) {
    this.templateRepository.removeTemplate(key)
  }

  setTemplates(templates: Record<string, UseSendEmailTemplate>) {
    this.templateRepository.setTemplates(templates)
  }

  addTemplates(templates: Record<string, UseSendEmailTemplate>) {
    this.logWarnings('templates', this.templateRepository.addTemplates(templates))
  }

  mergeTemplates(templates: Record<string, UseSendEmailTemplate>) {
    this.templateRepository.mergeTemplates(templates)
  }

  removeTemplates(key: string[]) {
    this.templateRepository.removeTemplates(key)
  }

  listTemplates() {
    return this.templateRepository.listTemplates()
  }

  /**
   * Renders a template with the given data, or its preview props, without sending it.
   */
  async previewTemplate(name: string, data?: Record<string, unknown>, locale?: string): Promise<RenderedEmail> {
    const template = this.getTemplate(name, locale)

    if (!template) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, `Couldn't find an email template for ${name}`)
    }

    return {
      subject: template.subject,
      ...(await this.renderContent(name, template, data ?? template.previewProps ?? {})),
    }
  }

  /**
   * The options that change how emails are sent, for display in the admin.
   */
  getStatus() {
    return {
      dryRun: this.options.dryRun ?? false,
      redirectTo: this.options.redirectTo ?? null,
      defaultLocale: this.options.defaultLocale ?? null,
      webhooks: !!this.options.webhook_secret,
      contactBookId: this.options.contacts?.contactBookId ?? null,
    }
  }

  /**
   * Verifies a useSend webhook call and returns its event. Throws when webhooks aren't configured or the
   * signature doesn't match.
   */
  constructWebhookEvent(body: string | Buffer, headers: Record<string, string | string[] | undefined>): unknown {
    if (!this.options.webhook_secret) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, 'useSend webhooks are not configured')
    }

    return this.client.webhooks(this.options.webhook_secret).constructEvent(body, { headers })
  }

  /**
   * Adds a contact to a contact book, or updates the contact with the same email.
   */
  async upsertContact(contact: UseSendContact, contactBookId?: string): Promise<{ id: string }> {
    const bookId = this.resolveContactBook(contactBookId)
    // useSend matches contacts by email and ignores the contact id in the path, so the email fills it.
    const { data, error } = await this.client.contacts.upsert(bookId, contact.email, contact)

    if (error) {
      throw toApiError('save contact', error)
    }

    if (!data) {
      throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, 'No data returned')
    }

    return { id: data.contactId }
  }

  /**
   * Removes a contact from a contact book.
   */
  async removeContact(contactId: string, contactBookId?: string): Promise<void> {
    const { error } = await this.client.contacts.delete(this.resolveContactBook(contactBookId), contactId)

    if (error) {
      throw toApiError('remove contact', error)
    }
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

    // Delivery options validation
    if (options.dryRun !== undefined && typeof options.dryRun !== 'boolean') {
      errors.push('Option `dryRun` must be a boolean')
    }
    if (options.redirectTo !== undefined && (typeof options.redirectTo !== 'string' || !options.redirectTo)) {
      errors.push('Option `redirectTo` must be an email address')
    }
    if (options.defaultLocale !== undefined && (typeof options.defaultLocale !== 'string' || !options.defaultLocale)) {
      errors.push('Option `defaultLocale` must be a locale, e.g. "en"')
    }
    if (options.webhook_secret !== undefined && typeof options.webhook_secret !== 'string') {
      errors.push('Option `webhook_secret` must be a string')
    }
    if (options.contacts?.contactBookId !== undefined && typeof options.contacts.contactBookId !== 'string') {
      errors.push('Option `contacts.contactBookId` must be a string')
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

  private parseProviderData(value: unknown): UseSendProviderData {
    const result = providerDataSchema.safeParse(value ?? {})

    if (!result.success) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Invalid useSend provider_data:\n${z.prettifyError(result.error)}`,
      )
    }

    return result.data
  }

  /**
   * Builds the email from, in this order, a useSend dashboard template, a local template, or the notification's
   * own content. The notification's content overrides what the template renders.
   */
  private async buildPayload(
    notification: ProviderSendNotificationDTO,
    providerData: UseSendProviderData,
  ): Promise<SendEmailPayload> {
    const { templateId, variables, locale, ...extras } = providerData
    const content = notification.content
    // Medusa passes attachments as a top-level field. The legacy `data.attachments`
    // location is still supported for backwards compatibility.
    const attachments = toAttachments(notification.attachments ?? notification.data?.attachments)
    const payload: SendEmailPayload = {
      from: notification.from ?? this.options.from,
      to: [notification.to],
      ...extras,
      ...(attachments.length > 0
        ? { attachments: attachments.map(({ filename, content }) => ({ filename, content })) }
        : {}),
    }

    if (templateId) {
      return {
        ...payload,
        templateId,
        ...(variables ? { variables } : {}),
        ...(content?.subject ? { subject: content.subject } : {}),
      }
    }

    const dataLocale = isRecord(notification.data) ? readString(notification.data, 'locale') : undefined
    const template = this.getTemplate(notification.template, locale ?? dataLocale)

    if (!template && !content?.html && !content?.text) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Couldn't find an email template for ${notification.template}`,
      )
    }

    const subject = content?.subject ?? template?.subject

    if (!subject) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Email "${notification.template}" has no template, so it needs a subject in its content`,
      )
    }

    const rendered =
      template && !content?.html ? await this.renderContent(notification.template, template, notification.data) : {}
    const html = content?.html ?? rendered.html
    const text = content?.text ?? rendered.text ?? (html ? toPlainText(html) : undefined)

    return {
      ...payload,
      subject,
      ...(html ? { html } : {}),
      ...(text ? { text } : {}),
    }
  }

  private async renderContent(
    name: string,
    template: UseSendEmailTemplate,
    data: ProviderSendNotificationDTO['data'],
  ): Promise<{ html?: string; text?: string }> {
    const component = template.content.react

    if (!component) {
      const html = template.content.html

      return html ? { html, text: toPlainText(html) } : {}
    }

    try {
      const html = await render(component(data ?? {}))

      return { html, text: toPlainText(html) }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      throw new MedusaError(MedusaError.Types.INVALID_DATA, `Failed to render email template "${name}": ${message}`)
    }
  }

  /**
   * Sends the email to `address` instead, keeping the original recipients in a header.
   */
  private redirect(payload: SendEmailPayload, address: string) {
    const original = [payload.to, payload.cc, payload.bcc].flat().filter((value) => typeof value === 'string')

    this.logger.info(
      `[usesend] Redirecting "${payload.subject ?? payload.templateId}" from ${original.join(', ')} to ${address}`,
    )

    payload.to = [address]
    delete payload.cc
    delete payload.bcc
    payload.headers = { ...payload.headers, 'X-Original-To': original.join(', ') }
  }

  private async sendWithRetry(
    emailOptions: SendEmailPayload,
    idempotencyKey: string | undefined,
  ): Promise<ProviderSendNotificationResultsDTO> {
    return this.retryStrategy.execute(async () => {
      await this.rateLimiter.checkLimit()
      // The notification id as idempotency key makes a retry after a lost response return the first email.
      const { data, error } = await this.client.emails.send(
        emailOptions,
        idempotencyKey ? { idempotencyKey } : undefined,
      )

      if (error) {
        throw toApiError('send email', error)
      }
      if (!data) {
        throw new MedusaError(MedusaError.Types.INVALID_DATA, 'No data returned')
      }

      return { id: data.emailId }
    })
  }

  private resolveContactBook(contactBookId: string | undefined): string {
    const bookId = contactBookId ?? this.options.contacts?.contactBookId

    if (!bookId) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        'No contact book id given, and the `contacts.contactBookId` option is not set',
      )
    }

    return bookId
  }

  private logWarnings(key: string, warnings: string[]) {
    if (warnings.length > 0) {
      this.logger.warn(`[usesend] Template warnings for "${key}": ${warnings.join(', ')}`)
    }
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
