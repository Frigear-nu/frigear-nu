/**
 * Whether `value` is safe to follow after signing in: a path on this site. Rejects anything not starting with `/`,
 * protocol-relative `//host`, any backslash (browsers read `/\host` as `//host`) and ASCII control characters (a tab
 * or newline inside `/\t/host` is dropped by the URL parser). The one check of every module, on server and client.
 */
export function isSafeRedirect(value: unknown): value is string {
  return typeof value === 'string'
    && value.startsWith('/')
    && !value.startsWith('//')
    && !value.includes('\\')
    // eslint-disable-next-line no-control-regex
    && !/[\u0000-\u001F\u007F]/.test(value)
}
