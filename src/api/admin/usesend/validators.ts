import { MedusaError } from '@medusajs/framework/utils'
import { z } from 'zod'

export const previewTemplateSchema = z.object({
  data: z.record(z.string(), z.unknown()).optional(),
  locale: z.string().min(1).optional(),
})

export const sendTestEmailSchema = previewTemplateSchema.extend({
  to: z.email(),
})

/**
 * Parses a request body, turning validation errors into a 400 response.
 */
export const parseBody = <T extends z.ZodType>(schema: T, body: unknown): z.infer<T> => {
  const result = schema.safeParse(body)

  if (!result.success) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, z.prettifyError(result.error))
  }

  return result.data
}
