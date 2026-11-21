import { $fetch, fetch } from '@nuxt/test-utils/e2e'
import { expect } from 'vitest'
import { authApi } from '@frigear-nu/auth/api'

export async function registerUser(name: string, email: string) {
  const response = await fetch(authApi.register, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, email, password: 'supersecret123' }),
  })
  expect(response.status, await response.clone().text()).toBeLessThan(300)
  const body = await response.json() as { id: number | string }
  return { cookie: response.headers.get('set-cookie')!, id: Number(body.id) }
}

/** Gives the signed-in user a plan, standing in for an active subscription (fixture-only route). */
export async function givePlan(cookie: string, plan: string) {
  await $fetch('/api/test/plan', { method: 'POST', headers: { cookie }, body: { plan } })
}

/** The teams hooks that fired for one team, in order (fixture-only route). */
export async function getHooksFor(teamId: string) {
  const log = await $fetch<Array<{ name: string, teamId: string, userId: number, role: string, from?: string, to?: string }>>('/api/test/hooks')
  return log.filter(entry => entry.teamId === teamId)
}

/** What `teams:owner:resolve` answers for an owner (fixture-only route). */
export const getOwner = (type: string, id: string) =>
  $fetch<{ label: string | Record<string, string> | null, exists: boolean | null }>('/api/test/owner', { query: { type, id } })
