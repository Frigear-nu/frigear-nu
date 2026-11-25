import type { H3Event } from 'h3'
import { db, schema } from '@nuxthub/db'
import { and, eq, gt, lt } from 'drizzle-orm'
import { deriveSecret } from 'nuxt/server'
import { apiError, sha256Hex } from '@frigear-nu/module-kit/server'
import { deriveHkdfKey } from '@frigear-nu/module-kit/crypto'
import { challengeFor, randomString } from '../../client/core/pkce'
import type { FrigearHandoffDto, FrigearHandoffStartDto } from '../../../types'
import type { FrigearSsoConfig } from './frigear-sso'
import { openOAuthToken, sealOAuthToken } from './oauth-tokens'

// "Log in with frigear.nu" handed off to the system browser (`oauth.frigear.handoff`). The window starts an attempt and
// waits; the system browser signs in at frigear.nu (passkeys work there, unlike in an embedded webview) and comes back
// to `/auth/frigear` on this server, which exchanges the code (PKCE) and marks the attempt complete; the window,
// polling with its attempt cookie, then collects the cookie session. No code or token ever reaches the window, and no
// session is set in the browser.

/** How long an attempt stays valid: 10 minutes. */
export const FRIGEAR_HANDOFF_TTL_SECONDS = 600
/** The window's httpOnly cookie holding the attempt secret, scoped to the handoff routes. */
export const FRIGEAR_HANDOFF_COOKIE = 'auth-frigear-handoff'
const COOKIE_PATH = '/api/auth/frigear/handoffs'
// Marks a `state` as a handoff's, so `/auth/frigear` routes the callback here instead of the cookie flow.
const STATE_PREFIX = 'fh.'

/** What the window sees of an attempt. `exchanging` (the browser came back, the code is being exchanged) is `pending`. */
export type FrigearHandoffStatus = FrigearHandoffDto['status']

/** An attempt as stored (`auth_frigear_handoffs`). */
export type FrigearHandoffRow = {
  id: string
  secretHash: string
  stateHash: string
  /** Encrypted (`sealFrigearHandoffVerifier`); `openFrigearHandoffVerifier` reads it. */
  codeVerifier: string
  nonce: string
  redirectUri: string
  redirectTo: string | null
  status: string
  error: string | null
  userId: number | null
  sessionData: Record<string, unknown> | null
  expiresAt: Date
  createdAt: Date
}

function handoffTable() {
  const table = schema.authFrigearHandoffs
  if (!table) throw apiError(404, 'handoff_disabled', 'The browser handoff is not enabled (`oauth.frigear.handoff`).')
  return table
}

const verifierKeys = new Map<string, Promise<CryptoKey>>()

/**
 * The AES-GCM key for stored PKCE verifiers: from Nuxt's `appSecret` (the secret the cookie sessions are sealed with),
 * through `deriveSecret`, so no key of its own is configured.
 */
async function frigearHandoffKey() {
  const secret = await deriveSecret('@frigear-nu/auth:frigear-handoff')
  let key = verifierKeys.get(secret)
  if (!key) {
    key = deriveHkdfKey(secret, { salt: '@frigear-nu/auth', info: 'auth_frigear_handoffs' }, { name: 'AES-GCM', length: 256 }, ['encrypt', 'decrypt'])
    verifierKeys.set(secret, key)
  }
  return key
}

/** Encrypts an attempt's PKCE verifier for storage, bound to the attempt id so rows cannot be swapped. */
export async function sealFrigearHandoffVerifier(id: string, verifier: string) {
  return sealOAuthToken(await frigearHandoffKey(), verifier, `auth_frigear_handoffs:${id}`)
}

/** The PKCE verifier of a stored attempt; `null` when it does not open (`appSecret` changed, tampered). */
export async function openFrigearHandoffVerifier(row: Pick<FrigearHandoffRow, 'id' | 'codeVerifier'>) {
  return openOAuthToken(await frigearHandoffKey(), row.codeVerifier, `auth_frigear_handoffs:${row.id}`)
}

