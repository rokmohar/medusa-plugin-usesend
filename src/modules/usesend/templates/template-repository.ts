import { MedusaError } from '@medusajs/framework/utils'
import { UseSendEmailTemplate } from '../types'
import {
  TemplateValidator,
  RequiredFieldsRule,
  ReactPropsRule,
  HtmlValidationRule,
  MetadataValidationRule,
} from './template-validator'

interface TemplateEntry {
  base?: UseSendEmailTemplate
  locales: Record<string, UseSendEmailTemplate>
}

export interface TemplateSummary {
  name: string
  template: UseSendEmailTemplate
  locales: string[]
}

/**
 * Normalizes a locale for lookups: lowercase, with `-` as the separator, e.g. `sl_SI` → `sl-si`.
 */
export const normalizeLocale = (locale: string) => locale.trim().toLowerCase().replace(/_/g, '-')

/**
 * The locales to try for a requested locale, most specific first: `sl-SI` → `sl-si`, `sl`.
 */
export const localeCandidates = (locale: string | undefined): string[] => {
  if (!locale) {
    return []
  }

  const normalized = normalizeLocale(locale)
  const language = normalized.split('-')[0]

  return language && language !== normalized ? [normalized, language] : [normalized]
}

export class TemplateRepository {
  private static instance: TemplateRepository
  private templates: Record<string, TemplateEntry> = {}
  private validator: TemplateValidator

  private constructor() {
    // Initialize validator with built-in rules
    this.validator = new TemplateValidator([
      new RequiredFieldsRule(),
      new ReactPropsRule(),
      new HtmlValidationRule(),
      new MetadataValidationRule(),
    ])
  }

  public static getInstance(): TemplateRepository {
    if (!TemplateRepository.instance) {
      TemplateRepository.instance = new TemplateRepository()
    }
    return TemplateRepository.instance
  }

  public hasTemplate(key: string): boolean {
    const entry = this.templates[key]

    return !!entry && (!!entry.base || Object.keys(entry.locales).length > 0)
  }

  /**
   * Returns the variant of the first locale that has one, falling back to the template without a locale.
   */
  public getTemplate(key: string, locales: string[] = []): UseSendEmailTemplate | undefined {
    const entry = this.templates[key]

    if (!entry) {
      return undefined
    }

    for (const locale of locales) {
      const template = entry.locales[normalizeLocale(locale)]

      if (template) {
        return template
      }
    }

    return entry.base
  }

  /**
   * Validates and adds a template, optionally as the variant of a locale. Returns the validation warnings.
   */
  public addTemplate(key: string, template: UseSendEmailTemplate, locale?: string): string[] {
    const entry = this.templates[key] ?? { locales: {} }
    const normalizedLocale = locale ? normalizeLocale(locale) : undefined
    const label = normalizedLocale ? `"${key}" (${normalizedLocale})` : `"${key}"`

    if (normalizedLocale ? entry.locales[normalizedLocale] : entry.base) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, `Template ${label} already exists`)
    }

    const validationResult = this.validator.validate(template)

    if (!validationResult.isValid) {
      const errorMessages = validationResult.errors
        .map((error) => `${error.path.join('.')}: ${error.message}`)
        .join(', ')
      throw new MedusaError(MedusaError.Types.INVALID_DATA, `Invalid template ${label}: ${errorMessages}`)
    }

    if (normalizedLocale) {
      entry.locales[normalizedLocale] = template
    } else {
      entry.base = template
    }

    this.templates[key] = entry

    return validationResult.warnings.map((warning) => `${warning.path.join('.')}: ${warning.message}`)
  }

  public removeTemplate(key: string): void {
    delete this.templates[key]
  }

  public setTemplates(templates: Record<string, UseSendEmailTemplate>): void {
    this.templates = Object.fromEntries(
      Object.entries(templates).map(([key, template]) => [key, { base: template, locales: {} }]),
    )
  }

  public addTemplates(templates: Record<string, UseSendEmailTemplate>): string[] {
    return Object.entries(templates).flatMap(([key, template]) => this.addTemplate(key, template))
  }

  public mergeTemplates(templates: Record<string, UseSendEmailTemplate>): void {
    Object.entries(templates).forEach(([key, template]) => {
      this.templates[key] = { base: template, locales: this.templates[key]?.locales ?? {} }
    })
  }

  public removeTemplates(keys: string[]): void {
    keys.forEach((key) => {
      this.removeTemplate(key)
    })
  }

  /**
   * Returns the templates without a locale. `listTemplates` also includes templates that only exist per locale.
   */
  public getAllTemplates(): Record<string, UseSendEmailTemplate> {
    return Object.fromEntries(
      Object.entries(this.templates).flatMap(([key, entry]) => (entry.base ? [[key, entry.base]] : [])),
    )
  }

  /**
   * Lists every template with its locales. `template` is the variant without a locale, or else the first locale's.
   */
  public listTemplates(): TemplateSummary[] {
    return Object.entries(this.templates).flatMap(([name, entry]) => {
      const locales = Object.keys(entry.locales).sort()
      const firstLocale = locales[0]
      const template = entry.base ?? (firstLocale ? entry.locales[firstLocale] : undefined)

      return template ? [{ name, template, locales }] : []
    })
  }
}
