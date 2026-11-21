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
  return { cookie: response.headers.get('set-cookie')!, id: Number(body.id), email, name }
}

export type HookEntry = { name: string, userId?: number, assignmentId?: string, shiftId?: string, swapId?: string, offerId?: string, scheduleId?: string, status?: string, previousUserId?: number | null, previousStatus?: string | null, by?: number, kind?: string }

/** Every shifts hook that fired, in order (fixture-only route). */
export const getHooks = () => $fetch<HookEntry[]>('/api/test/hooks')

export type EmailEntry = { to: string | string[], subject: string, body: string, text?: string, template?: { name: string, props?: Record<string, unknown>, locale?: string } }

/** The emails notify was asked to deliver to an address, in order (fixture-only route). */
export const getEmailsTo = (to: string) => $fetch<EmailEntry[]>('/api/test/emails', { query: { to } })
