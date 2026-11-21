import type { EmailNotification, SMSNotification } from '@frigear-nu/notify/types'

// The reminder email and SMS, and the broadcast email, built without Nitro (tested as a unit). `shiftsSendReminders` and
// `shiftsSendBroadcast` (server utils) fill and send them. Same shape as `swap-email.ts`.

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** What a reminder says about the shift: `when` is already formatted in the person's locale and the module's time zone. */
export type ShiftReminderVariables = { name: string, team: string, role?: string, when: string, where?: string, start: string }

/** "in 2 hours", "tomorrow"-style wording of the offset, in English. */
export function describeReminderOffset(minutes: number): string {
  if (minutes >= 1440 && minutes % 1440 === 0) {
    const days = minutes / 1440
    return days === 1 ? 'in a day' : `in ${days} days`
  }
  if (minutes >= 60 && minutes % 60 === 0) {
    const hours = minutes / 60
    return hours === 1 ? 'in an hour' : `in ${hours} hours`
  }
  return `in ${minutes} minutes`
}

function reminderMessage(variables: ShiftReminderVariables, offset: number): string {
  const what = variables.role ? `${variables.team} (${variables.role})` : variables.team
  return `Your shift on ${what} starts ${describeReminderOffset(offset)}: ${variables.when}${variables.where ? `, ${variables.where}` : ''}.`
}

/** The reminder email. `null` without an address. */
export function buildShiftReminderEmail(input: {
  email: string | null
  variables: ShiftReminderVariables
  offset: number
  url?: string
  locale?: string
}): EmailNotification | null {
  const { email, variables, url, offset } = input
  if (!email) return null
  const subject = `Reminder: your shift starts ${describeReminderOffset(offset)}`
  const message = reminderMessage(variables, offset)
  const link = url ? `<p><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p>` : ''
  return {
    to: email,
    subject,
    body: `<p>Hi ${escapeHtml(variables.name)},</p><p>${escapeHtml(message)}</p>${link}`,
    text: `Hi ${variables.name},\n\n${message}${url ? `\n\n${url}` : ''}`,
    template: {
      name: 'shifts-reminder',
      props: { name: variables.name, subject, message, url: url ?? null },
      locale: input.locale ?? 'en',
    },
    meta: { shiftReminder: offset },
  }
}

/** The reminder SMS: one short line, with the link when there is one. `null` without a phone number. */
export function buildShiftReminderSms(input: { phone: string | null, variables: ShiftReminderVariables, offset: number, url?: string }): SMSNotification | null {
  if (!input.phone) return null
  return {
    to: input.phone,
    body: `${reminderMessage(input.variables, input.offset)}${input.url ? ` ${input.url}` : ''}`,
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
