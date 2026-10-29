import { LoaderOptions, Logger } from '@medusajs/framework/types'
import { z } from 'zod'
import { UseSendEmailOptions, UseSendEmailTemplate } from '../types'
import { UseSendService } from '../services'
import { TemplateRepository } from '../templates/template-repository'
import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import { toKebabCase } from '../utils'
import { isRecord } from '../utils/type-guards'

/**
 * `OrderPlaced.tsx` is the template `order-placed`, `OrderPlaced.sl.tsx` its Slovenian variant.
 */
const TEMPLATE_FILE = /^(?<name>[^.]+?)(?:\.(?<locale>[a-z]{2,3}(?:[-_][a-z0-9]{2,8})?))?\.(?:tsx|js)$/i

const metadataSchema = z
  .object({
    version: z.string(),
    subject: z.string(),
    description: z.string(),
    tags: z.array(z.string()),
    category: z.string(),
    previewProps: z.record(z.string(), z.unknown()),
  })
  .partial()

type TemplateMetadata = z.infer<typeof metadataSchema>

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

const readMetadata = async (path: string, logger: Pick<Logger, 'warn'>): Promise<TemplateMetadata> => {
  let content: string

  try {
    content = await readFile(path, 'utf-8')
  } catch {
    return {}
  }

  try {
    const result = metadataSchema.safeParse(JSON.parse(content))

    if (result.success) {
      return result.data
    }

    logger.warn(`[usesend] Ignoring invalid metadata file ${path}:\n${z.prettifyError(result.error)}`)
  } catch (error) {
    logger.warn(`[usesend] Ignoring invalid JSON in metadata file ${path}: ${errorMessage(error)}`)
  }

  return {}
}

const loadTemplate = async (
  templatesDir: string,
  file: string,
  logger: Pick<Logger, 'warn'>,
): Promise<{ name: string; locale?: string; template: UseSendEmailTemplate } | undefined> => {
  const match = TEMPLATE_FILE.exec(file)

  if (!match?.groups?.name) {
    logger.warn(
      `[usesend] Skipping email template file "${file}": expected a name like OrderPlaced.tsx or OrderPlaced.sl.tsx`,
    )
    return undefined
  }

  const { name: fileName, locale } = match.groups
  const name = toKebabCase(fileName)
  const baseMetadata = await readMetadata(join(templatesDir, `${fileName}.json`), logger)
  const metadata = locale
    ? { ...baseMetadata, ...(await readMetadata(join(templatesDir, `${fileName}.${locale}.json`), logger)) }
    : baseMetadata

  // `module.require` keeps CommonJS semantics, which is what allows the consuming Medusa app to load `.tsx`
  // templates through its ts-node hook in development, and compiled `.js` templates in production.
  const imported = module.require(join(templatesDir, file))
  const Component = imported.default ?? imported

  if (typeof Component !== 'function') {
    throw new Error('the default export is not a React component')
  }

  return {
    name,
    locale,
    template: {
      subject: metadata.subject || Component.Subject || name,
      version: metadata.version || '1.0.0',
      metadata: {
        description: metadata.description,
        tags: metadata.tags,
        category: metadata.category,
      },
      previewProps: isRecord(Component.PreviewProps) ? Component.PreviewProps : metadata.previewProps,
      content: {
        react: Component,
      },
    },
  }
}

type TemplateLogger = Pick<Logger, 'info' | 'warn' | 'error'>

/**
 * Loads every template in a folder into the repository. Each file loads on its own, so one broken template
 * doesn't keep the others from loading. Returns how many loaded and failed.
 */
export const loadTemplates = async (
  templatesDir: string,
  logger: TemplateLogger,
  repository: TemplateRepository = TemplateRepository.getInstance(),
): Promise<{ loaded: number; failed: number }> => {
  let files: string[]

  try {
    files = await readdir(templatesDir)
  } catch (error) {
    logger.warn(`[usesend] Couldn't read the email template folder ${templatesDir}: ${errorMessage(error)}`)
    return { loaded: 0, failed: 0 }
  }

  const templateFiles = files.filter((file) => file.endsWith('.tsx') || file.endsWith('.js'))
  let loaded = 0
  let failed = 0

  for (const file of templateFiles) {
    try {
      const result = await loadTemplate(templatesDir, file, logger)

      if (!result) {
        continue
      }

      const warnings = repository.addTemplate(result.name, result.template, result.locale)

      if (warnings.length > 0) {
        logger.warn(`[usesend] Template warnings for "${file}": ${warnings.join(', ')}`)
      }

      loaded++
    } catch (error) {
      failed++
      logger.error(`[usesend] Failed to load email template "${file}": ${errorMessage(error)}`)
    }
  }

  logger.info(
    `[usesend] Loaded ${loaded} email template${loaded === 1 ? '' : 's'}${failed > 0 ? `, ${failed} failed` : ''}`,
  )

  return { loaded, failed }
}

export default async ({ container, options }: LoaderOptions<UseSendEmailOptions>): Promise<void> => {
  if (!options) {
    throw new Error('Missing useSend configuration')
  }

  UseSendService.validateOptions(options)

  await loadTemplates(
    options.templateDir || join(process.cwd(), 'src', 'templates', 'emails'),
    container.resolve<Logger>('logger'),
  )
}
