import { OAuthConfigError, OAuthTransientError, networkError } from './errors'
import type { AuthorizationServerMetadata, OAuthEndpoints } from './types'

/** The `@frigear-nu/oauth-server` paths, used when discovery is off. */
export const defaultEndpointPaths: OAuthEndpoints = {
  authorization: '/oauth/authorize',
  token: '/oauth/token',
  revocation: '/oauth/revoke',
  userinfo: '/oauth/userinfo',
  jwks: '/.well-known/jwks.json',
}

/** `https://id.example.com/` and `https://id.example.com` are the same issuer. */
export const normalizeIssuer = (issuer: string) => issuer.replace(/\/+$/, '')

/** An absolute URL as is; a path joined onto the issuer. */
export const resolveEndpoint = (issuer: string, value: string) =>
  /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `${normalizeIssuer(issuer)}/${value.replace(/^\/+/, '')}`

/**
 * The discovery URLs to try, in order: OpenID Connect Discovery (`<issuer>/.well-known/openid-configuration`), then
 * RFC 8414 (`/.well-known/oauth-authorization-server` inserted before the issuer's path).
 */
export function discoveryUrls(issuer: string): string[] {
  const base = normalizeIssuer(issuer)
  const url = new URL(base)
  const path = url.pathname === '/' ? '' : url.pathname
  return [
    `${base}/.well-known/openid-configuration`,
    `${url.origin}/.well-known/oauth-authorization-server${path}`,
  ]
}

export interface DiscoverOptions {
  issuer: string
  fetch: typeof fetch
  rewriteUrl: (url: string) => string
}

/**
 * Fetches the authorization server metadata and checks it: the document must name the configured issuer
 * (RFC 8414 §3.3, mix-up protection) and, when it lists PKCE methods, support `S256`.
 */
export async function discover({ issuer, fetch, rewriteUrl }: DiscoverOptions): Promise<AuthorizationServerMetadata> {
  let lastStatus: number | undefined
  for (const candidate of discoveryUrls(issuer)) {
    const url = rewriteUrl(candidate)
    let response: Response
    try {
      response = await fetch(url, { headers: { accept: 'application/json' } })
    }
    catch (cause) {
      throw networkError(url, cause)
    }
    if (response.status === 429 || response.status >= 500) {
      throw new OAuthTransientError('discovery_failed', `Discovery at ${url} failed (${response.status}).`, { status: response.status })
    }
    if (!response.ok) {
      lastStatus = response.status
      continue
    }
    const metadata = await response.json().catch(() => null) as AuthorizationServerMetadata | null
    if (!metadata || typeof metadata !== 'object' || typeof metadata.issuer !== 'string') {
      throw new OAuthConfigError('invalid_discovery', `${url} is not an authorization server metadata document.`)
    }
    if (rewriteUrl(normalizeIssuer(metadata.issuer)) !== rewriteUrl(normalizeIssuer(issuer))) {
      throw new OAuthConfigError('issuer_mismatch', `${url} names the issuer "${metadata.issuer}", not "${issuer}".`)
    }
    if (!metadata.authorization_endpoint || !metadata.token_endpoint) {
      throw new OAuthConfigError('invalid_discovery', `${url} has no authorization_endpoint or token_endpoint.`)
    }
    const methods = metadata.code_challenge_methods_supported
    if (Array.isArray(methods) && !methods.includes('S256')) {
      throw new OAuthConfigError('pkce_unsupported', `${issuer} does not support PKCE with S256.`)
    }
    return metadata
  }
  throw new OAuthConfigError('discovery_failed', `${issuer} publishes no discovery document (${lastStatus ?? 'no response'}). Set \`endpoints\` or turn \`discovery\` off.`, { status: lastStatus })
}

/** The endpoints of a metadata document, with explicitly configured ones winning. */
export function endpointsFrom(issuer: string, metadata: AuthorizationServerMetadata | null, overrides: Partial<OAuthEndpoints> = {}): OAuthEndpoints {
  const base: Partial<OAuthEndpoints> = metadata
    ? {
        authorization: metadata.authorization_endpoint,
        token: metadata.token_endpoint,
        revocation: metadata.revocation_endpoint,
        userinfo: metadata.userinfo_endpoint,
        endSession: metadata.end_session_endpoint,
        jwks: metadata.jwks_uri,
      }
    : defaultEndpointPaths
  const merged = { ...base }
  for (const [key, value] of Object.entries(overrides) as [keyof OAuthEndpoints, string | undefined][]) {
    if (value) merged[key] = value
  }
  const resolved = {} as OAuthEndpoints
  for (const [key, value] of Object.entries(merged) as [keyof OAuthEndpoints, string | undefined][]) {
    if (value) resolved[key] = resolveEndpoint(issuer, value)
  }
  return resolved
}
