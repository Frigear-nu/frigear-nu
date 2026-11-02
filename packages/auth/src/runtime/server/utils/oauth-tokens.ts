import type { H3Event } from 'h3'
import { db, schema } from '@nuxthub/db'
import { and, eq } from 'drizzle-orm'
import { loadOAuthOpenIdConfiguration, resolveFrigearSso } from './frigear-sso'

/** A provider's tokens kept for a user (`keepTokens`), decrypted. */
export interface OAuthTokens {
  accessToken: string
  refreshToken?: string
  tokenType?: string
  /** `null` when the provider sent no `expires_in`. */
  expiresAt: Date | null
  /** The scopes the provider granted (its `scope`), else the scopes the login asked for. */
  scopes: string[]
}

// An access token this close to expiring is refreshed instead, so it does not lapse during the call it is used for.
const EXPIRY_MARGIN_MS = 30_000

const encoder = new TextEncoder()
const decoder = new TextDecoder()

const toBase64Url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const fromBase64Url = (value: string) => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0))

const derivedKeys = new Map<string, Promise<CryptoKey>>()

/** The AES-GCM key for a secret: HKDF-SHA-256, so any secret string (a token key, a session password) works. */
export function deriveOAuthTokensKey(secret: string): Promise<CryptoKey> {
  let key = derivedKeys.get(secret)
  if (!key) {
    key = crypto.subtle.importKey('raw', encoder.encode(secret), 'HKDF', false, ['deriveKey']).then(material =>
      crypto.subtle.deriveKey(
        { name: 'HKDF', hash: 'SHA-256', salt: encoder.encode('@frigear-nu/auth'), info: encoder.encode('auth_oauth_tokens') },
        material,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
      ))
    derivedKeys.set(secret, key)
  }
  return key
}

function oauthTokensKey() {
  const config = useRuntimeConfig()
  const secret = config.authTokensKey || (config.session as { password?: string } | undefined)?.password
  if (!secret) throw new Error('[@frigear-nu/auth] Keeping OAuth tokens needs NUXT_AUTH_TOKENS_KEY (or NUXT_SESSION_PASSWORD).')
  return deriveOAuthTokensKey(secret)
}

/** Encrypts a token as `v1.<iv>.<ciphertext>`, bound to `context` (the provider), so rows cannot be swapped. */
export async function sealOAuthToken(key: CryptoKey, value: string, context: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(context) }, key, encoder.encode(value))
  return `v1.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(sealed))}`
}

/** Decrypts `sealOAuthToken` output; `null` when it does not open (another key, another provider, tampered). */
export async function openOAuthToken(key: CryptoKey, sealed: string, context: string): Promise<string | null> {
  const [version, iv, data] = sealed.split('.')
  if (version !== 'v1' || !iv || !data) return null
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64Url(iv), additionalData: encoder.encode(context) }, key, fromBase64Url(data))
    return decoder.decode(plain)
  }
  catch {
    return null
  }
}

/** Reads a token endpoint response; `undefined` without an access token. `fallbackScopes` stand in for a missing `scope`. */
export function parseOAuthTokenResponse(response: Record<string, unknown>, fallbackScopes: string[] = [], now = Date.now()): OAuthTokens | undefined {
  const accessToken = response.access_token
  if (typeof accessToken !== 'string' || !accessToken) return undefined
  const expiresIn = Number(response.expires_in)
  return {
    accessToken,
    refreshToken: typeof response.refresh_token === 'string' && response.refresh_token ? response.refresh_token : undefined,
    tokenType: typeof response.token_type === 'string' ? response.token_type : undefined,
    expiresAt: Number.isFinite(expiresIn) && expiresIn > 0 ? new Date(now + expiresIn * 1000) : null,
    scopes: typeof response.scope === 'string' ? response.scope.split(/\s+/).filter(Boolean) : fallbackScopes,
  }
}

let warnedMissingTable = false
function oauthTokensTable() {
  if (!schema.authOAuthTokens && !warnedMissingTable) {
    warnedMissingTable = true
    console.warn('[@frigear-nu/auth] OAuth tokens are not kept: no `auth_oauth_tokens` table. Set `keepTokens` on a provider in `authentication.settings.oauth`.')
  }
  return schema.authOAuthTokens
}

async function resolveUserId(target: H3Event | number): Promise<number | null> {
  if (typeof target === 'number') return target
  const auth = await getAuth(target)
  return auth ? Number(auth.user.id) : null
}

/**
 * Stores a provider's tokens for a user, replacing what was kept before (a step-up login replaces the plain one). A
 * token response without an access token removes them.
 */
export async function storeOAuthTokens(userId: number, provider: string, tokens: OAuthTokens | undefined) {
  const table = oauthTokensTable()
  if (!table) return
  if (!tokens) return revokeOAuthTokens(userId, provider)
  const key = await oauthTokensKey()
  const values = {
    accessToken: await sealOAuthToken(key, tokens.accessToken, provider),
    refreshToken: tokens.refreshToken ? await sealOAuthToken(key, tokens.refreshToken, provider) : null,
    tokenType: tokens.tokenType ?? null,
    scopes: tokens.scopes,
    expiresAt: tokens.expiresAt,
  }
  await db.insert(table).values({ userId, provider, ...values })
    .onConflictDoUpdate({ target: [table.userId, table.provider], set: { ...values, updatedAt: new Date() } })
}

