import type { H3Event } from 'h3'
import type { ShiftDto, ShiftSwapDto, ShiftSwapOfferDto, Translated } from '../../../types'
import { translate } from '../../utils'
import { buildShiftSwapEmail } from '../swap-email'
import type { ShiftSwapEmailKind } from '../swap-email'
import { shiftsConfig, shiftsLocaleOf, shiftsUsersById } from './shifts-core'
import { shiftsNotify } from './shifts-notify'
import { SHIFTS_TOPICS } from '../../notifications'

let shiftsWarnedNoOrigin = false

/**
 * Emails one person about a swap (`shifts-swap-<kind>` template). A trade names both shifts: the owner's and the one
 * given in return (the offer's, or the one a targeted trade wants). The link goes to the shift's page for the owner, to
 * the lead page of `teamId` for a pending approval, to my shifts once completed, and to the marketplace otherwise. Links
 * need a configured site origin (Auth's `configuredAuthSiteOrigin`); without one the email goes out without a link and a
 * warning is logged once. A failing email never fails the swap: it is logged.
 */
export async function shiftsSendSwapEmail(event: H3Event, kind: ShiftSwapEmailKind, input: { swap: ShiftSwapDto, offer?: ShiftSwapOfferDto, to: number, teamId?: string }): Promise<void> {
  try {
    const { swap, offer, to } = input
    const back: (ShiftDto & { teamName: Translated }) | null = offer?.offeredShift ?? (kind === 'proposed' ? swap.wantedShift : null)
    const offererId = offer?.userId ?? (kind === 'proposed' ? to : undefined)
    const users = await shiftsUsersById([to, swap.owner.userId, ...(offererId === undefined ? [] : [offererId])])
    const recipient = users.get(to)
    const locale = await shiftsLocaleOf(to, swap.shift.teamId)
    const { timeZone } = shiftsConfig(event)
    const formatter = new Intl.DateTimeFormat(locale, { timeZone, dateStyle: 'medium', timeStyle: 'short' })
    const pages = (useRuntimeConfig(event).public.shifts as { pages?: { shifts?: string, shift?: string, swaps?: string, lead?: string } } | undefined)?.pages
    const origin = configuredAuthSiteOrigin(event)
    if (!origin && !shiftsWarnedNoOrigin) {
      shiftsWarnedNoOrigin = true
      console.warn('[shifts] no site origin is configured: swap emails go out without a link')
    }
    const path = kind === 'pending'
      ? pages?.lead?.replace(':teamId', encodeURIComponent(input.teamId ?? swap.shift.teamId))
      : to === swap.owner.userId && kind !== 'completed' && pages?.shift
        ? pages.shift.replace(':assignmentId', encodeURIComponent(swap.assignmentId))
        : kind === 'completed' ? pages?.shifts : pages?.swaps
    const notification = buildShiftSwapEmail({
      kind,
      email: recipient?.email ?? null,
      trade: !!back,
      variables: {
        name: recipient?.name ?? '',
        owner: users.get(swap.owner.userId)?.name ?? '',
        offerer: offererId === undefined ? '' : users.get(offererId)?.name ?? '',
        team: translate(swap.shift.teamName, locale, 'en'),
        when: formatter.format(new Date(swap.shift.startsAt)),
        backTeam: back ? translate(back.teamName, locale, 'en') : '',
        backWhen: back ? formatter.format(new Date(back.startsAt)) : '',
      },
      url: path && origin ? `${origin}${path}` : undefined,
      locale,
    })
    if (notification) await shiftsNotify(event, to, { topic: SHIFTS_TOPICS.swap, email: notification, label: `the "${kind}" swap message` })
  }
  catch (error) {
    console.error(`[shifts] the "${kind}" swap email could not be sent`, error)
  }
}
