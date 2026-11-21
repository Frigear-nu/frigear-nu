import { $fetch, fetch } from '@nuxt/test-utils/e2e'
import { expect } from 'vitest'
import { authApi } from '@frigear-nu/auth/api'

export async function registerUser(name: string, email: string) {
  const response = await fetch(authApi.register, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, email, password: 'supersecret123' }),
  })
  expect(response.status, await response.clone().text()).toBe(201)
  const cookie = response.headers.get('set-cookie')!
  const { id } = await setPhone(email, null)
  return { cookie, id, email }
}

/** Sets (or clears) the host's `users.phone` column and answers the user's id. */
export async function setPhone(email: string, phone: string | null) {
  return $fetch<{ id: number }>('/api/test/phone', { method: 'POST', body: { email, phone } })
}

export async function createToken(cookie: string, scopes: string[]) {
  const response = await fetch(authApi.me.tokens, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ name: 'test', scopes }),
  })
  expect(response.status, await response.clone().text()).toBe(201)
  return (await response.json() as { token: string }).token
}

export type ProviderCall = {
  provider: 'google-oauth' | 'fcm' | 'apns'
  url: string
  headers: Record<string, string>
  body: Record<string, unknown>
  verified: boolean
  claims?: Record<string, unknown>
  header?: Record<string, unknown>
  error?: string
}

export async function getProviderCalls(reset = false): Promise<ProviderCall[]> {
  return $fetch<ProviderCall[]>(`/api/test/provider-calls${reset ? '?reset=1' : ''}`)
}

export async function getMails(reset = false): Promise<Array<{ to: string, subject: string, body: string }>> {
  return $fetch(`/api/test/mails${reset ? '?reset=1' : ''}`)
}

export async function getTexts(reset = false): Promise<Array<{ to: string, body: string }>> {
  return $fetch(`/api/test/sms${reset ? '?reset=1' : ''}`)
}

export type HookCall = { hook: string, deviceId: string, userId: number, platform: string }

export async function getHookCalls(reset = false): Promise<HookCall[]> {
  return $fetch<HookCall[]>(`/api/test/hooks${reset ? '?reset=1' : ''}`)
}

export type DeviceRow = { id: string, userId: number, platform: string, token: string, revokedAt: string | null }

export const deviceRows = () => $fetch<DeviceRow[]>('/api/test/devices')
