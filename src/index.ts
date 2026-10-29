import { join } from 'path'

export { UseSendService, providerDataSchema } from './modules/usesend/services'
export type { RenderedEmail, UseSendProviderData } from './modules/usesend/services'
export { USESEND_WEBHOOK_EVENTS } from './modules/usesend/types'
export type {
  UseSendContact,
  UseSendEmailAttachment,
  UseSendEmailOptions,
  UseSendEmailTemplate,
  UseSendWebhookEventData,
} from './modules/usesend/types'

const USESEND_PROVIDER_PATH = join(__dirname, 'providers', 'notification')

export { USESEND_PROVIDER_PATH }
