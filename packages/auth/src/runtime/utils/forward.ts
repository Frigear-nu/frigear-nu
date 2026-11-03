/** Whether `value` is a path on the current origin: `/x`, never `//host`, a backslash or a full URL. */
const isOriginPath = (value: string) => value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')

const originOf = (value: string) => {
  try {
    return new URL(value).origin
  }
  catch {
    return undefined
  }
}

/**
 * Whether server-mode `$api` may send the caller's credentials (the incoming Cookie and Authorization headers during
 * a server render, the browser's cookies) with a request: only to this app itself. That is a path (`/x`, not `//x`)
 * or a URL on `origin`, and a `baseURL`, which ofetch puts in front of a path, is checked the same way. Anything else
 * goes out without them.
 */
export function shouldForwardCredentials(request: string, baseURL: string | undefined, origin: string): boolean {
  // A full URL ignores the baseURL.
  if (/^[a-z][a-z\d+.-]*:/i.test(request.trim()) || request.trim().startsWith('//')) return originOf(request.trim()) === origin
  if (!isOriginPath(request)) return false
  if (baseURL === undefined || baseURL === '') return true
  return isOriginPath(baseURL) || originOf(baseURL) === origin
}
