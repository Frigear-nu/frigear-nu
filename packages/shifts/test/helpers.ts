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

export type HookEntry = { name: string, userId?: number, assignmentId?: string, shiftId?: string, swapId?: string, offerId?: string, scheduleId?: string, status?: string, previousUserId?: number | null, previousStatus?: string | null, by?: number, offset?: number, channels?: string[], eventless?: boolean, broadcastId?: string, recipientCount?: number, perkId?: string, redemptionId?: string }

/** Every shifts hook that fired, in order (fixture-only route). */
export const getHooks = () => $fetch<HookEntry[]>('/api/test/hooks')

export type EmailEntry = { to: string | string[], subject: string, body: string, text?: string, template?: { name: string, props?: Record<string, unknown>, locale?: string } }

/** Runs the reminder task with a fake `now` and no request, like the scheduler (fixture-only route). */
export const runReminders = (now: string, extra: { sms?: boolean, offsets?: number[], batchSize?: number } = {}) =>
  $fetch<{ checked: number, sent: number, spent: number }>('/api/test/reminders', { method: 'POST', body: { now, ...extra } })

/** Puts `count` new people (user, explicit membership, `assigned` assignment) on a shift (fixture-only route). */
export const addBulkAssignments = (shiftId: string, teamId: string, count: number, prefix = 'bulk') =>
  $fetch<{ emails: string[], created: number }>('/api/test/assignments-bulk', { method: 'POST', body: { shiftId, teamId, count, prefix } })

/** Gives a user a phone number (fixture-only route). */
export const setPhone = (userId: number, phone: string | null) => $fetch('/api/test/phone', { method: 'POST', body: { userId, phone } })

/** Sets the locale of a member's emails (fixture-only route). */
export const setLocale = (userId: number, teamId: string, locale: string | null) => $fetch('/api/test/locale', { method: 'POST', body: { userId, teamId, locale } })

/** Adds `count` volunteers (ids of users that do not exist) to a team (fixture-only route). */
export const addBulkMembers = (teamId: string, count: number) => $fetch('/api/test/members-bulk', { method: 'POST', body: { teamId, count } })

export type SmsEntry = { to: string[], body: string }

/** The SMS notify was asked to send to a number, in order (fixture-only route). */
export const getSmsTo = (to: string) => $fetch<SmsEntry[]>('/api/test/sms', { query: { to } })

/** The emails notify was asked to deliver to an address, in order (fixture-only route). */
export const getEmailsTo = (to: string) => $fetch<EmailEntry[]>('/api/test/emails', { query: { to } })
