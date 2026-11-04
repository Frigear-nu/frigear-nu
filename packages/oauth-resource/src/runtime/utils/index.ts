// Pure helpers: safe to import from Nitro, the module and tests (`@frigear-nu/oauth-resource/utils`).

export const DEFAULT_ISSUER = 'https://frigear.nu'
export const DEFAULT_AUDIENCE = 'frigear-services'
/** The Capacitor webview on iOS (`capacitor://localhost`) and Android (`https://localhost`). */
export const DEFAULT_CORS_ORIGINS = ['capacitor://localhost', 'https://localhost'] as const

/** A list from config or env: an array, or a comma separated string (`NUXT_*` env vars). Trimmed, no blanks. */
export function parseList(value: readonly string[] | string | null | undefined): string[] {
  const list = Array.isArray(value) ? value : String(value ?? '').split(',')
  return list.map(item => item.trim()).filter(Boolean)
}

/** `scheme://host[:port]`, nothing else. `capacitor://localhost` is one even though `URL.origin` calls it "null". */
export function isExactOrigin(origin: string): boolean {
  if (origin === '*' || !URL.canParse(origin)) return false
  const url = new URL(origin)
  return origin === `${url.protocol}//${url.host}`
}

/** Whether `pathname` falls under one of the `prefixes` (`/api/` matches `/api/x`, and `/api` itself). */
export function matchesPathPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some(prefix => pathname === prefix.replace(/\/+$/, '') || pathname.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`))
}

/** The issuer's endpoints, from the configured URLs or the issuer's standard paths. */
export function resolveIssuerUrls(config: { issuer?: string, jwksUrl?: string, userinfoUrl?: string }) {
  const issuer = (config.issuer || DEFAULT_ISSUER).replace(/\/+$/, '')
  return {
    issuer,
    jwksUrl: config.jwksUrl || `${issuer}/.well-known/jwks.json`,
    userinfoUrl: config.userinfoUrl || `${issuer}/oauth/userinfo`,
  }
}
