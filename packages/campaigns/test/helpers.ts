import { $fetch, fetch } from '@nuxt/test-utils/e2e'
import { expect } from 'vitest'
import { authApi } from '@frigear-nu/auth/api'
import { apiClient } from '@frigear-nu/module-kit/testing'

let counter = 0

/**
 * Registers a user; the role follows the email domain (see the fixture's `server/roles/provider.ts`). `extras` go with
 * the registration as the registration form's widgets send them (`{ campaigns: { listIds } }`).
 */
export async function registerUser(name: string, domain = 'example.com', extras?: Record<string, unknown>) {
  const email = `${name.toLowerCase()}${++counter}@${domain}`
  const response = await fetch(authApi.register, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, email, password: 'supersecret123', ...(extras && { extras }) }),
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

/** Marks a user's email address verified. */
export const verifyEmail = (userId: number) => $fetch('/api/test/verify', { method: 'POST', body: { userId } })

export type CapturedEmail = {
  to: string
  subject: string
  body: string
  text?: string
  headers?: Record<string, string>
  template?: { name: string, props: Record<string, string | null>, locale?: string }
}
export type CapturedText = { to: string, body: string }

/** Every email and text delivered so far. */
export const getMessages = () => $fetch<{ emails: CapturedEmail[], texts: CapturedText[] }>('/api/test/messages')

/** The emails delivered to `to`. */
export async function emailsTo(to: string): Promise<CapturedEmail[]> {
  return (await getMessages()).emails.filter(email => email.to === to)
}

/** The `token` query parameter of a link. */
export const tokenOf = (url: string | null | undefined) => new URL(url!).searchParams.get('token')!

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loosely typed rows of the test route
export const getSubscriptions = () => $fetch<Array<{ subscription: Record<string, any>, contact: Record<string, any> }>>('/api/test/subscriptions')

/** The stored subscription of an address (email or phone) on a list. */
export async function subscriptionOf(listId: string, address: string) {
  const rows = await getSubscriptions()
  return rows.find(row => row.subscription.listId === listId && (row.contact.email === address || row.contact.phone === address))
}

/** Runs `run` with the server environment variable `name` set to `value`, then removes it. */
export async function withServerEnv<T>(name: string, value: string, run: () => Promise<T>): Promise<T> {
  await $fetch('/api/test/env', { method: 'POST', body: { name, value } })
  try {
    return await run()
  }
  finally {
    await $fetch('/api/test/env', { method: 'POST', body: { name, value: null } })
  }
}

/** Runs the `campaigns:deliver` task once. */
export const runDeliver = (body: { now?: string, batchSize?: number } = {}) => $fetch<{ result: Record<string, number> }>('/api/test/deliver', { method: 'POST', body })

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loosely typed rows of the test route
export const getDeliveries = () => $fetch<{ deliveries: Array<Record<string, any>>, clicks: Array<Record<string, any>> }>('/api/test/deliveries')

/** The `cmd_…` delivery token in a link (the last path segment, or the `token` query parameter). */
export function deliveryTokenOf(url: string): string {
  const parsed = new URL(url, 'http://localhost')
  return parsed.searchParams.get('token') ?? decodeURIComponent(parsed.pathname.split('/').at(-1)!)
}

/** A browser's user agent: short links do not count visits of scripts and link scanners. */
export const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
