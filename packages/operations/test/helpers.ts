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
  return { cookie: response.headers.get('set-cookie')! }
}

/** Makes the signed-in user "take part in" an operation, the way crew would report it (fixture-only route). */
export async function participate(cookie: string, operationId: string) {
  await $fetch('/api/test/participate', { method: 'POST', headers: { cookie }, body: { operationId } })
}

/** What the `operations:status-changed` hook received so far (fixture-only route). */
export const getStatusChanges = () => $fetch<Array<{ id: string, from: string, to: string }>>('/api/test/status-changes')

/** How a grant list evaluates for the caller, and who it lists (fixture-only route). */
export const evaluateGrants = (cookie: string | undefined, grants: unknown[]) =>
  $fetch<{ matches: boolean, members: string[] }>('/api/test/grant', { method: 'POST', headers: cookie ? { cookie } : {}, body: { grants } })

/** Runs the kinds' reference checks on a grant list (fixture-only route): the raw response. */
export const validateGrants = (grants: unknown[]) =>
  fetch('/api/test/grant', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ grants, validate: true }) })

/** The operations hooks that fired for one operation, in order (fixture-only route). */
export async function getHooksFor(id: string) {
  const log = await $fetch<Array<{ name: string, id: string }>>('/api/test/hooks')
  return log.filter(entry => entry.id === id).map(entry => entry.name)
}
