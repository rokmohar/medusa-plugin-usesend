import { join } from 'path'

export { UseSendService } from './modules/usesend/services'
export type { UseSendEmailAttachment, UseSendEmailOptions, UseSendEmailTemplate } from './modules/usesend/types'

const USESEND_PROVIDER_PATH = join(__dirname, 'providers', 'notification')

export { USESEND_PROVIDER_PATH }
