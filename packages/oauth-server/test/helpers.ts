import { createHash, randomBytes } from 'node:crypto'
import { fetch } from '@nuxt/test-utils/e2e'
import { expect } from 'vitest'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loosely typed JSON responses
export type Json = Record<string, any>

export const CALLBACK = 'https://app.example.com/auth/frigear'

export async function registerUser(name: string, email: string) {
  const response = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, email, password: 'supersecret123' }),
  })
  expect(response.status, await response.clone().text()).toBe(200)
  const cookie = response.headers.get('set-cookie')!
  const me = await fetch('/api/_auth/session', { headers: { cookie } }).then(r => r.json()) as Json
  return { cookie, id: me.user.id as number }
}

export type Session = Awaited<ReturnType<typeof registerUser>>

export const json = (cookie: string | undefined, method: string, path: string, body?: unknown) => fetch(path, {
  method,
  headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
  body: body === undefined ? undefined : JSON.stringify(body),
})

export async function ok(response: Response): Promise<Json> {
  expect(response.status, await response.clone().text()).toBeLessThan(300)
  return response.status === 204 ? {} : response.json() as Promise<Json>
}

export function pkce() {
  const verifier = randomBytes(32).toString('base64url')
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') }
}

export function authorizeQuery(clientId: string, challenge: string, extra: Record<string, string> = {}) {
  return new URLSearchParams({
    client_id: clientId,
    redirect_uri: CALLBACK,
    response_type: 'code',
    state: 'state-123',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    ...extra,
  })
}

export const basic = (id: string, secret: string) => `Basic ${Buffer.from(`${encodeURIComponent(id)}:${encodeURIComponent(secret)}`).toString('base64')}`

export const form = (path: string, body: Record<string, string>, headers: Record<string, string> = {}) => fetch(path, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
  body: new URLSearchParams(body).toString(),
})
