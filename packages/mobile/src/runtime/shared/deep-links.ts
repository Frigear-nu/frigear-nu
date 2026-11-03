export type DeepLink
  = | { type: 'oauth' }
    | { type: 'route', path: string }
    | { type: 'ignore', reason: 'invalid' | 'unknown-scheme' | 'unknown-host' }

export interface DeepLinkOptions {
  /** Custom schemes of the app, lowercase (`nu.frigear.app`). */
  schemes: string[]
  /** `https` hosts of universal links / app links. */
  hosts: string[]
  /** Whether the URL is an OAuth redirect, which `@frigear-nu/oauth-client` completes. */
  isCallbackUrl?: (url: string) => boolean
}

/**
 * What a URL the OS opened the app with means:
 *
 * - an OAuth callback: left to `@frigear-nu/oauth-client`;
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
    // One leading slash: `//evil.example` would be a protocol-relative URL to the router.
    return { type: 'route', path: `${parsed.pathname.replace(/^\/+/, '/') || '/'}${rest}` }
  }
  if (!options.schemes.some(allowed => allowed.toLowerCase() === scheme)) return { type: 'ignore', reason: 'unknown-scheme' }

  // `scheme://bills/1` parses `bills` as the host; `scheme:/bills/1` and `scheme:bills/1` have none.
  const segments = [parsed.host, ...parsed.pathname.split('/')].filter(Boolean)
  const path = `/${segments.join('/')}`
  return { type: 'route', path: `${path}${rest}` }
}