/** Constant-time comparison of two strings (hashes of equal length). */
function equalStrings(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let index = 0; index < a.length; index++) diff |= a.charCodeAt(index) ^ b.charCodeAt(index)
  return diff === 0
}

/** Whether `state` belongs to a handoff (`fh.` + random), not to the cookie flow of `/auth/frigear`. */
export function isFrigearHandoffState(state: unknown): state is string {
  return typeof state === 'string' && state.startsWith(STATE_PREFIX) && state.length > STATE_PREFIX.length
}

/** The status the window sees: failed first, then expired (also a completed attempt nobody collected), then the rest. */
export function frigearHandoffStatusOf(row: Pick<FrigearHandoffRow, 'status' | 'expiresAt'>, now = Date.now()): FrigearHandoffStatus {
  if (row.status === 'failed') return 'failed'
  if (row.expiresAt.getTime() <= now) return 'expired'
  return row.status === 'complete' ? 'complete' : 'pending'
}

export function toFrigearHandoffDto(row: FrigearHandoffRow, now = Date.now()): FrigearHandoffDto {
  return { id: row.id, status: frigearHandoffStatusOf(row, now), error: row.status === 'failed' ? row.error : null, expiresAt: row.expiresAt.toISOString() }
}

/**
 * Stores a new attempt (and removes expired ones). Answers what only the caller may see: the window's `secret` (for its
 * cookie), the `state`, the PKCE challenge and the nonce for the authorization request. Only hashes of the secret and
 * the state are stored, and the PKCE verifier encrypted.
 */
export async function insertFrigearHandoff(input: { redirectUri: string, redirectTo?: string | null }, now = Date.now()) {
  const table = handoffTable()
  await db.delete(table).where(lt(table.expiresAt, new Date(now)))
  const id = `afh_${randomString(16)}`
  const secret = randomString(32)
  const state = `${STATE_PREFIX}${randomString(32)}`
  const codeVerifier = randomString(48)
  const nonce = randomString(24)
  const expiresAt = new Date(now + FRIGEAR_HANDOFF_TTL_SECONDS * 1000)
  await db.insert(table).values({
    id,
    secretHash: await sha256Hex(secret),
    stateHash: await sha256Hex(state),
    codeVerifier: await sealFrigearHandoffVerifier(id, codeVerifier),
    nonce,
    redirectUri: input.redirectUri,
    redirectTo: input.redirectTo ?? null,
    status: 'pending',
    expiresAt,
    createdAt: new Date(now),
  })
  return { id, secret, state, codeChallenge: await challengeFor(codeVerifier), nonce, expiresAt }
}

/** The attempt `id` when `secret` (the window's cookie) is its own; `undefined` when unknown or not this window's. */
export async function findFrigearHandoff(id: string, secret: string): Promise<FrigearHandoffRow | undefined> {
  const table = handoffTable()
  const row = await db.query.authFrigearHandoffs.findFirst({ where: eq(table.id, id) }) as FrigearHandoffRow | undefined
  if (!row || !equalStrings(row.secretHash, await sha256Hex(secret))) return undefined
  return row
}

/**
 * The browser came back with `state`: claims the pending, unexpired attempt for the code exchange (`exchanging`), once.
 * A replayed callback, or one for an expired or unknown attempt, gets `undefined`.
 */
export async function beginFrigearHandoffCallback(state: string, now = Date.now()): Promise<FrigearHandoffRow | undefined> {
  const table = handoffTable()
  const [row] = await db.update(table)
    .set({ status: 'exchanging' })
    .where(and(eq(table.stateHash, await sha256Hex(state)), eq(table.status, 'pending'), gt(table.expiresAt, new Date(now))))
    .returning()
  return row as FrigearHandoffRow | undefined
}

