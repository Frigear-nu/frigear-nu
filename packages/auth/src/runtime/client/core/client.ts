import { discover, endpointsFrom, normalizeIssuer } from './discovery'
import {
  OAuthAuthorizationError,
  OAuthConfigError,
  OAuthError,
  OAuthSessionError,
  OAuthTransientError,
  classifyTokenError,
  networkError,
} from './errors'
import { decodeJwtPayload, validateIdToken } from './jwt'
import { createDefaultLock } from './lock'
import { isCallbackUrlFor, shouldAttachToken } from './urls'
import { createPkcePair, randomString } from './pkce'
import { defaultStorageKeyPrefix, memoryStorage, storageKeys } from './storage'
import type {
  AuthorizationServerMetadata,
  AuthorizationUserAgent,
  IdTokenClaims,
  OAuthChangeEvent,
  OAuthClient,
  OAuthClientOptions,
  OAuthEndpoints,
  OAuthTokens,
  SignOutReason,
  UserInfo,
} from './types'

interface Pending {
  state: string
  verifier: string
  nonce?: string
  redirectUri: string
  returnTo: string | null
  createdAt: number
}

interface TokenResponse {
  access_token?: string
  token_type?: string
  refresh_token?: string
  id_token?: string
  expires_in?: number | string
  scope?: string
}

/** A same-window redirect: the browser comes back to the redirect URI, where the app calls `handleCallback`. */
export const redirectUserAgent = (): AuthorizationUserAgent => ({
  async open(url) {
    globalThis.location.assign(url)
  },
})

/** Started authorizations by `state`, so sign-ins started in two tabs do not replace each other. */
type PendingMap = Record<string, Pending>

/** At most this many authorizations wait at once; the oldest are dropped. */
const MAX_PENDING = 5

const toScope = (scope: OAuthClientOptions['scope']) =>
  (Array.isArray(scope) ? scope.join(' ') : scope ?? 'openid').split(/\s+/).filter(Boolean).join(' ')

/**
 * OAuth 2.1 authorization code + PKCE client for public clients (native apps, SPAs). It only needs `fetch` and
 * WebCrypto, so it runs in browsers, webviews, Node and workers. Works with `@frigear-nu/oauth-server` and any
 * standards compliant OpenID Connect provider.
 *
 * Refresh tokens are expected to rotate: a refresh token is single use, and using one twice makes the server revoke
 * the whole token family. Refreshes therefore run one at a time (single-flight within the page, a Web Lock across
 * tabs) and re-read the storage first, so a token another tab already rotated is picked up instead of reused.
 */
