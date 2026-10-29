import { WebhookVerificationError } from 'usesend-js'
import { z } from 'zod'
import type { UseSendService } from '../../../modules/usesend/services'
import type { UseSendWebhookEventData } from '../../../modules/usesend/types'

const eventSchema = z.looseObject({
  id: z.string(),
  type: z.string(),
  data: z.record(z.string(), z.unknown()),
})

const emailDataSchema = z.looseObject({
  id: z.string(),
  status: z.string().optional(),
  to: z.union([z.string(), z.array(z.string())]).optional(),
})

export interface WebhookDependencies {
  usesend: Pick<UseSendService, 'getStatus' | 'constructWebhookEvent'>
  findNotificationId: (emailId: string) => Promise<string | null>
  emit: (name: string, data: UseSendWebhookEventData) => Promise<unknown>
}

export interface WebhookResult {
  status: number
  body?: Record<string, unknown>
}

/**
 * Verifies a useSend webhook call and emits it as the Medusa event `usesend.<type>`, e.g. `usesend.email.bounced`.
 */
export const handleWebhook = async (
  { usesend, findNotificationId, emit }: WebhookDependencies,
  rawBody: string | Buffer,
  headers: Record<string, string | string[] | undefined>,
): Promise<WebhookResult> => {
  if (!usesend.getStatus().webhooks) {
    return { status: 404 }
  }

  let event: z.infer<typeof eventSchema>

  try {
    event = eventSchema.parse(usesend.constructWebhookEvent(rawBody, headers))
  } catch (error) {
    return {
      status: 400,
      body: {
        code: error instanceof WebhookVerificationError ? error.code : 'INVALID_EVENT',
        message: error instanceof Error ? error.message : String(error),
      },
    }
  }

  const email = event.type.startsWith('email.') ? emailDataSchema.safeParse(event.data) : undefined
  const emailData = email?.success ? email.data : undefined

  await emit(`usesend.${event.type}`, {
    call_id: event.id,
    type: event.type,
    email_id: emailData?.id ?? null,
    notification_id: emailData ? await findNotificationId(emailData.id) : null,
    to: emailData?.to === undefined ? [] : [emailData.to].flat(),
    status: emailData?.status ?? null,
    data: event.data,
  })

  return { status: 200, body: { received: true } }
}
