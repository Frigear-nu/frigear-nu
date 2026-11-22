import type { EmailNotification, SMSNotification } from '@frigear-nu/notify/types'
import { formatDateTime } from '@frigear-nu/ui/utils'

// The reminder email and SMS, and the broadcast email, built without Nitro (tested as a unit). `shiftsSendReminders` and
// `shiftsSendBroadcast` (server utils) fill and send them. Same shape as `swap-email.ts`. The reminder is written in the
// recipient's language (a small da/en table, English for any other locale).

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** What a reminder says about the shift: `when` is already formatted in the person's locale and the module's time zone. */
export type ShiftReminderVariables = { name: string, team: string, role?: string, when: string, where?: string, start: string }

/** How much time is left, bucketed (see `timeLeftBucket`). */
export type ShiftTimeLeft = { unit: 'minutes' | 'hours' | 'days', count: number }

type ReminderTexts = {
  left: { minutes: (count: number) => string, hours: (count: number) => string, days: (count: number) => string }
  subject: (left: string) => string
  message: (what: string, left: string, when: string, where?: string) => string
  greeting: (name: string) => string
  heading: string
  button: string
}

const TEXTS: Record<'en' | 'da', ReminderTexts> = {
  en: {
    left: {
      minutes: count => count === 1 ? 'in a minute' : `in ${count} minutes`,
      hours: count => count === 1 ? 'in an hour' : `in ${count} hours`,
      days: count => count === 1 ? 'in a day' : `in ${count} days`,
    },
    subject: left => `Reminder: your shift starts ${left}`,
    message: (what, left, when, where) => `Your shift on ${what} starts ${left}: ${when}${where ? `, ${where}` : ''}.`,
    greeting: name => `Hi ${name},`,
    heading: 'Your shift is coming up',
    button: 'See your shift',
  },
  da: {
    left: {
      minutes: count => count === 1 ? 'om et minut' : `om ${count} minutter`,
      hours: count => count === 1 ? 'om en time' : `om ${count} timer`,
      days: count => count === 1 ? 'om en dag' : `om ${count} dage`,
    },
    subject: left => `Påmindelse: din vagt starter ${left}`,
    message: (what, left, when, where) => `Din vagt på ${what} starter ${left}: ${when}${where ? `, ${where}` : ''}.`,
    greeting: name => `Hej ${name},`,
    heading: 'Din vagt nærmer sig',
    button: 'Se din vagt',
  },
}

/** The language of the texts for a locale (`da`, `da-DK` and `da_DK` are Danish); English for anything else, even garbage. */
export function reminderLanguage(locale: string | undefined | null): 'en' | 'da' {
  return typeof locale === 'string' && /^da(?:[-_]|$)/i.test(locale.trim()) ? 'da' : 'en'
}

/** The wording of the time left in a locale: "in 3 hours", "om 3 timer". */
export function describeTimeLeft(left: ShiftTimeLeft, locale?: string | null): string {
  return TEXTS[reminderLanguage(locale)].left[left.unit](left.count)
}

/**
 * A shift time as `Jun 28, 2027, 12:00` in the person's locale and the time zone. A locale `Intl` does not know (the
 * value is free text on a crew row) falls back to English instead of throwing in the middle of a run.
 */
export function formatShiftWhen(date: Date, locale: string | undefined | null, timeZone: string): string {
  try {
    return formatDateTime(date, locale || 'en', { timeZone })
  }
  catch {
    return formatDateTime(date, 'en', { timeZone })
  }
}

function reminderMessage(variables: ShiftReminderVariables, left: ShiftTimeLeft, locale?: string | null): string {
  const texts = TEXTS[reminderLanguage(locale)]
  const what = variables.role ? `${variables.team} (${variables.role})` : variables.team
  return texts.message(what, describeTimeLeft(left, locale), variables.when, variables.where)
}

/** The reminder email. `null` without an address. `offset` is the configured offset that fell due; `left` the real time left. */
export function buildShiftReminderEmail(input: {
  email: string | null
  variables: ShiftReminderVariables
  offset: number
  left: ShiftTimeLeft
  url?: string
  locale?: string
}): EmailNotification | null {
  const { email, variables, url, offset, left, locale } = input
  if (!email) return null
  const texts = TEXTS[reminderLanguage(locale)]
  const subject = texts.subject(describeTimeLeft(left, locale))
  const message = reminderMessage(variables, left, locale)
  const greeting = texts.greeting(variables.name)
  const link = url ? `<p><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p>` : ''
  return {
    to: email,
    subject,
    body: `<p>${escapeHtml(greeting)}</p><p>${escapeHtml(message)}</p>${link}`,
    text: `${greeting}\n\n${message}${url ? `\n\n${url}` : ''}`,
    template: {
      name: 'shifts-reminder',
      props: { name: variables.name, subject, message, url: url ?? null, greeting, heading: texts.heading, button: texts.button },
      locale: locale ?? 'en',
    },
    meta: { shiftReminder: offset },
  }
}

/** The reminder push notification: the email's subject and the same one-line message. */
export function buildShiftReminderPush(input: { variables: ShiftReminderVariables, left: ShiftTimeLeft, url?: string, locale?: string }): { title: string, body: string, url?: string } {
  return {
    title: TEXTS[reminderLanguage(input.locale)].subject(describeTimeLeft(input.left, input.locale)),
    body: reminderMessage(input.variables, input.left, input.locale),
    ...(input.url ? { url: input.url } : {}),
  }
}

/** The reminder SMS: one short line in the person's language, with the link when there is one. `null` without a phone number. */
export function buildShiftReminderSms(input: { phone: string | null, variables: ShiftReminderVariables, offset: number, left: ShiftTimeLeft, url?: string, locale?: string }): SMSNotification | null {
  if (!input.phone) return null
  return {
    to: input.phone,
    body: `${reminderMessage(input.variables, input.left, input.locale)}${input.url ? ` ${input.url}` : ''}`,
    meta: { shiftReminder: input.offset },
  }
}

/** The broadcast email: the staff or lead's subject and message in the person's locale. `null` without an address. */
export function buildShiftBroadcastEmail(input: { email: string | null, name: string, subject: string, message: string, locale?: string }): EmailNotification | null {
  if (!input.email) return null
  const paragraphs = input.message.split(/\n{2,}/).map(part => `<p>${escapeHtml(part).replace(/\n/g, '<br>')}</p>`).join('')
  return {
    to: input.email,
    subject: input.subject,
    body: `<p>Hi ${escapeHtml(input.name)},</p>${paragraphs}`,
    text: `Hi ${input.name},\n\n${input.message}`,
    template: {
      name: 'shifts-broadcast',
      props: { name: input.name, subject: input.subject, message: input.message },
      locale: input.locale ?? 'en',
    },
    meta: { shiftBroadcast: true },
  }
}

/** The broadcast SMS: the subject, then the message. `null` without a phone number. */
export function buildShiftBroadcastSms(input: { phone: string | null, subject: string, message: string }): SMSNotification | null {
  if (!input.phone) return null
  return { to: input.phone, body: `${input.subject}\n${input.message}`, meta: { shiftBroadcast: true } }
}
