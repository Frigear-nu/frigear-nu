import { useRuntimeConfig } from '#imports'
import { hostUrl, resolveHostBase } from '../../shared/host'
import { useCapacitor } from './useCapacitor'

/**
 * The website of `mobile.host`, which has the pages the app does not:
 *
 * - `enabled`: whether there is one (`mobile.host` is set, and its URL or the issuer is known);
 * - `base`: its origin and base path, `''` without one;
 * - `url(target)`: a path (keep the locale prefix in it) on the website, or an absolute URL as is;
 * - `open(target)`: opens that in the in-app browser (`@capacitor/browser`), which shares the website session of the
 *   sign-in, or in a new tab in a browser.
 */
export function useMobileHost() {
  const config = useRuntimeConfig().public
  const host = config.mobile.host
  const client = (config as { authentication?: { client?: { issuer?: string, rewriteLoopback?: boolean | string } } }).authentication?.client
  const base = host?.enabled
    ? resolveHostBase({
      url: host.url,
      issuer: client?.issuer,
      rewriteLoopback: client?.rewriteLoopback,
      pageHostname: import.meta.client ? globalThis.location?.hostname : undefined,
      dev: import.meta.dev,
    }) ?? ''
    : ''
  const capacitor = useCapacitor()

  const url = (target: string): string => hostUrl(base, target)

  async function open(target: string): Promise<void> {
    const href = url(target)
    const browser = await capacitor.load('browser')
    if (browser) {
      await browser.open({ url: href })
      return
    }
    if (import.meta.client) globalThis.open(href, '_blank', 'noopener')
  }

  return { enabled: !!base, base, url, open }
}
