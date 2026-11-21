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

export type HookEntry = { name: string, userId?: number, assignmentId?: string, shiftId?: string, swapId?: string, offerId?: string, scheduleId?: string, status?: string, previousUserId?: number | null, previousStatus?: string | null, by?: number | null, offset?: number, channels?: string[], eventless?: boolean, broadcastId?: string, recipientCount?: number, perkId?: string, grantId?: string, kind?: string, auto?: boolean, method?: string, items?: string[] }

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

/** Runs the `shifts:close-shifts` task with a fake `now` and no request, like the scheduler (fixture-only route). */
export const runCloseShifts = (now: string, extra: { batchSize?: number } = {}) =>
  $fetch<{ closed: number, granted: number, noShows: number, digests: number, exceptions: number }>('/api/test/close-shifts', { method: 'POST', body: { now, ...extra } })

/** Mints a station token for a window (fixture-only route): `offset` windows from now, or a forged one. */
export const stationToken = (stationId: string, offset = 0) =>
  $fetch<{ token: string }>('/api/test/station-token', { method: 'POST', body: { stationId, offset } })

/** Turns the server's station key off or back on, as if `NUXT_SHIFTS_STATION_KEY` were unset (fixture-only route). */
export const setStationKey = (configured: boolean) =>
  $fetch('/api/test/station-key', { method: 'POST', body: { configured } })
