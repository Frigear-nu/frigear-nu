import type { H3Event } from 'h3'
import { createLocalJWKSet, jwtVerify, type JWK, type JWTPayload } from 'jose'

const DEFAULT_SSO_URL = 'https://frigear.nu'
const DEFAULT_SCOPES = ['openid', 'profile', 'email']

export type FrigearSsoConfig = {
  enabled: boolean
  forceId: boolean
  /** Apply the `role` claim of frigear.nu to the local user at every login. */
  syncRole: boolean
  /** Keep the frigear.nu tokens at login (`auth_oauth_tokens`, read with `getOAuthAccessToken(event, 'frigear')`). */
  keepTokens: boolean
  /** Scopes every login asks for (`frigear.sso.scopes`); always includes `openid`. */
  scopes: string[]
  /** Extra scopes a login may ask for with `?scope=` (`frigear.sso.stepUpScopes`). */
  stepUpScopes: string[]
  url: string
  clientId: string
  clientSecret: string
  openidConfig: string
}

/**
 * Resolves how "Log in with frigear.nu" is configured *at request time*. It is active when
 * `runtimeConfig.previewDeployment` is true or `runtimeConfig.frigear.sso` has credentials. The credentials come
 * from `frigear.sso`, falling back to nuxt-auth-utils' own `oauth.oidc` config (`NUXT_OAUTH_OIDC_*`).
 */
export function resolveFrigearSso(event?: H3Event): FrigearSsoConfig {
  const config = useRuntimeConfig(event)
  const sso = config.frigear?.sso as { url?: string, clientId?: string, clientSecret?: string, scopes?: unknown, stepUpScopes?: unknown } | undefined
  const oidc = (config.oauth as { oidc?: { clientId?: string, clientSecret?: string, openidConfig?: string | object } } | undefined)?.oidc

  const oidcConfig = typeof oidc?.openidConfig === 'string' ? oidc.openidConfig : ''
  const url = (sso?.url || (oidcConfig && new URL(oidcConfig).origin) || DEFAULT_SSO_URL).replace(/\/+$/, '')
  const clientId = sso?.clientId || oidc?.clientId || ''
  const clientSecret = sso?.clientSecret || oidc?.clientSecret || ''

  return {
    enabled: config.previewDeployment === true || !!(sso?.clientId && sso?.clientSecret),
    forceId: config.frigear?.forceId === true,
    syncRole: config.frigear?.syncRole !== false,
    keepTokens: config.frigear?.keepTokens === true,
    scopes: [...new Set(['openid', ...(parseScopeList(sso?.scopes) ?? DEFAULT_SCOPES)])],
    stepUpScopes: parseScopeList(sso?.stepUpScopes) ?? [],
    url,
    clientId,
    clientSecret,
    openidConfig: sso?.url || !oidcConfig ? `${url}/.well-known/openid-configuration` : oidcConfig,
  }
}

/** A scope list from config or a query: space or comma separated, or an array (env vars may hold JSON). */
function parseScopeList(value: unknown): string[] | undefined {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[\s,]+/) : undefined
  const scopes = list?.filter((scope): scope is string => typeof scope === 'string' && !!scope.trim()).map(scope => scope.trim())
  return scopes?.length ? scopes : undefined
}

/**
 * The scopes a login asks for: the configured ones plus the step-up scopes requested with `?scope=` that are in the
 * allowlist (others are ignored). frigear.nu may still grant fewer: it drops scopes the user may not have.
 */
export function frigearLoginScopes(sso: FrigearSsoConfig, requested?: unknown): string[] {
  const stepUp = (parseScopeList(requested) ?? []).filter(scope => sso.stepUpScopes.includes(scope))
  return [...new Set([...sso.scopes, ...stepUp])]
}

/** An OpenID provider's discovery document, cached for an hour. */
export const loadOAuthOpenIdConfiguration = cachedFunction(async (url: string) => {
  return $fetch<{ jwks_uri?: string, token_endpoint?: string }>(url)
}, { name: 'frigear-openid-configuration', getKey: url => url, maxAge: 3600 })

const loadJwks = cachedFunction(async (url: string) => {
  return $fetch<{ keys: JWK[] }>(url)
}, { name: 'frigear-jwks', getKey: url => url, maxAge: 3600 })

/**
 * Verifies the OIDC `id_token` (RS256) against the keys frigear.nu publishes at its `jwks_uri`, checking the issuer
 * and that the token was issued for this client. Throws a 401 when it does not verify.
 */
export async function verifyFrigearIdToken(sso: FrigearSsoConfig, idToken: string): Promise<JWTPayload> {
  const metadata = await loadOAuthOpenIdConfiguration(sso.openidConfig)
  const jwks = await loadJwks(metadata?.jwks_uri || `${sso.url}/.well-known/jwks.json`)
  if (!jwks?.keys?.length) {
    throw createError({ statusCode: 502, statusMessage: 'Could not load the signing keys of frigear.nu.' })
  }

  try {
    const { payload } = await jwtVerify(idToken, createLocalJWKSet(jwks), {
      issuer: sso.url,
      audience: sso.clientId,
    })
    return payload
  }
  catch {
    throw createError({ statusCode: 401, statusMessage: 'The frigear.nu identity token is invalid.' })
  }
}