/** Records the outcome of the exchange: the signed-in user and the session data, or why it failed. */
export async function finishFrigearHandoff(id: string, outcome: { userId: number, sessionData: Record<string, unknown> } | { error: string }) {
  const table = handoffTable()
  const values = 'error' in outcome
    ? { status: 'failed', error: outcome.error.slice(0, 200) }
    : { status: 'complete', userId: outcome.userId, sessionData: outcome.sessionData }
  await db.update(table).set(values).where(and(eq(table.id, id), eq(table.status, 'exchanging')))
}

/** The browser came back with an error (`access_denied`, ...): fails the pending attempt so the window can say so. */
export async function failFrigearHandoffByState(state: string, error: string) {
  const table = handoffTable()
  await db.update(table)
    .set({ status: 'failed', error: error.slice(0, 200) })
    .where(and(eq(table.stateHash, await sha256Hex(state)), eq(table.status, 'pending')))
}

/**
 * Collects a completed, unexpired attempt for the window holding `secret`, once: the row is deleted as it is read, so
 * a second collection (or a race) gets `undefined`.
 */
export async function takeFrigearHandoff(id: string, secret: string, now = Date.now()): Promise<FrigearHandoffRow | undefined> {
  const table = handoffTable()
  const [row] = await db.delete(table)
    .where(and(eq(table.id, id), eq(table.secretHash, await sha256Hex(secret)), eq(table.status, 'complete'), gt(table.expiresAt, new Date(now))))
    .returning()
  return row as FrigearHandoffRow | undefined
}

/** Removes the attempt of the window holding `secret` (cancel, or after reading a failed one). */
export async function removeFrigearHandoff(id: string, secret: string) {
  const table = handoffTable()
  await db.delete(table).where(and(eq(table.id, id), eq(table.secretHash, await sha256Hex(secret))))
}

