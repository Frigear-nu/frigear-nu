import { $fetch, fetch } from '@nuxt/test-utils/e2e'
import { expect } from 'vitest'
import { authApi } from '@frigear-nu/auth/api'
import { apiClient } from '@frigear-nu/module-kit/testing'

let counter = 0

/** Registers a user; the role follows the email domain (see the fixture's `server/roles/provider.ts`). */
export async function registerUser(name: string, domain = 'example.com') {
  const email = `${name.toLowerCase()}${++counter}@${domain}`
  const response = await fetch(authApi.register, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, email, password: 'supersecret123' }),
  })
  expect(response.status, await response.clone().text()).toBeLessThan(300)
  return { cookie: response.headers.get('set-cookie')!, email }
}

/** An API token of the signed-in user with these scopes. */
export async function createToken(cookie: string, scopes: string[]): Promise<string> {
  const created = await apiClient({ cookie }).json<{ token: string }>('POST', authApi.me.tokens, { name: 'test', scopes })
  return created.token
}

/** Gives the signed-in user a team role, as teams would report it (fixture-only route). */
export const grantTeamRole = (cookie: string, kind: string, role: string) =>
  $fetch('/api/test/team-role', { method: 'POST', headers: { cookie }, body: { kind, role } })

/** Calls `ensureMap` on the server (fixture-only route). */
export const ensureMapOnServer = <T = Record<string, unknown>>(definition: Record<string, unknown>) =>
  $fetch<T>('/api/test/ensure', { method: 'POST', body: definition })

/** The `maps:feature:*` hooks that fired and how often `maps:seed:resolve` was asked (fixture-only route). */
export const getMapsLog = () => $fetch<{ hooks: Array<{ name: string, featureId: string, mapId: string, previousLabel?: unknown }>, seedCalls: number }>('/api/test/log')

/** Posts a multipart form as `cookie`, returning the raw response. */
export function postForm(path: string, form: FormData, cookie?: string) {
  return fetch(path, { method: 'POST', headers: cookie ? { cookie } : {}, body: form })
}
