import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { ContainerRegistrationKeys, Modules } from '@medusajs/framework/utils'
import type { UseSendService } from '../../../modules/usesend/services'
import { handleWebhook } from './handle-webhook'

/**
 * Receives useSend webhook calls. See `handleWebhook`.
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const eventBus = req.scope.resolve(Modules.EVENT_BUS)

  const result = await handleWebhook(
    {
      usesend: req.scope.resolve<UseSendService>('usesend'),
      findNotificationId: async (emailId) => {
        const {
          data: [notification],
        } = await query.graph({
          entity: 'notification',
          fields: ['id'],
          filters: { external_id: emailId },
          pagination: { take: 1 },
        })

        return notification?.id ?? null
      },
      emit: async (name, data) => {
        return eventBus.emit({ name, data })
      },
    },
    req.rawBody,
    req.headers,
  )

  if (result.body) {
    res.status(result.status).json(result.body)
  } else {
    res.sendStatus(result.status)
  }
}
