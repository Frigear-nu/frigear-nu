import type { AccessDto } from '../../utils/permissions'
import { authApi } from '../../utils/api'
import { decodeJwtPayload } from '../core/jwt'
import type { OAuthClient } from '../core/types'

/**
 * What a client-mode user may do according to the access token alone: its `permissions` claim (frozen when the issuer
 * issued it) and its `scope`. The token is decoded, not verified: this only decides what the UI shows, the API it is
 * sent to checks the token itself. `null` without a token; an opaque (non-JWT) token, or one without the claim, holds
 * no permissions.
 */
export function accessFromAccessToken(token: string | null | undefined): AccessDto | null {
  if (!token) return null
  let claims: Record<string, unknown>
  try {
    claims = decodeJwtPayload<Record<string, unknown>>(token)
  }
  catch {
    return { kind: 'oauth', scopes: [], permissions: [] }
  }
  const strings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  const scopes = typeof claims.scope === 'string' ? claims.scope.split(/\s+/).filter(Boolean) : strings(claims.scope)
  return { kind: 'oauth', scopes, permissions: [...new Set(strings(claims.permissions))] }
}

/** The `$fetch` the issuer is asked with. */
export type IssuerAccessRequest = <T>(url: string, options: { baseURL: string, headers: Record<string, string> }) => Promise<T>

export interface LoadIssuerAccessOptions {
  client: Pick<OAuthClient, 'getAccessToken'>
  request: IssuerAccessRequest
  /** The issuer's origin (after the loopback rewrite on a device). */
  issuer: string
}

const isAccessDto = (value: unknown): value is AccessDto => !!value && typeof value === 'object'
  && Array.isArray((value as AccessDto).permissions) && (value as AccessDto).permissions.every(item => typeof item === 'string')

/**
 * Client mode's `access`: the issuer's `GET /api/auth/me/access` with the bearer access token (the exact list the
 * issuer computes now). When the issuer cannot answer (no such endpoint, such as a 404 from an issuer that is not a
 * frigear app, or offline, or any other failure) it falls back to the token's own `permissions` claim
 * (`accessFromAccessToken`). `null` when nobody is signed in. UI only: the API decides what is allowed.
 */
export async function loadIssuerAccess({ client, request, issuer }: LoadIssuerAccessOptions): Promise<AccessDto | null> {
  const token = await client.getAccessToken()
  if (!token) return null
  try {
    const access = await request<unknown>(authApi.me.access, { baseURL: issuer, headers: { authorization: `Bearer ${token}` } })
    if (isAccessDto(access)) return access
  }
  catch {
    // Falls back to the claim below.
  }
  return accessFromAccessToken(token)
}
