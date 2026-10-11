/** Only same-origin absolute paths are followed after sign in; never `//host`, `/\host` or full URLs. */
export function isInternalPath(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\')
}