export function createOAuthClient(options: OAuthClientOptions): OAuthClient {
  const { clientId, redirectUri, clientSecret } = options
  if (!options.issuer) throw new OAuthConfigError('missing_issuer', 'The OAuth client has no issuer.')
  if (!clientId) throw new OAuthConfigError('missing_client_id', 'The OAuth client has no client id.')
  if (!redirectUri) throw new OAuthConfigError('missing_redirect_uri', 'The OAuth client has no redirect URI.')

  const issuer = normalizeIssuer(options.issuer)
  const scope = toScope(options.scope)
  const storage = options.storage ?? memoryStorage()
  const transient = options.transientStorage ?? storage
  const keys = storageKeys(options.storageKeyPrefix ?? defaultStorageKeyPrefix(clientId))
  const doFetch: typeof fetch = options.fetch ?? ((...args) => globalThis.fetch(...args))
  const now = options.now ?? Date.now
  const rewriteUrl = options.rewriteUrl ?? ((url: string) => url)
  const lock = options.lock ?? createDefaultLock()
  const userAgent = options.userAgent ?? redirectUserAgent()
  const skewMs = (options.refreshSkewSeconds ?? 30) * 1000
  const pendingTtlMs = (options.pendingTtlSeconds ?? 3600) * 1000
  const lockName = `oauth-client:${issuer}:${clientId}:refresh`
  const pendingLockName = `oauth-client:${issuer}:${clientId}:pending`
  const sameIssuer = (value: string) => rewriteUrl(normalizeIssuer(value))
  const timeoutMs = options.requestTimeoutSeconds === undefined ? 15_000 : options.requestTimeoutSeconds * 1000
  const warn = options.onWarning ?? ((message: string, error?: unknown) => console.warn(`[@frigear-nu/auth] ${message}`, error ?? ''))
  const attachTo = options.attachTo ?? [issuer]

  /** Every request to the authorization server gives up after `requestTimeoutSeconds`, so no lock is held forever. */
  const serverFetch: typeof fetch = (input, init = {}) => {
    const timeout = timeoutMs > 0 && typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
      ? AbortSignal.timeout(timeoutMs)
      : undefined
    return doFetch(input, timeout && !init.signal ? { ...init, signal: timeout } : init)
  }

  const listeners = new Set<(event: OAuthChangeEvent) => void>()
  const emit = (event: OAuthChangeEvent) => {
    for (const listener of listeners) {
      try {
        listener(event)
      }
      catch {
        // A failing listener must not break the flow that emitted.
      }
    }
  }

  let endpoints: Promise<OAuthEndpoints> | null = null
  let metadata: AuthorizationServerMetadata | null = null
  const getEndpoints = () => {
    endpoints ??= (async () => {
      metadata = options.discovery === false ? null : await discover({ issuer, fetch: serverFetch, rewriteUrl })
      const resolved = endpointsFrom(issuer, metadata, options.endpoints)
      return Object.fromEntries(Object.entries(resolved).map(([key, url]) => [key, rewriteUrl(url)])) as unknown as OAuthEndpoints
    })().catch((error) => {
      endpoints = null
      throw error
    })
    return endpoints
  }

  const readJson = async <T>(store: typeof storage, key: string): Promise<T | null> => {
    const raw = await store.get(key)
    if (!raw) return null
    try {
      return JSON.parse(raw) as T
    }
    catch {
      await store.remove(key)
      return null
    }
  }
  const readTokens = () => readJson<OAuthTokens>(storage, keys.tokens)
  const readPending = async (): Promise<PendingMap> => {
    const map = await readJson<PendingMap | Pending>(transient, keys.pending)
    if (!map || typeof map !== 'object') return {}
    // A single entry, as 0.1.0 stored it.
    if (typeof (map as Pending).state === 'string') return { [(map as Pending).state]: map as Pending }
    return map as PendingMap
  }
  /** Changes the pending authorizations under a lock, dropping expired and surplus ones. */
  const updatePending = (change: (map: PendingMap) => PendingMap) => lock(pendingLockName, async () => {
    const map = change(await readPending())
    const live = Object.values(map)
      .filter(entry => now() - entry.createdAt <= pendingTtlMs)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, MAX_PENDING)
    if (live.length) await transient.set(keys.pending, JSON.stringify(Object.fromEntries(live.map(entry => [entry.state, entry]))))
    else await transient.remove(keys.pending)
  })
  const writeTokens = (tokens: OAuthTokens) => storage.set(keys.tokens, JSON.stringify(tokens))
  const isFresh = (tokens: OAuthTokens) => tokens.expiresAt - now() > skewMs

  async function post(url: string, params: Record<string, string>): Promise<Response> {
    const body = new URLSearchParams({ client_id: clientId, ...params })
    if (clientSecret) body.set('client_secret', clientSecret)
    try {
      return await serverFetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', 'accept': 'application/json' },
        body,
      })
    }
    catch (cause) {
      throw networkError(url, cause)
    }
  }

  async function tokenRequest(params: Record<string, string>, previous: OAuthTokens | null, nonce?: string): Promise<OAuthTokens> {
    const { token } = await getEndpoints()
    const response = await post(token, params)
    let json: TokenResponse & { error?: unknown, error_description?: unknown }
    try {
      json = await response.json()
    }
    catch {
      json = {}
    }
    if (!response.ok) throw classifyTokenError(response.status, json)
    if (!json.access_token) throw new OAuthTransientError('invalid_token_response', 'The token response has no access_token.', { status: response.status })

    let idToken = json.id_token ?? null
    if (idToken && !previous) {
      // Sign-in: the id_token must be for us and answer our nonce. Not checked against the clock, which may be off.
      // A rejected one fails the sign-in: its tokens are never stored and the refresh token is revoked (best effort).
      try {
        validateIdToken(idToken, { issuer, clientId, nonce, normalizeIssuer: sameIssuer })
      }
      catch (error) {
        if (json.refresh_token) void revoke(json.refresh_token)
        throw error
      }
    }
    else if (idToken && previous) {
      // Refresh: the new tokens are stored whatever happens (the old refresh token is spent); a bad id_token only
      // means the previous claims are kept.
      try {
        const subject = previous.idToken ? decodeJwtPayload<IdTokenClaims>(previous.idToken).sub : undefined
        validateIdToken(idToken, { issuer, clientId, subject, normalizeIssuer: sameIssuer })
      }
      catch (error) {
        warn('The refreshed id_token was not accepted; keeping the previous claims.', error)
        idToken = null
      }
    }
    const expiresIn = Number(json.expires_in)
    return {
      accessToken: json.access_token,
      // Servers that do not rotate omit `refresh_token` on refresh: the one we have stays valid.
      refreshToken: json.refresh_token ?? previous?.refreshToken ?? null,
      idToken: idToken ?? previous?.idToken ?? null,
      tokenType: json.token_type ?? 'Bearer',
      expiresAt: now() + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600) * 1000,
      scope: json.scope ?? previous?.scope ?? scope,
      sessionId: previous ? previous.sessionId : randomString(16),
    }
  }

  async function clear(reason: SignOutReason): Promise<OAuthTokens | null> {
    const tokens = await readTokens()
    await storage.remove(keys.tokens)
    if (tokens) emit({ type: 'signed-out', tokens: null, reason })
    return tokens
  }

  /** Runs under the lock: re-reads the storage, and only refreshes when nobody else has meanwhile. */
  const refreshTokens = (seen: OAuthTokens, force: boolean) => lock(lockName, async (): Promise<OAuthTokens | null> => {
    const latest = await readTokens()
    if (!latest) return null
    // Another caller or tab rotated the tokens while we waited: use theirs, never reuse the old refresh token.
    if (latest.refreshToken !== seen.refreshToken || latest.accessToken !== seen.accessToken) return latest
    if (!force && isFresh(latest)) return latest
    if (!latest.refreshToken) {
      await clear('no_refresh_token')
      return null
    }
    try {
      const next = await tokenRequest({ grant_type: 'refresh_token', refresh_token: latest.refreshToken }, latest)
      await writeTokens(next)
      emit({ type: 'refreshed', tokens: next })
      return next
    }
    catch (error) {
      if (error instanceof OAuthSessionError) {
        await clear('invalid_grant')
        return null
      }
      const failure = error instanceof OAuthError ? error : new OAuthTransientError('refresh_failed', String(error), { cause: error })
      emit({ type: 'refresh-failed', tokens: latest, error: failure })
      throw failure
    }
  })

  let refreshing: Promise<OAuthTokens | null> | null = null

  /** Revokes a refresh token, best effort: the local session is gone either way. */
  async function revoke(refreshToken: string) {
    try {
      const { revocation } = await getEndpoints()
      if (revocation) await post(revocation, { token: refreshToken, token_type_hint: 'refresh_token' })
    }
    catch {
      // Ignored.
    }
  }

  /** `fetch` with the bearer token (when `attach`), one forced refresh and retry on 401. */
  async function authorizedFetch(input: string | URL, init: RequestInit, attach: boolean, send$: typeof fetch): Promise<Response> {
    const token = attach ? await client.getAccessToken() : null
    const send = async (accessToken: string | null) => {
      const headers = new Headers(init.headers)
      if (accessToken) headers.set('authorization', `Bearer ${accessToken}`)
      try {
        return await send$(input, { ...init, headers })
      }
      catch (cause) {
        throw networkError(String(input), cause)
      }
    }
    const response = await send(token)
    if (response.status !== 401 || !token) return response
    // A failed refresh (offline, server error) surfaces as its error; an ended session as the 401 itself.
    const next = await client.getAccessToken({ forceRefresh: true, ifCurrent: token })
    if (!next || next === token) return response
    return send(next)
  }

  const client: OAuthClient = {
    clientId,
    redirectUri,
    getEndpoints,

    async startAuthorization({ returnTo, params } = {}) {
      const { authorization } = await getEndpoints()
      const { verifier, challenge } = await createPkcePair()
      const state = randomString(24)
      const nonce = scope.split(' ').includes('openid') ? randomString(24) : undefined
      const pending: Pending = { state, verifier, nonce, redirectUri, returnTo: returnTo ?? null, createdAt: now() }
      await updatePending(map => ({ ...map, [state]: pending }))

      const url = new URL(authorization)
      // Extra parameters first, so they can never replace the ones the security of the flow depends on.
      for (const [key, value] of Object.entries({ ...options.authorizationParams, ...params })) url.searchParams.set(key, value)
      const required: Record<string, string> = {
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope,
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
      }
      if (nonce) required.nonce = nonce
      for (const [key, value] of Object.entries(required)) url.searchParams.set(key, value)
      return { url: url.toString(), state }
    },

    async authorize({ onDismissed, ...rest } = {}) {
      const request = await client.startAuthorization(rest)
      await userAgent.open(request.url, { redirectUri, onDismissed })
      return request
    },

    isCallbackUrl: url => isCallbackUrlFor(redirectUri, url),

    async matchesPendingAuthorization(url) {
      if (!isCallbackUrlFor(redirectUri, url)) return false
      const state = new URL(url).searchParams.get('state')
      const entry = state ? (await readPending())[state] : undefined
      return !!entry && now() - entry.createdAt <= pendingTtlMs
    },

    async handleCallback(callbackUrl) {
      let params: URLSearchParams
      try {
        params = new URL(callbackUrl).searchParams
      }
      catch {
        throw new OAuthAuthorizationError('invalid_callback', 'The redirect URL is not valid.')
      }

      // A URL whose state matches no started sign-in is ignored without touching the ones in progress, so a forged
      // callback cannot cancel a real sign-in.
      const waiting = await readPending()
      const state = params.get('state')
      const pending = state ? waiting[state] : undefined
      if (!pending) {
        throw Object.keys(waiting).length
          ? new OAuthAuthorizationError('invalid_state', 'The state parameter does not match.')
          : new OAuthAuthorizationError('no_pending_authorization', 'No sign-in is in progress.')
      }
      // Single use: a replayed callback can never reuse this verifier.
      await updatePending(map => Object.fromEntries(Object.entries(map).filter(([key]) => key !== pending.state)))

      if (now() - pending.createdAt > pendingTtlMs) throw new OAuthAuthorizationError('expired_authorization', 'The sign-in took too long. Start again.')
      // RFC 9207: a server that names itself must be the one we sent the user to, and one that says it always does
      // must have.
      await getEndpoints()
      const iss = params.get('iss')
      if (iss && sameIssuer(iss) !== sameIssuer(issuer)) throw new OAuthAuthorizationError('issuer_mismatch', `The response came from "${iss}", not "${issuer}".`)
      if (!iss && metadata?.authorization_response_iss_parameter_supported === true) {
        throw new OAuthAuthorizationError('issuer_missing', 'The authorization response has no iss parameter.')
      }

      const error = params.get('error')
      if (error) throw new OAuthAuthorizationError(error, params.get('error_description') ?? 'The sign-in was not completed.')

      const code = params.get('code')
      if (!code) throw new OAuthAuthorizationError('invalid_callback', 'The redirect URL has no authorization code.')

      let tokens: OAuthTokens
      try {
        tokens = await tokenRequest({
          grant_type: 'authorization_code',
          code,
          redirect_uri: pending.redirectUri,
          code_verifier: pending.verifier,
        }, null, pending.nonce)
      }
      catch (cause) {
        // A rejected code is a failed sign-in, not an ended session: there was none.
        if (cause instanceof OAuthSessionError) throw new OAuthAuthorizationError(cause.code, cause.message, { status: cause.status, cause })
        throw cause
      }
      if (options.requireIdToken && !tokens.idToken) {
        // Never stored, so the app is never signed in without knowing who; the refresh token is revoked (best effort).
        if (tokens.refreshToken) void revoke(tokens.refreshToken)
        throw new OAuthAuthorizationError('missing_id_token', 'The sign-in returned no id_token. Request the `openid` scope.')
      }
      await lock(lockName, () => writeTokens(tokens))
      emit({ type: 'signed-in', tokens })
      return { tokens, returnTo: pending.returnTo }
    },

    async getAccessToken({ forceRefresh = false, ifCurrent } = {}) {
      const tokens = await readTokens()
      if (!tokens) return null
      if (!forceRefresh && isFresh(tokens)) return tokens.accessToken
      if (forceRefresh && ifCurrent !== undefined && tokens.accessToken !== ifCurrent) return tokens.accessToken

      refreshing ??= refreshTokens(tokens, forceRefresh).finally(() => {
        refreshing = null
      })
      return (await refreshing)?.accessToken ?? null
    },

    getTokens: readTokens,

    async isAuthenticated() {
      return (await readTokens()) !== null
    },

    async getClaims(): Promise<IdTokenClaims | null> {
      const tokens = await readTokens()
      if (!tokens?.idToken) return null
      try {
        return decodeJwtPayload<IdTokenClaims>(tokens.idToken)
      }
      catch {
        return null
      }
    },

    async fetchUserInfo(): Promise<UserInfo> {
      const { userinfo } = await getEndpoints()
      if (!userinfo) throw new OAuthConfigError('no_userinfo_endpoint', `${issuer} has no userinfo endpoint.`)
      const response = await authorizedFetch(userinfo, { headers: { accept: 'application/json' } }, true, serverFetch)
      if (response.status === 401) throw new OAuthSessionError('invalid_token', 'The access token was refused.', { status: 401 })
      if (response.status === 429 || response.status >= 500) throw new OAuthTransientError('server_error', `userinfo failed (${response.status}).`, { status: response.status })
      if (!response.ok) throw new OAuthConfigError('userinfo_failed', `userinfo failed (${response.status}).`, { status: response.status })
      return await response.json() as UserInfo
    },

    fetch: (input, init = {}) => authorizedFetch(input, init, shouldAttachToken(String(input), globalThis.location?.href, attachTo.map(rewriteUrl)), doFetch),

    async logout() {
      // Under the lock, so a refresh in flight cannot write tokens back after we cleared them.
      const tokens = await lock(lockName, () => clear('logout'))
      await transient.remove(keys.pending)
      if (tokens?.refreshToken) await revoke(tokens.refreshToken)
    },

    async signOutLocally(reason = 'unauthorized') {
      await lock(lockName, () => clear(reason))
    },

    onChange(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
  }
  return client
}