/** The authorization request for an attempt: authorization code with PKCE (S256) and a nonce; `uiLocales` (OIDC) when known. */
export function buildFrigearHandoffAuthorizeUrl(endpoint: string, params: { clientId: string, redirectUri: string, scopes: string[], state: string, nonce: string, codeChallenge: string, uiLocales?: string }) {
  const url = new URL(endpoint)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', params.clientId)
  url.searchParams.set('redirect_uri', params.redirectUri)
  url.searchParams.set('scope', params.scopes.join(' '))
  url.searchParams.set('state', params.state)
  url.searchParams.set('nonce', params.nonce)
  url.searchParams.set('code_challenge', params.codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  if (params.uiLocales) url.searchParams.set('ui_locales', params.uiLocales)
  return url.toString()
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1'])
const isLoopbackIp = (ip: string | undefined) => !!ip && (/^127\./.test(ip) || ip === '::1' || /^::ffff:127\./i.test(ip))

/**
 * Whether the request reached this server on a loopback address, from a loopback address: a desktop app's own server.
 * The handoff is only offered there. On a shared server someone could start an attempt and get a victim to finish
 * the browser half, which would sign the attacker's window in as the victim.
 */
export function isFrigearHandoffLoopback(event: H3Event) {
  const hostname = getRequestURL(event).hostname
  // `nuxt dev` serves through a proxy that leaves no socket and names the client in `X-Forwarded-For`.
  const ip = getRequestIP(event) ?? (import.meta.dev ? getRequestIP(event, { xForwardedFor: true }) : undefined)
  return LOOPBACK_HOSTS.has(hostname) && isLoopbackIp(ip)
}

/** The redirect URI of this server: `/auth/frigear` on the request origin, e.g. `http://127.0.0.1:43123/auth/frigear`. */
export function frigearHandoffRedirectUri(event: H3Event) {
  const url = getRequestURL(event, { xForwardedProto: true })
  return `${url.protocol}//${url.host}/auth/frigear`
}

/**
 * Starts an attempt for the window: stores it, sets the window's attempt cookie and answers the attempt with the
 * frigear.nu authorize URL to open in the system browser.
 */
export async function startFrigearHandoff(event: H3Event, sso: FrigearSsoConfig, options: { redirect?: string, scopes: string[], uiLocales?: string }): Promise<FrigearHandoffStartDto> {
  const metadata = await loadOAuthOpenIdConfiguration(sso.openidConfig).catch(() => undefined)
  if (!metadata?.authorization_endpoint || !metadata.token_endpoint) {
    throw apiError(502, 'issuer_unavailable', 'Could not load the sign-in configuration of frigear.nu.')
  }
  const redirectUri = frigearHandoffRedirectUri(event)
  const attempt = await insertFrigearHandoff({ redirectUri, redirectTo: isInternalPath(options.redirect) ? options.redirect : null })
  setCookie(event, FRIGEAR_HANDOFF_COOKIE, attempt.secret, {
    httpOnly: true,
    sameSite: 'strict',
    secure: getRequestURL(event).protocol === 'https:',
    path: COOKIE_PATH,
    maxAge: FRIGEAR_HANDOFF_TTL_SECONDS,
  })
  const authorizeUrl = buildFrigearHandoffAuthorizeUrl(metadata.authorization_endpoint, {
    clientId: sso.clientId,
    redirectUri,
    scopes: options.scopes,
    state: attempt.state,
    nonce: attempt.nonce,
    codeChallenge: attempt.codeChallenge,
    uiLocales: options.uiLocales,
  })
  return { id: attempt.id, status: 'pending', error: null, expiresAt: attempt.expiresAt.toISOString(), authorizeUrl }
}

/** The window's attempt secret: 401 without the cookie. */
export function requireFrigearHandoffSecret(event: H3Event): string {
  const secret = getCookie(event, FRIGEAR_HANDOFF_COOKIE)
  if (!secret) throw apiError(401, 'handoff_unauthorized', 'This window has no sign-in in progress.')
  return secret
}

/** Drops the window's attempt cookie. */
export function clearFrigearHandoffCookie(event: H3Event) {
  deleteCookie(event, FRIGEAR_HANDOFF_COOKIE, { path: COOKIE_PATH })
}

/** The attempt `id` of this window: 401 without the cookie, 403 when the attempt is unknown or another window's. */
export async function requireFrigearHandoff(event: H3Event, id: string): Promise<{ row: FrigearHandoffRow, secret: string }> {
  const secret = requireFrigearHandoffSecret(event)
  const row = await findFrigearHandoff(id, secret)
  // Unknown and someone else's answer the same, so ids cannot be probed.
  if (!row) throw apiError(403, 'handoff_forbidden', 'This sign-in was not started in this window.')
  return { row, secret }
}

/** Exchanges the code at frigear.nu's token endpoint (PKCE; the secret only when one is configured) and reads userinfo. */
async function exchangeFrigearHandoffCode(sso: FrigearSsoConfig, row: FrigearHandoffRow, code: string) {
  const metadata = await loadOAuthOpenIdConfiguration(sso.openidConfig)
  if (!metadata?.token_endpoint) throw new Error('frigear.nu has no token endpoint.')
  const codeVerifier = await openFrigearHandoffVerifier(row)
  if (!codeVerifier) throw new Error('The stored PKCE verifier does not decrypt (did `appSecret` change?).')
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: row.redirectUri,
    code_verifier: codeVerifier,
    client_id: sso.clientId,
  })
  if (sso.clientSecret) body.set('client_secret', sso.clientSecret)
  const tokens = await $fetch<Record<string, unknown>>(metadata.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
    body: body.toString(),
  })
  let userinfo: Record<string, unknown> = {}
  if (metadata.userinfo_endpoint && typeof tokens.access_token === 'string') {
    userinfo = await $fetch<Record<string, unknown>>(metadata.userinfo_endpoint, { headers: { Authorization: `Bearer ${tokens.access_token}` } })
  }
  return { tokens, userinfo }
}

/**
 * `GET /auth/frigear?code&state=fh.…` (or `?error&state=fh.…`) in the system browser: completes the attempt the
 * state names and answers a small page saying so. Never sets a session here; the window collects it.
 */
