import type { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import type { UseSendService } from '../../../../../../modules/usesend/services'
import { parseBody, previewTemplateSchema } from '../../../validators'

/**
 * Renders a template with the given data, or its preview props, without sending it.
 */
export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const { data, locale } = parseBody(previewTemplateSchema, req.body)
  const usesend = req.scope.resolve<UseSendService>('usesend')

  res.json({ preview: await usesend.previewTemplate(req.params.name ?? '', data, locale) })
}
