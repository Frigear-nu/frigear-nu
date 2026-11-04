export type DeepLink
  = | { type: 'oauth' }
    | { type: 'route', path: string }
    | { type: 'ignore', reason: 'invalid' | 'unknown-scheme' | 'unknown-host' }

export interface DeepLinkOptions {
  /** Custom schemes of the app, lowercase (`nu.frigear.app`). */
  schemes: string[]
  /** `https` hosts of universal links / app links. */
  hosts: string[]
  /** Whether the URL is an OAuth redirect, which `@frigear-nu/auth` (client mode) completes. */
  isCallbackUrl?: (url: string) => boolean
}

/**
 * What a URL the OS opened the app with means:
 *
 * - an OAuth callback: left to `@frigear-nu/auth`;
 * - `<scheme>:/bills/1`, `<scheme>://bills/1` (the host is the first segment) or `https://<host>/bills/1`: the app path;
 * - anything else: ignored.
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
  const rest = `${parsed.search}${parsed.hash}`

  if (scheme === 'https' || scheme === 'http') {
    const host = parsed.host.toLowerCase()
    if (scheme !== 'https' || !options.hosts.some(allowed => allowed.toLowerCase() === host)) return { type: 'ignore', reason: 'unknown-host' }
    return { type: 'route', path: `${toAppPath(parsed.pathname.split(/[/\\]/))}${rest}` }
  }
  if (!options.schemes.some(allowed => allowed.toLowerCase() === scheme)) return { type: 'ignore', reason: 'unknown-scheme' }

  // `scheme://bills/1` parses `bills` as the host; `scheme:/bills/1` and `scheme:bills/1` have none. Non-special
  // schemes keep `\` in the path, which browsers and the router read as `/`: split on both.
  return { type: 'route', path: `${toAppPath([parsed.host, ...parsed.pathname.split(/[/\\]/)])}${rest}` }
}

/** One leading slash and no empty segments: `//evil.example` or `/\evil.example` would leave the app. */
function toAppPath(segments: string[]): string {
  return `/${segments.filter(Boolean).join('/')}`
}

/**
 * Whether `path` stays in the app: one leading `/`, no `\` before the query (browsers read `/\host` as `//host`) and no
 * control characters. Checked again after the `mobile:deep-link` hook, which may change the path.
 */
export function isInAppPath(path: string): boolean {
  const pathname = path.split(/[?#]/, 1)[0]!
  // eslint-disable-next-line no-control-regex
  return /^\/(?![/\\])/.test(pathname) && !pathname.includes('\\') && !/[\u0000-\u001F\u007F]/.test(path)
}
