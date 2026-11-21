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

type TeamRole = { ownerType: string, ownerId: string | null, teamId: string, kind: string, role: string, source: 'explicit' | 'mapped' }

/** Tells the fixture's `audience:viewer:resolve` listener what teams and crew would report for the signed-in user. */
export async function setViewer(cookie: string, state: { operationIds?: string[], teamRoles?: TeamRole[] }) {
  await $fetch('/api/test/viewer', { method: 'POST', headers: { cookie }, body: state })
}

/** The FAQ hooks that fired so far, in order (fixture-only route). */
export const getHookLog = () => $fetch<Array<{ name: string, groupId: string, itemId?: string, publishedCount?: number }>>('/api/test/hooks')
