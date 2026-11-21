// In-memory state of the test fixture, shared by its plugin and its test routes.

/** Every shifts hook that fired, in order, with the ids the tests look for. */
export const testHooks: Array<{ name: string, userId?: number, assignmentId?: string, shiftId?: string, swapId?: string, offerId?: string, scheduleId?: string, status?: string, previousUserId?: number | null, previousStatus?: string | null, by?: number | null, offset?: number, channels?: string[], eventless?: boolean, broadcastId?: string, recipientCount?: number, perkId?: string, grantId?: string, kind?: string, auto?: boolean, method?: string, items?: string[] }> = []

/** Every SMS handed to the fixture's SMS driver. */
export const testSms: Array<{ to: string[], body: string }> = []

/** Every email handed to notify, as the `notify:email` hook saw it. */
export const testEmails: Array<{ to: string | string[], subject: string, body: string, text?: string, template?: { name: string, props?: Record<string, unknown>, locale?: string } }> = []

/** When `off`, every request sees an empty `shifts.stationKey`, as a server without `NUXT_SHIFTS_STATION_KEY` would. */
export const testStationKey = { off: false }
