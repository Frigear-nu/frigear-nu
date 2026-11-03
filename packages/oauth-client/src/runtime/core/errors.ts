/**
 * What kind of failure an error is, which decides what the app does with the session:
 *
 * - `session`: the server ended it (`invalid_grant`: refresh token expired, revoked or reused). The tokens are gone.
 * - `config`: the client is set up wrong (`invalid_client`, unknown endpoints, issuer mismatch). Fix the config.
 * - `transient`: network, `429`, `5xx`. The tokens are kept; try again later.
 * - `authorization`: the authorization request failed (`access_denied`, bad `state`, invalid id_token).
 */
export type OAuthErrorKind = 'session' | 'config' | 'transient' | 'authorization'

export class OAuthError extends Error {
  readonly kind: OAuthErrorKind
  /** The OAuth `error` code (`invalid_grant`, `access_denied`, ...) or one of the client's own (`invalid_state`). */
  readonly code: string
  readonly status?: number

  constructor(kind: OAuthErrorKind, code: string, message: string, options: { status?: number, cause?: unknown } = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'OAuthError'
    this.kind = kind
    this.code = code
    this.status = options.status
  }
}

/** The session ended on the server: the stored tokens were removed. */
export class OAuthSessionError extends OAuthError {
  constructor(code: string, message: string, options: { status?: number, cause?: unknown } = {}) {
    super('session', code, message, options)
    this.name = 'OAuthSessionError'
  }
}

/** The client configuration is wrong. Retrying will not help. */
export class OAuthConfigError extends OAuthError {
  constructor(code: string, message: string, options: { status?: number, cause?: unknown } = {}) {
    super('config', code, message, options)
    this.name = 'OAuthConfigError'
  }
}

/** Network, rate limit or server error. The session is kept. */
export class OAuthTransientError extends OAuthError {
  constructor(code: string, message: string, options: { status?: number, cause?: unknown } = {}) {
    super('transient', code, message, options)
    this.name = 'OAuthTransientError'
  }
}

/** The authorization response could not be completed. */
export class OAuthAuthorizationError extends OAuthError {
  constructor(code: string, message: string, options: { status?: number, cause?: unknown } = {}) {
    super('authorization', code, message, options)
    this.name = 'OAuthAuthorizationError'
  }
}

const CONFIG_CODES = new Set(['invalid_client', 'unauthorized_client', 'unsupported_grant_type', 'invalid_scope', 'invalid_request'])
const SESSION_CODES = new Set(['invalid_grant', 'access_denied', 'login_required', 'consent_required', 'interaction_required'])

/**
 * Classifies an error response of the token endpoint (RFC 6749 §5.2). `429` and `5xx` are transient whatever their
 * body says; `401` is `invalid_client`; unknown `4xx` codes end the session, since repeating the request cannot work.
 */
export function classifyTokenError(status: number, body: { error?: unknown, error_description?: unknown }): OAuthError {
  const code = typeof body.error === 'string' && body.error ? body.error : undefined
  const description = typeof body.error_description === 'string' && body.error_description
    ? body.error_description
    : `The token request failed (${status}${code ? ` ${code}` : ''}).`
  if (status === 429 || status >= 500) return new OAuthTransientError(code ?? 'server_error', description, { status })
  if (code && SESSION_CODES.has(code)) return new OAuthSessionError(code, description, { status })
  if ((code && CONFIG_CODES.has(code)) || status === 401) return new OAuthConfigError(code ?? 'invalid_client', description, { status })
  return new OAuthSessionError(code ?? 'invalid_grant', description, { status })
}

/** A `fetch` that threw (offline, DNS, CORS) as a transient error. */
export const networkError = (url: string, cause: unknown) =>
  new OAuthTransientError('network_error', `Could not reach ${url}.`, { cause })
