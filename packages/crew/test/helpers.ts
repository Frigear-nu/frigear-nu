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
  return { cookie: response.headers.get('set-cookie')!, id: Number(body.id), email }
}

export type HookEntry = { name: string, operationId?: string, teamId?: string, userId: number, role?: string, crewStatus?: string, from?: string, to?: string }

/** The crew and teams hooks that fired for one user, in order (fixture-only route). */
export async function getHooksOf(userId: number) {
  const log = await $fetch<HookEntry[]>('/api/test/hooks')
  return log.filter(entry => entry.userId === userId)
}

export type EmailEntry = { to: string | string[], subject: string, body: string, text?: string, template?: { name: string, props?: Record<string, unknown>, locale?: string } }

/** The emails notify was asked to deliver to an address, in order (fixture-only route). */
export const getEmailsTo = (to: string) => $fetch<EmailEntry[]>('/api/test/emails', { query: { to } })

/** The viewer of the caller, as a visibility consumer builds it (fixture-only route). */
export const getViewer = (cookie: string) =>
  $fetch<{ operationIds: string[], teamRoles: Array<{ teamId: string, role: string, source: string }> }>('/api/test/viewer', { headers: { cookie } })
