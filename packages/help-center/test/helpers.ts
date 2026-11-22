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

/** Makes users take part in an operation, for the fixture's `operation` grant kind (what crew would answer). */
export async function takePart(operationId: string, userIds: string[]) {
  await $fetch('/api/test/participate', { method: 'POST', body: { operationId, userIds } })
}

/** Gives a user a phone number, as a host that sends texts would. */
export async function setPhone(userId: string, phone: string) {
  await $fetch('/api/test/phone', { method: 'POST', body: { userId, phone } })
}

/** Stores a user's notification channels per topic, as the account's notifications page would (fixture-only route). */
export async function setChoices(userId: string, topics: Record<string, Record<string, boolean>>) {
  await $fetch('/api/test/choices', { method: 'POST', body: { userId, topics } })
}

export type CapturedEmail = { to: string | string[], subject: string, body: string, text?: string, template?: { name: string, props?: Record<string, unknown> } }

/** Every email that reached `notify:email` so far, in order (fixture-only route). */
export const getEmails = () => $fetch<CapturedEmail[]>('/api/test/emails')

/** Every email the mail driver received so far, as delivered (rendered by email templates), in order (fixture-only route). */
export const getDelivered = () => $fetch<Array<{ to: string, subject: string, body: string, text?: string }>>('/api/test/delivered')

/** Every text the SMS driver received so far, in order (fixture-only route). */
export const getTexts = () => $fetch<Array<{ to: string | string[], body: string }>>('/api/test/sms')
