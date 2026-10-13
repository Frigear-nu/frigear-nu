import type { H3Event } from 'h3'
import { createLocalJWKSet, jwtVerify, type JWK, type JWTPayload } from 'jose'

const DEFAULT_SSO_URL = 'https://frigear.nu'

export type FrigearSsoConfig = {
  enabled: boolean
  forceId: boolean
  /** Apply the `role` claim of frigear.nu to the local user at every login. */
  syncRole: boolean
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
export function resolveFrigearSso(event: H3Event): FrigearSsoConfig {
  const config = useRuntimeConfig(event)
  const sso = config.frigear?.sso
  const oidc = (config.oauth as { oidc?: { clientId?: string, clientSecret?: string, openidConfig?: string | object } } | undefined)?.oidc

  const oidcConfig = typeof oidc?.openidConfig === 'string' ? oidc.openidConfig : ''
  const url = (sso?.url || (oidcConfig && new URL(oidcConfig).origin) || DEFAULT_SSO_URL).replace(/\/+$/, '')
  const clientId = sso?.clientId || oidc?.clientId || ''
  const clientSecret = sso?.clientSecret || oidc?.clientSecret || ''

  return {
    enabled: config.previewDeployment === true || !!(sso?.clientId && sso?.clientSecret),
    forceId: config.frigear?.forceId === true,
    syncRole: config.frigear?.syncRole !== false,
    url,
    clientId,
    clientSecret,
    openidConfig: sso?.url || !oidcConfig ? `${url}/.well-known/openid-configuration` : oidcConfig,
  }
}

const loadOpenIdConfiguration = cachedFunction(async (url: string) => {
  return $fetch<{ jwks_uri?: string }>(url)
}, { name: 'frigear-openid-configuration', getKey: url => url, maxAge: 3600 })

const loadJwks = cachedFunction(async (url: string) => {
  return $fetch<{ keys: JWK[] }>(url)
}, { name: 'frigear-jwks', getKey: url => url, maxAge: 3600 })

/**
 * Verifies the OIDC `id_token` (RS256) against the keys frigear.nu publishes at its `jwks_uri`, checking the issuer
 * and that the token was issued for this client. Throws a 401 when it does not verify.
 */
export async function verifyFrigearIdToken(sso: FrigearSsoConfig, idToken: string): Promise<JWTPayload> {
  const metadata = await loadOpenIdConfiguration(sso.openidConfig)
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
