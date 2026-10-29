import { ModuleProvider, Modules } from '@medusajs/framework/utils'
import { UseSendNotificationService } from './services'

export * from './services'

export default ModuleProvider(Modules.NOTIFICATION, {
  services: [UseSendNotificationService],
})
