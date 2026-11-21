import { $fetch, fetch } from '@nuxt/test-utils/e2e'
import { expect } from 'vitest'
import { authApi } from '@frigear-nu/auth/api'
import { apiClient } from '@frigear-nu/module-kit/testing'
import { signSha256 } from '../src/runtime/utils/signature'
import { inboxApi } from '../src/runtime/utils/api'

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
  const cookie = response.headers.get('set-cookie')!
  // nuxt-auth-utils' session endpoint names the signed-in user.
  const session = await $fetch<{ user: { id: number } }>('/api/_auth/session', { headers: { cookie } })
  return { cookie, email, id: Number(session.user.id) }
}

export type Session = Awaited<ReturnType<typeof registerUser>>

/** An API token of the signed-in user with these scopes. */
export async function createToken(cookie: string, scopes: string[]): Promise<string> {
  const created = await apiClient({ cookie }).json<{ token: string }>('POST', authApi.me.tokens, { name: 'test', scopes })
  return created.token
}

/** Posts a raw body signed the way the email webhook expects (or with `signature` as given). */
export async function postEmail(payload: unknown, signature?: string | null) {
  const body = JSON.stringify(payload)
  const header = signature === undefined ? await signSha256('test-email-secret', body) : signature
  return fetch(inboxApi.webhooks.email, { method: 'POST', headers: { 'content-type': 'application/json', ...(header ? { 'x-inbox-signature': header } : {}) }, body })
}

/** Posts a raw body signed the way Meta signs its webhooks (or with `signature` as given). */
export async function postMeta(payload: unknown, signature?: string | null) {
  const body = JSON.stringify(payload)
  const header = signature === undefined ? await signSha256('test-app-secret', body) : signature
  return fetch(inboxApi.webhooks.meta, { method: 'POST', headers: { 'content-type': 'application/json', ...(header ? { 'x-hub-signature-256': header } : {}) }, body })
}

export const getHooks = () => $fetch<Array<{ name: string, threadId: string, messageId?: string, data?: Record<string, unknown> }>>('/api/test/hooks')
export const getEmails = () => $fetch<Array<{ to: string, subject: string, body: string, text?: string, replyTo?: string }>>('/api/test/emails')
export const getSent = () => $fetch<Array<{ threadId: string, to: string, body: string, secret?: string }>>('/api/test/sent')
export const makeLead = (cookie: string, teamId: string) => $fetch('/api/test/lead', { method: 'POST', headers: { cookie }, body: { teamId } })
export const backdate = (threadId: string, days: number) => $fetch('/api/test/backdate', { method: 'POST', body: { threadId, days } })
export const runRetention = (now: Date) => $fetch<{ result: { threads: number, contacts: number, mailboxes: number } }>('/api/test/retention', { method: 'POST', body: { now: now.toISOString() } })
