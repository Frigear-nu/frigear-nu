import { eventsApi } from '@frigear-nu/events/api'
import type { CheckInResponse } from '@frigear-nu/events'
import { shiftsApi } from '@frigear-nu/shifts/api'
import type { ShiftCheckInDto } from '@frigear-nu/shifts/utils'
import { translate } from '@frigear-nu/ui/translated'
import type { FrigearIdVerification } from '#shared/types/frigear-id'
import type { ScanMode } from './useScanModes'

/** Green: in (valid ID with a membership, ticket or person checked in). Amber: look again. Red: not valid. */
export type ScanTone = 'success' | 'warning' | 'error'

/** What one scan came to, for the result card. */
export interface ScanOutcome {
  mode: ScanMode
  tone: ScanTone
  title: string
  description?: string
  /** A Frigear ID: whose it is. */
  identity?: FrigearIdVerification
  /** Facts under the verdict (a ticket's event and type, a shift's time). */
  details?: { label: string, value: string }[]
}

const statusOf = (error: unknown): number | undefined => {
  const value = error as { statusCode?: number, status?: number } | null
  return value?.statusCode ?? value?.status
}
/** The website's `apiError` data: `{ code, ...data }` under the error body's `data`. */
const dataOf = (error: unknown): Record<string, unknown> => {
  const body = (error as { data?: { data?: unknown } } | null)?.data?.data
  return body && typeof body === 'object' ? body as Record<string, unknown> : {}
}

/**
 * Checks a scanned code with the website for one scan mode: verifies a Frigear ID, checks a ticket in at the door, or
 * checks a person in on their shift. Resolves the outcome for the result card, also for a refused code (never throws).
 */
export function useScanCheck() {
  const { t, locale } = useI18n()
  const format = useFormat()

  async function frigearId(code: string): Promise<ScanOutcome> {
    try {
      const identity = await $fetch<FrigearIdVerification>('/api/account/id-code/verify', { method: 'POST', body: { code } })
      return identity.membership.active
        ? { mode: 'frigear-id', tone: 'success', title: t('app.wallet.scan.id.valid'), description: t('app.wallet.scan.id.member'), identity }
        : { mode: 'frigear-id', tone: 'warning', title: t('app.wallet.scan.id.valid'), description: t('app.wallet.scan.id.noMembership'), identity }
    }
    catch (error) {
      const status = statusOf(error)
      const title = status === 410
        ? t('app.wallet.scan.id.expired')
        : status === 400
          ? t('app.wallet.scan.id.invalid')
          : status === 404
            ? t('app.wallet.scan.id.unknown')
            : status === 403
              ? t('app.wallet.scan.id.forbidden')
              : t('app.wallet.scan.id.failed')
      const description = status === 410 ? t('app.wallet.scan.id.expiredHint') : status && status < 500 ? undefined : errorMessage(error, '')
      return { mode: 'frigear-id', tone: 'error', title, description: description || undefined }
    }
  }

  async function ticket(code: string): Promise<ScanOutcome> {
    try {
      const answer = await $fetch<CheckInResponse>(eventsApi.admin.checkIn, { method: 'POST', body: { code } })
      const details = [
        { label: t('app.wallet.scan.ticket.event'), value: translate(answer.ticket.eventName, locale.value) },
        { label: t('app.wallet.scan.ticket.type'), value: [answer.ticket.ticketTypeName, ...answer.ticket.addons.map(addon => addon.label)].map(text => translate(text, locale.value)).filter(Boolean).join(' · ') },
      ]
      return answer.alreadyCheckedIn
        ? { mode: 'ticket', tone: 'warning', title: t('app.wallet.scan.ticket.already'), description: t('app.wallet.scan.ticket.alreadyAt', { time: format.dateTime(answer.checkedInAt) }), details }
        : { mode: 'ticket', tone: 'success', title: t('app.wallet.scan.ticket.checkedIn'), details }
    }
    catch (error) {
      const status = statusOf(error)
      if (status === 409) {
        const ticketStatus = String(dataOf(error).status ?? '')
        return {
          mode: 'ticket',
          tone: 'error',
          title: t('app.wallet.scan.ticket.notValid'),
          description: ticketStatus ? t('app.wallet.scan.ticket.status', { status: t(`app.wallet.status.${ticketStatus}`) }) : errorMessage(error, '') || undefined,
        }
      }
      const title = status === 404
        ? t('app.wallet.scan.ticket.unknown')
        : status === 403
          ? t('app.wallet.scan.ticket.forbidden')
          : t('app.wallet.scan.ticket.failed')
      return { mode: 'ticket', tone: 'error', title, description: status && status < 500 ? undefined : errorMessage(error, '') || undefined }
    }
  }

  // The wording of @frigear-nu/shifts' team scanner (its check-in page).
  async function shift(code: string): Promise<ScanOutcome> {
    try {
      const answer = await $fetch<ShiftCheckInDto>(shiftsApi.checkIn, { method: 'POST', body: { code } })
      const name = answer.assignment.person.name ?? `#${answer.assignment.userId}`
      const when = `${format.time(answer.shift.startsAt)}–${format.time(answer.shift.endsAt)}`
      return answer.alreadyCheckedIn
        ? { mode: 'shift', tone: 'warning', title: t('app.wallet.scan.shift.already', { name }), description: t('app.wallet.scan.shift.alreadyAt', { time: format.time(answer.checkedInAt), when }) }
        : {
            mode: 'shift',
            tone: 'success',
            title: t('app.wallet.scan.shift.checkedIn', { name }),
            description: answer.alsoCheckedIn.length
              ? t('app.wallet.scan.shift.shiftAndDaily', { when, count: answer.alsoCheckedIn.length })
              : t('app.wallet.scan.shift.shift', { when }),
          }
    }
    catch (error) {
      const status = statusOf(error)
      const errorCode = dataOf(error).code
      const title = status === 404
        ? t('app.wallet.scan.shift.unknown')
        : status === 403
          ? t('app.wallet.scan.shift.forbidden')
          : errorCode === 'outside_window'
            ? t('app.wallet.scan.shift.outsideWindow')
            : errorCode === 'assignment_cancelled'
              ? t('app.wallet.scan.shift.cancelled')
              : errorCode === 'not_eligible'
                ? t('app.wallet.scan.shift.notEligible')
                : t('app.wallet.scan.shift.failed')
      return { mode: 'shift', tone: 'error', title, description: status === 404 || status === 403 ? undefined : errorMessage(error, '') || undefined }
    }
  }

  const checks: Record<ScanMode, (code: string) => Promise<ScanOutcome>> = { 'frigear-id': frigearId, ticket, shift }
  return (mode: ScanMode, code: string) => checks[mode](code)
}