export async function handleFrigearHandoffCallback(event: H3Event, sso: FrigearSsoConfig) {
  const { code, state, error } = getQuery(event)
  if (!isFrigearHandoffState(state)) return frigearHandoffPage(event, sso, false)
  if (typeof error === 'string' || typeof code !== 'string' || !code) {
    await failFrigearHandoffByState(state, typeof error === 'string' && /^[\w-]{1,64}$/.test(error) ? error : 'invalid_callback')
    return frigearHandoffPage(event, sso, false)
  }
  const row = await beginFrigearHandoffCallback(state)
  if (!row) return frigearHandoffPage(event, sso, false)
  try {
    const { tokens, userinfo } = await exchangeFrigearHandoffCode(sso, row, code)
    const result = await resolveFrigearLogin(sso, userinfo, tokens, { nonce: row.nonce })
    if ('error' in result) {
      await finishFrigearHandoff(row.id, { error: result.error })
      return frigearHandoffPage(event, sso, false)
    }
    await finishFrigearHandoff(row.id, { userId: Number(result.user.id), sessionData: result.session })
    return frigearHandoffPage(event, sso, true)
  }
  catch (cause) {
    const code = (cause as { data?: { code?: string } }).data?.code
    console.error('[@frigear-nu/auth] frigear.nu browser sign-in failed:', cause)
    await finishFrigearHandoff(row.id, { error: typeof code === 'string' ? code : 'exchange_failed' })
    return frigearHandoffPage(event, sso, false)
  }
}

const PAGE_TEXT = {
  en: {
    title: 'Signed in',
    done: 'You are signed in. You can close this tab and return to the app.',
    openApp: 'Return to the app',
    failedTitle: 'Sign-in failed',
    failed: 'The sign-in could not be completed. Return to the app and try again.',
  },
  da: {
    title: 'Logget ind',
    done: 'Du er logget ind. Du kan lukke fanen og vende tilbage til appen.',
    openApp: 'Tilbage til appen',
    failedTitle: 'Log ind mislykkedes',
    failed: 'Log ind kunne ikke gennemføres. Vend tilbage til appen og prøv igen.',
  },
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`)

/** A deep link to bring the app forward (`frigear.handoff.returnUrl`): a URL with a scheme, never script or data. */
export function safeFrigearHandoffReturnUrl(value: string): string | undefined {
  if (!/^[a-z][a-z\d+.-]*:/i.test(value)) return undefined
  return /^(?:javascript|data|vbscript|file):/i.test(value) ? undefined : value
}

/**
 * The browser's page after the callback, in Danish or English (`Accept-Language`). With `frigear.handoff.returnUrl` it
 * offers (and tries once) the deep link that brings the app forward; the window does not depend on it.
 */
function frigearHandoffPage(event: H3Event, sso: FrigearSsoConfig, success: boolean) {
  const language = /^da\b/i.test(getRequestHeader(event, 'accept-language') ?? '') ? 'da' : 'en'
  const text = PAGE_TEXT[language]
  const returnUrl = success ? safeFrigearHandoffReturnUrl(sso.handoff.returnUrl) : undefined
  setResponseStatus(event, success ? 200 : 400)
  setResponseHeader(event, 'content-type', 'text/html; charset=utf-8')
  setResponseHeader(event, 'cache-control', 'no-store')
  setResponseHeader(event, 'referrer-policy', 'no-referrer')
  const title = success ? text.title : text.failedTitle
  const link = returnUrl
    ? `<p><a href="${escapeHtml(returnUrl)}">${escapeHtml(text.openApp)}</a></p><script>location.href=${JSON.stringify(returnUrl).replace(/</g, '\\u003c')}</script>`
    : ''
  return `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title>`
    + `<style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem;line-height:1.5;color:#111;background:#fff}@media (prefers-color-scheme:dark){body{color:#eee;background:#111}a{color:#8ab4f8}}</style></head>`
    + `<body><h1>${escapeHtml(title)}</h1><p>${escapeHtml(success ? text.done : text.failed)}</p>${link}</body></html>`
}
