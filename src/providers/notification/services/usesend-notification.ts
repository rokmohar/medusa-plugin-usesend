import { ProviderSendNotificationDTO, ProviderSendNotificationResultsDTO } from '@medusajs/framework/types'
import { AbstractNotificationProviderService } from '@medusajs/framework/utils'
import { UseSendService } from '../../../modules/usesend'

interface InjectedDependencies {
  usesend: UseSendService
}

export class UseSendNotificationService extends AbstractNotificationProviderService {
  static identifier = 'notification-usesend'

  private usesend: UseSendService

  constructor({ usesend }: InjectedDependencies) {
    super()
    this.usesend = usesend
  }

  async send(notification: ProviderSendNotificationDTO): Promise<ProviderSendNotificationResultsDTO> {
    return this.usesend.send(notification)
  }

  static validateOptions() {}
}
