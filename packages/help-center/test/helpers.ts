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
  return { cookie: response.headers.get('set-cookie')!, id: String(body.id) }
}

type TeamRole = { ownerType: string, ownerId: string | null, teamId: string, kind: string, role: string, source: 'explicit' | 'mapped' }

/** Tells the fixture's `audience:viewer:resolve` listener what teams and crew would report for the signed-in user. */
export async function setViewer(cookie: string, state: { operationIds?: string[], teamRoles?: TeamRole[] }) {
  await $fetch('/api/test/viewer', { method: 'POST', headers: { cookie }, body: state })
}

/** Says which users `help-center:audience:resolve` returns for an operation or a team id (what crew or teams would answer). */
export async function setAudience(key: string, userIds: string[]) {
  await $fetch('/api/test/audience', { method: 'POST', body: { key, userIds } })
}

/** Gives a user a phone number, as a host that sends texts would. */
export async function setPhone(userId: string, phone: string) {
  await $fetch('/api/test/phone', { method: 'POST', body: { userId, phone } })
}

export type CapturedEmail = { to: string | string[], subject: string, body: string, text?: string, template?: { name: string, props?: Record<string, unknown> } }

/** Every email that reached `notify:email` so far, in order (fixture-only route). */
export const getEmails = () => $fetch<CapturedEmail[]>('/api/test/emails')

/** Every text the SMS driver received so far, in order (fixture-only route). */
export const getTexts = () => $fetch<Array<{ to: string | string[], body: string }>>('/api/test/sms')
