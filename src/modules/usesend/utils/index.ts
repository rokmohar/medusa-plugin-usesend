/**
 * Converts a string from CamelCase to kebab-case
 * @param str The string to convert
 * @returns The converted string in kebab-case
 * @example
 * toKebabCase('ProductUpsert') // returns 'product-upsert'
 * toKebabCase('HTMLTemplate') // returns 'html-template'
 */
export function toKebabCase(str: string): string {
  return str
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
}