/**
 * The tokens kept for the user (the caller of `event`, or a user id: a task can use an admin's tokens) and provider,
 * as stored, also when expired; `null` when there are none. For "connected / not connected"; use
 * `getOAuthAccessToken` to call the provider.
 */
export async function getOAuthTokens(target: H3Event | number, provider: string): Promise<OAuthTokens | null> {
  const table = schema.authOAuthTokens
  const userId = await resolveUserId(target)
  if (!table || userId === null) return null
  const row = await db.query.authOAuthTokens.findFirst({ where: and(eq(table.userId, userId), eq(table.provider, provider)) })
  if (!row) return null
  const key = await oauthTokensKey()
  const accessToken = await openOAuthToken(key, row.accessToken, provider)
  if (!accessToken) return null
  const refreshToken = row.refreshToken ? await openOAuthToken(key, row.refreshToken, provider) ?? undefined : undefined
  return { accessToken, refreshToken, tokenType: row.tokenType ?? undefined, expiresAt: row.expiresAt ?? null, scopes: row.scopes ?? [] }
}

/**
 * A usable access token for the provider, or `null` when there is none, it lacks one of `options.scopes`, or it
 * expired and could not be refreshed. An expired token is refreshed with the refresh token at the provider's token
 * endpoint (OIDC discovery) and the result stored.
 */
export async function getOAuthAccessToken(target: H3Event | number, provider: string, options: { scopes?: string[] } = {}): Promise<string | null> {
  const userId = await resolveUserId(target)
  if (userId === null) return null
  let tokens = await getOAuthTokens(userId, provider)
  if (!tokens) return null
  if (options.scopes?.some(scope => !tokens!.scopes.includes(scope))) return null
  if (tokens.expiresAt && tokens.expiresAt.getTime() - EXPIRY_MARGIN_MS <= Date.now()) {
    tokens = tokens.refreshToken ? await refreshOAuthTokens(userId, provider, tokens) : null
  }
  return tokens?.accessToken ?? null
}

/** Forgets the tokens kept for the user and provider. */
export async function revokeOAuthTokens(userId: number, provider: string) {
  const table = schema.authOAuthTokens
  if (!table) return
  await db.delete(table).where(and(eq(table.userId, userId), eq(table.provider, provider)))
}

// One refresh per user and provider at a time: providers rotate refresh tokens, and a replayed one revokes them all.
const pendingRefreshes = new Map<string, Promise<OAuthTokens | null>>()

function refreshOAuthTokens(userId: number, provider: string, current: OAuthTokens): Promise<OAuthTokens | null> {
  const id = `${userId}:${provider}`
  let pending = pendingRefreshes.get(id)
  if (!pending) {
    pending = runRefresh(userId, provider, current).finally(() => pendingRefreshes.delete(id))
    pendingRefreshes.set(id, pending)
  }
  return pending
}

async function runRefresh(userId: number, provider: string, current: OAuthTokens): Promise<OAuthTokens | null> {
  const client = await resolveOAuthTokenEndpoint(provider)
  if (!client || !current.refreshToken) return null
  try {
    const response = await $fetch<Record<string, unknown>>(client.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: current.refreshToken,
        client_id: client.clientId,
        ...(client.clientSecret && { client_secret: client.clientSecret }),
      }).toString(),
    })
    const next = parseOAuthTokenResponse(response, current.scopes)
    if (!next) return null
    // Providers that do not rotate refresh tokens send none back: keep the one we have.
    const tokens = { ...next, refreshToken: next.refreshToken ?? current.refreshToken }
    await storeOAuthTokens(userId, provider, tokens)
    return tokens
  }
  catch {
    return null
  }
}

/** Where to refresh a provider's tokens: frigear.nu's discovery, else an OIDC provider's `openidConfig`. */
async function resolveOAuthTokenEndpoint(provider: string) {
  let clientId: string | undefined
  let clientSecret: string | undefined
  let openidConfig: string | undefined
  if (provider === 'frigear') {
    const sso = resolveFrigearSso()
    if (!sso.enabled) return undefined
    ;({ clientId, clientSecret, openidConfig } = sso)
  }
  else {
    const config = (useRuntimeConfig().oauth as Record<string, Record<string, unknown> | undefined> | undefined)?.[provider]
    clientId = typeof config?.clientId === 'string' ? config.clientId : undefined
    clientSecret = typeof config?.clientSecret === 'string' ? config.clientSecret : undefined
    openidConfig = typeof config?.openidConfig === 'string' ? config.openidConfig : undefined
  }
  if (!clientId || !openidConfig) return undefined
  const metadata = await loadOAuthOpenIdConfiguration(openidConfig).catch(() => undefined)
  return metadata?.token_endpoint ? { tokenEndpoint: metadata.token_endpoint, clientId, clientSecret } : undefined
}
