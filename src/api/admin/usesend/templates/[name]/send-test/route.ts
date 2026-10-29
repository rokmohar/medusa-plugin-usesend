import type { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { MedusaError, Modules } from '@medusajs/framework/utils'
import type { UseSendService } from '../../../../../../modules/usesend/services'
import { parseBody, sendTestEmailSchema } from '../../../validators'

/**
 * Sends a template to one address through Medusa's notification module, so it shows up in the notification
 * log and follows the `dryRun` and `redirectTo` options.
 */
export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const { to, data, locale } = parseBody(sendTestEmailSchema, req.body)
  const name = req.params.name ?? ''
  const usesend = req.scope.resolve<UseSendService>('usesend')
  const template = usesend.getTemplate(name, locale)

  if (!template) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Couldn't find an email template for ${name}`)
  }

  const notification = await req.scope.resolve(Modules.NOTIFICATION).createNotifications({
    to,
    channel: 'email',
    template: name,
    data: data ?? template.previewProps ?? {},
    ...(locale ? { provider_data: { locale } } : {}),
  })

  res.json({
    notification: {
      id: notification.id,
      status: notification.status,
      external_id: notification.external_id ?? null,
    },
  })
}
