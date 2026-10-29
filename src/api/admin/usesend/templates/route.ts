import type { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import type { UseSendService } from '../../../../modules/usesend/services'

/**
 * Lists the loaded email templates and the options that change how emails are sent.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const usesend = req.scope.resolve<UseSendService>('usesend')

  res.json({
    status: usesend.getStatus(),
    templates: usesend.listTemplates().map(({ name, template, locales }) => ({
      name,
      locales,
      subject: template.subject,
      version: template.version ?? null,
      description: template.metadata?.description ?? null,
      tags: template.metadata?.tags ?? [],
      preview_props: template.previewProps ?? null,
    })),
  })
}
