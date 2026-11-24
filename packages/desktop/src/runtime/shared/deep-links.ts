export type DeepLink
  = | { type: 'oauth' }
    | { type: 'route', path: string }
    | { type: 'focus' }
    | { type: 'ignore', reason: 'invalid' | 'unknown-scheme' }

export interface DeepLinkOptions {
  /** Custom schemes of the app, lowercase. */
  schemes: string[]
  /** Whether the URL is an OAuth redirect, which `@frigear-nu/auth` (client mode) completes. */
  isCallbackUrl?: (url: string) => boolean
  /**
   * A path that only brings the window to the front, never navigates (`/auth/return`: the browser's "signed in" page of
   * Auth's frigear handoff). Matched on the path alone; a query or fragment is ignored and never read.
   */
  focusPath?: string
}

/**
 * What a URL the OS opened the app with means: an OAuth callback (left to `@frigear-nu/auth`), `focusPath` (bring the
 * window forward), `<scheme>:/bills/1` or `<scheme>://bills/1` (the host is the first segment) as the app path, or
 * anything else, ignored.
 */
export function classifyDeepLink(url: string, options: DeepLinkOptions): DeepLink {
  if (options.isCallbackUrl?.(url)) return { type: 'oauth' }
  let parsed: URL
  try {
    parsed = new URL(url)
  }
  catch {
    return { type: 'ignore', reason: 'invalid' }
  }
  const scheme = parsed.protocol.slice(0, -1).toLowerCase()
  if (scheme === 'http' || scheme === 'https' || !options.schemes.some(allowed => allowed.toLowerCase() === scheme)) {
    return { type: 'ignore', reason: 'unknown-scheme' }
  }
  // Non-special schemes keep `\` in the path, which the router reads as `/`: split on both, drop empty segments, so
  // `//evil.example` cannot leave the app.
  const segments = [parsed.host, ...parsed.pathname.split(/[/\\]/)].filter(Boolean)
  if (options.focusPath && `/${segments.join('/')}` === options.focusPath) return { type: 'focus' }
  return { type: 'route', path: `/${segments.join('/')}${parsed.search}${parsed.hash}` }
}

/** Whether `path` stays in the app: one leading `/`, no `\` before the query, no control characters. */
export function isInAppPath(path: string): boolean {
  const pathname = path.split(/[?#]/, 1)[0]!
  // eslint-disable-next-line no-control-regex
  return /^\/(?![/\\])/.test(pathname) && !pathname.includes('\\') && !/[\u0000-\u001F\u007F]/.test(path)
}
