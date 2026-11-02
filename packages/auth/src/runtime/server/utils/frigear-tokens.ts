import type { H3Event } from 'h3'
import type { FrigearSsoConfig } from './frigear-sso'

/** The frigear.nu tokens kept on the sealed (server-only) session when `frigear.keepTokens` is on. */
export interface FrigearSessionTokens {
  accessToken: string
  refreshToken?: string
  /** Epoch milliseconds; absent when frigear.nu sent no `expires_in`. */
  expiresAt?: number
}

// An access token this close to expiring is refreshed instead, so it does not lapse during the call it is used for.
const EXPIRY_MARGIN_MS = 30_000

/** Reads a token endpoint response into the session shape, or `undefined` when it has no access token. */
export function toFrigearSessionTokens(tokens: Record<string, unknown>, now = Date.now()): FrigearSessionTokens | undefined {
  const accessToken = tokens.access_token
  if (typeof accessToken !== 'string' || !accessToken) return undefined
  const expiresIn = Number(tokens.expires_in)
  return {
    accessToken,
    ...(typeof tokens.refresh_token === 'string' && tokens.refresh_token && { refreshToken: tokens.refresh_token }),
    ...(Number.isFinite(expiresIn) && expiresIn > 0 && { expiresAt: now + expiresIn * 1000 }),
  }
}

/**
 * The signed-in user's frigear.nu access token, for calling frigear.nu APIs on their behalf. Needs `frigear.keepTokens`.
 * An expired token is refreshed with the refresh token (and the session updated); resolves `null` when there is no
 * token, or it expired and could not be refreshed.
 */
export async function getFrigearAccessToken(event: H3Event): Promise<string | null> {
  const session = await getUserSession(event)
  const tokens = session.secure?.frigear
  if (!tokens?.accessToken) return null
  if (!tokens.expiresAt || tokens.expiresAt - EXPIRY_MARGIN_MS > Date.now()) return tokens.accessToken
  if (!tokens.refreshToken) return null

  const refreshed = await refreshFrigearTokens(resolveFrigearSso(event), tokens.refreshToken)
  if (!refreshed) return null
  await setUserSession(event, { secure: { frigear: refreshed } })
  return refreshed.accessToken
}

async function refreshFrigearTokens(sso: FrigearSsoConfig, refreshToken: string): Promise<FrigearSessionTokens | undefined> {
  if (!sso.enabled || !sso.clientId || !sso.clientSecret) return undefined
  try {
    const metadata = await loadFrigearOpenIdConfiguration(sso.openidConfig)
    if (!metadata?.token_endpoint) return undefined
    const response = await $fetch<Record<string, unknown>>(metadata.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: sso.clientId,
        client_secret: sso.clientSecret,
      }).toString(),
    })
    const next = toFrigearSessionTokens(response)
    // frigear.nu rotates refresh tokens; the old one is kept only when no new one comes back.
    return next && { refreshToken, ...next }
  }
  catch {
    return undefined
  }
}
