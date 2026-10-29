export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

export const readString = (source: Record<string, unknown>, key: string): string | undefined => {
  const value = source[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export const toError = (value: unknown): Error => {
  if (value instanceof Error) {
    return value
  }

  if (isRecord(value)) {
    const message = readString(value, 'message')
    return new Error(message ?? JSON.stringify(value))
  }

  return new Error(String(value))
}
