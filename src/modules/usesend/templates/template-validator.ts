import { UseSendEmailTemplate } from '../types'

export interface ValidationResult {
  isValid: boolean
  errors: ValidationError[]
  warnings: ValidationWarning[]
}

export interface ValidationError {
  code: string
  message: string
  path: string[]
}

export interface ValidationWarning {
  code: string
  message: string
  path: string[]
}

export interface ValidationRule {
  validate(template: UseSendEmailTemplate): ValidationResult
}

export class TemplateValidator {
  private rules: ValidationRule[] = []

  constructor(rules: ValidationRule[] = []) {
    this.rules = rules
  }

  addRule(rule: ValidationRule): void {
    this.rules.push(rule)
  }

  validate(template: UseSendEmailTemplate): ValidationResult {
    const errors: ValidationError[] = []
    const warnings: ValidationWarning[] = []

    for (const rule of this.rules) {
      const result = rule.validate(template)
      errors.push(...result.errors)
      warnings.push(...result.warnings)
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    }
  }
}

// Built-in validation rules
export class RequiredFieldsRule implements ValidationRule {
  validate(template: UseSendEmailTemplate): ValidationResult {
    const errors: ValidationError[] = []
    const warnings: ValidationWarning[] = []

    if (!template.subject) {
      errors.push({
        code: 'MISSING_SUBJECT',
        message: 'Template must have a subject',
        path: ['subject'],
      })
    }

    if (!template.content.react && !template.content.html) {
      errors.push({
        code: 'MISSING_CONTENT',
        message: 'Template must have either react or html content',
        path: ['content'],
      })
    }

    return { isValid: errors.length === 0, errors, warnings }
  }
}

export class ReactPropsRule implements ValidationRule {
  validate(template: UseSendEmailTemplate): ValidationResult {
    const errors: ValidationError[] = []
    const warnings: ValidationWarning[] = []

    if (template.content.react) {
      try {
        // Create a test instance to check props
        const TestComponent = template.content.react
        // Skip validation if PreviewProps is not defined
        if ('PreviewProps' in TestComponent) {
          const previewProps = TestComponent.PreviewProps
          TestComponent(previewProps)
        }
      } catch (error) {
        errors.push({
          code: 'INVALID_REACT_PROPS',
          message: `React component failed to render with test props: ${error.message}`,
          path: ['content', 'react'],
        })
      }
    }

    return { isValid: errors.length === 0, errors, warnings }
  }
}

export class HtmlValidationRule implements ValidationRule {
  validate(template: UseSendEmailTemplate): ValidationResult {
    const errors: ValidationError[] = []
    const warnings: ValidationWarning[] = []

    if (template.content.html) {
      // Basic HTML validation
      if (!template.content.html.includes('<html')) {
        warnings.push({
          code: 'MISSING_HTML_TAG',
          message: 'HTML content should be wrapped in <html> tags',
          path: ['content', 'html'],
        })
      }

      if (!template.content.html.includes('<body')) {
        warnings.push({
          code: 'MISSING_BODY_TAG',
          message: 'HTML content should be wrapped in <body> tags',
          path: ['content', 'html'],
        })
      }
    }

    return { isValid: errors.length === 0, errors, warnings }
  }
}

export class MetadataValidationRule implements ValidationRule {
  validate(template: UseSendEmailTemplate): ValidationResult {
    const errors: ValidationError[] = []
    const warnings: ValidationWarning[] = []

    if (template.metadata) {
      if (template.metadata.version && !this.isValidVersion(template.metadata.version)) {
        errors.push({
          code: 'INVALID_VERSION',
          message: 'Version must follow semantic versioning (e.g., 1.0.0)',
          path: ['metadata', 'version'],
        })
      }

      if (template.metadata.tags && !Array.isArray(template.metadata.tags)) {
        errors.push({
          code: 'INVALID_TAGS',
          message: 'Tags must be an array of strings',
          path: ['metadata', 'tags'],
        })
      }
    }

    return { isValid: errors.length === 0, errors, warnings }
  }

  private isValidVersion(version: string): boolean {
    return /^\d+\.\d+\.\d+$/.test(version)
  }
}
