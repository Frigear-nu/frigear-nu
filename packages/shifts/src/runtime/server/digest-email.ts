import type { EmailNotification } from '@frigear-nu/notify/types'
import type { ShiftExceptionKind } from '../../types'
import { reminderLanguage } from './reminder-email'

// The leads' digest of the `shifts:close-shifts` task: one email per lead and run, listing the new exceptions of the
// teams they lead. Built without Nitro (tested as a unit), sent through the broadcast template.

/** One line of a digest: who, which shift (already formatted) and what happened. */
export type ShiftDigestLine = { kind: ShiftExceptionKind, name: string, team: string, when: string }

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const TEXTS = {
  en: {
    subject: (count: number) => count === 1 ? 'Shifts: 1 thing to look at' : `Shifts: ${count} things to look at`,
    intro: 'These came up on the shifts of your team:',
    kinds: { no_show: 'no-show', not_checked_in: 'not checked in', claimed_no_show: 'no-show, perk already claimed', late: 'late' } as Record<ShiftExceptionKind, string>,
    greeting: (name: string) => `Hi ${name},`,
    link: 'Open the exceptions',
  },
  da: {
    subject: (count: number) => count === 1 ? 'Vagter: 1 ting at se på' : `Vagter: ${count} ting at se på`,
    intro: 'Det her er sket på dit holds vagter:',
    kinds: { no_show: 'udeblevet', not_checked_in: 'ikke tjekket ind', claimed_no_show: 'udeblevet, fordel allerede hentet', late: 'for sent' } as Record<ShiftExceptionKind, string>,
    greeting: (name: string) => `Hej ${name},`,
    link: 'Se undtagelserne',
  },
}

/** The digest email of one lead; `null` without an address or without lines. */
export function buildShiftDigestEmail(input: { email: string | null, name: string, lines: ShiftDigestLine[], url?: string, locale?: string }): EmailNotification | null {
  if (!input.email || !input.lines.length) return null
  const texts = TEXTS[reminderLanguage(input.locale)]
  const items = input.lines.map(line => `${line.name}, ${line.team} ${line.when}: ${texts.kinds[line.kind]}`)
  const message = `${texts.intro}\n${items.map(item => `- ${item}`).join('\n')}${input.url ? `\n\n${texts.link}: ${input.url}` : ''}`
  const subject = texts.subject(input.lines.length)
  return {
    to: input.email,
    subject,
    body: `<p>${escapeHtml(texts.greeting(input.name))}</p><p>${escapeHtml(texts.intro)}</p><ul>${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>${input.url ? `<p><a href="${escapeHtml(input.url)}">${escapeHtml(texts.link)}</a></p>` : ''}`,
    text: `${texts.greeting(input.name)}\n\n${message}`,
    template: {
      name: 'shifts-broadcast',
      props: { name: input.name, subject, message, ...(input.url ? { url: input.url } : {}) },
      locale: input.locale ?? 'en',
    },
    meta: { shiftDigest: true },
  }
}
