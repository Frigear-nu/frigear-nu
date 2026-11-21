import type { H3Event } from 'h3'
import type { ShiftSwapDto, ShiftSwapOfferDto } from '../../../types'
import { translate } from '../../utils'
import { buildShiftSwapEmail } from '../swap-email'
import type { ShiftSwapEmailKind } from '../swap-email'
import { shiftsConfig, shiftsLocaleOf, shiftsUsersById } from './shifts-core'

let shiftsWarnedNoOrigin = false

/**
 * Emails one person about a swap (`shifts-swap-<kind>` template). The link goes to the shift's page for the owner, to the
 * lead page of `teamId` for a pending approval, to my shifts once completed, and to the marketplace otherwise. Links need
 * a configured site origin (Auth's `configuredAuthSiteOrigin`); without one the email goes out without a link and a
 * warning is logged once. A failing email never fails the swap: it is logged.
 */
export async function shiftsSendSwapEmail(event: H3Event, kind: ShiftSwapEmailKind, input: { swap: ShiftSwapDto, offer: ShiftSwapOfferDto, to: number, teamId?: string }): Promise<void> {
  try {
    const { swap, offer, to } = input
    const users = await shiftsUsersById([to, swap.owner.userId, offer.userId])
    const recipient = users.get(to)
    const locale = await shiftsLocaleOf(to, swap.shift.teamId)
    const { timeZone } = shiftsConfig(event)
    const when = new Intl.DateTimeFormat(locale, { timeZone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(swap.shift.startsAt))
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
      variables: {
        name: recipient?.name ?? '',
        owner: users.get(swap.owner.userId)?.name ?? '',
        offerer: users.get(offer.userId)?.name ?? '',
        team: translate(swap.shift.teamName, locale, 'en'),
        when,
      },
      url: path && origin ? `${origin}${path}` : undefined,
      locale,
    })
    if (notification) await dispatchEmailNotification(notification)
  }
  catch (error) {
    console.error(`[shifts] the "${kind}" swap email could not be sent`, error)
  }
}
