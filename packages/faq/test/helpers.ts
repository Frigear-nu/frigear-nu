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

/** Puts the signed-in user in a club of the fixture's `club` grant kind (fixture-only route). */
export async function joinClub(cookie: string, clubId: string) {
  await $fetch('/api/test/club', { method: 'POST', headers: { cookie }, body: { clubId } })
}

/** The FAQ hooks that fired so far, in order (fixture-only route). */
export const getHookLog = () => $fetch<Array<{ name: string, groupId: string, itemId?: string, publishedCount?: number }>>('/api/test/hooks')
