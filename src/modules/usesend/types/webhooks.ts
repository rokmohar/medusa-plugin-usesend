/**
 * Names of the Medusa events emitted for useSend webhook calls. Every call is emitted as `usesend.<type>`, so
 * event types useSend adds later are emitted too.
 */
export const USESEND_WEBHOOK_EVENTS = {
  EMAIL_QUEUED: 'usesend.email.queued',
  EMAIL_SENT: 'usesend.email.sent',
  EMAIL_DELIVERED: 'usesend.email.delivered',
  EMAIL_DELIVERY_DELAYED: 'usesend.email.delivery_delayed',
  EMAIL_BOUNCED: 'usesend.email.bounced',
  EMAIL_REJECTED: 'usesend.email.rejected',
  EMAIL_RENDERING_FAILURE: 'usesend.email.rendering_failure',
  EMAIL_COMPLAINED: 'usesend.email.complained',
  EMAIL_FAILED: 'usesend.email.failed',
  EMAIL_CANCELLED: 'usesend.email.cancelled',
  EMAIL_SUPPRESSED: 'usesend.email.suppressed',
  EMAIL_OPENED: 'usesend.email.opened',
  EMAIL_CLICKED: 'usesend.email.clicked',
  CONTACT_CREATED: 'usesend.contact.created',
  CONTACT_UPDATED: 'usesend.contact.updated',
  CONTACT_DELETED: 'usesend.contact.deleted',
  DOMAIN_CREATED: 'usesend.domain.created',
  DOMAIN_VERIFIED: 'usesend.domain.verified',
  DOMAIN_UPDATED: 'usesend.domain.updated',
  DOMAIN_DELETED: 'usesend.domain.deleted',
  WEBHOOK_TEST: 'usesend.webhook.test',
} as const

/**
 * The data of a `usesend.*` event.
 */
export interface UseSendWebhookEventData {
  /**
   * Id of the webhook call. useSend can deliver a call more than once, so use it to skip duplicates.
   */
  call_id: string

  /**
   * useSend event type, e.g. `email.bounced`
   */
  type: string

  /**
   * useSend email id, for `email.*` events
   */
  email_id: string | null

  /**
   * Id of the Medusa notification that sent the email, when one matches the email id
   */
  notification_id: string | null

  /**
   * Recipients of the email, for `email.*` events
   */
  to: string[]

  /**
   * Email status in useSend, e.g. `BOUNCED`, for `email.*` events
   */
  status: string | null

  /**
   * The `data` object of the webhook call as useSend sent it
   */
  data: Record<string, unknown>
}
