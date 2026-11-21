import type { H3Event } from 'h3'
import type { ShiftSwapDto, ShiftSwapOfferDto } from '../../../types'
import { translate } from '../../utils'
import { buildShiftSwapEmail } from '../swap-email'
import type { ShiftSwapEmailKind } from '../swap-email'
import { shiftsConfig, shiftsLocaleOf, shiftsUsersById } from './shifts-core'

/**
 * Emails one person about a swap (`shifts-swap-<kind>` template). The link goes to the shift's page for the owner and to
 * the marketplace for everybody else. A failing email never fails the swap: it is logged.
 */
export async function shiftsSendSwapEmail(event: H3Event, kind: ShiftSwapEmailKind, input: { swap: ShiftSwapDto, offer: ShiftSwapOfferDto, to: number }): Promise<void> {
  try {
    const { swap, offer, to } = input
    const users = await shiftsUsersById([to, swap.owner.userId, offer.userId])
    const recipient = users.get(to)
    const locale = await shiftsLocaleOf(to, swap.shift.teamId)
    const { timeZone } = shiftsConfig(event)
    const when = new Intl.DateTimeFormat(locale, { timeZone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(swap.shift.startsAt))
    const pages = (useRuntimeConfig(event).public.shifts as { pages?: { shifts?: string, shift?: string, swaps?: string } } | undefined)?.pages
    const origin = configuredAuthSiteOrigin(event) ?? getRequestURL(event).origin
    const path = to === swap.owner.userId && kind !== 'completed' && pages?.shift
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
      url: path ? `${origin}${path}` : undefined,
      locale,
    })
    if (notification) await dispatchEmailNotification(notification)
  }
  catch (error) {
    console.error(`[shifts] the "${kind}" swap email could not be sent`, error)
  }
}
