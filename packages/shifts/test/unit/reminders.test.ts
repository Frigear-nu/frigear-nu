import { describe, expect, it } from 'vitest'
import { DEFAULT_REMINDER_BATCH, DEFAULT_REMINDER_OFFSETS, dueReminderOffsets, normalizeReminderBatch, normalizeReminderOffsets, reminderOffsetToSend, timeLeftBucket } from '../../src/runtime/utils/reminders'
import { buildShiftBroadcastEmail, buildShiftBroadcastSms, buildShiftReminderEmail, buildShiftReminderSms, describeTimeLeft, formatShiftWhen, reminderLanguage } from '../../src/runtime/server/reminder-email'

const HOUR = 3_600_000
const startsAt = new Date('2027-06-28T10:00:00.000Z')
const before = (hours: number) => new Date(startsAt.getTime() - hours * HOUR)

describe('reminder offsets', () => {
  it('cleans the option: whole positive minutes up to a week, no duplicates, largest first', () => {
    expect(normalizeReminderOffsets(undefined)).toEqual([...DEFAULT_REMINDER_OFFSETS])
    expect(normalizeReminderOffsets([120, 1440, 120, 0, -5, 'x', 99_999, 60.4])).toEqual([1440, 120, 60])
    expect(normalizeReminderOffsets([])).toEqual([])
  })

  it('is due once the moment has passed and until the shift starts', () => {
    const offsets = [1440, 120]
    expect(dueReminderOffsets(startsAt, offsets, before(30))).toEqual([])
    expect(dueReminderOffsets(startsAt, offsets, before(24))).toEqual([1440])
    expect(dueReminderOffsets(startsAt, offsets, before(23))).toEqual([1440])
    expect(dueReminderOffsets(startsAt, offsets, before(2))).toEqual([1440, 120])
    expect(dueReminderOffsets(startsAt, offsets, before(0.5))).toEqual([1440, 120])
    // Never for a shift that has started.
    expect(dueReminderOffsets(startsAt, offsets, startsAt)).toEqual([])
    expect(dueReminderOffsets(startsAt, offsets, new Date(startsAt.getTime() + HOUR))).toEqual([])
  })

  it('sends the closest offset when several are due together', () => {
    expect(reminderOffsetToSend([1440, 120])).toBe(120)
    expect(reminderOffsetToSend([1440])).toBe(1440)
    expect(reminderOffsetToSend([])).toBeUndefined()
  })
})

describe('reminder batch and time left', () => {
  it('cleans the batch size', () => {
    expect(normalizeReminderBatch(undefined)).toBe(DEFAULT_REMINDER_BATCH)
    expect(normalizeReminderBatch(0)).toBe(DEFAULT_REMINDER_BATCH)
    expect(normalizeReminderBatch('x')).toBe(DEFAULT_REMINDER_BATCH)
    expect(normalizeReminderBatch(25.9)).toBe(25)
    expect(normalizeReminderBatch(99_999)).toBe(1000)
  })

  it('names the real time left, not the configured offset', () => {
    const left = (minutes: number) => timeLeftBucket(startsAt, new Date(startsAt.getTime() - minutes * 60_000))
    expect(left(0.2)).toEqual({ unit: 'minutes', count: 1 })
    expect(left(45)).toEqual({ unit: 'minutes', count: 45 })
    expect(left(90)).toEqual({ unit: 'hours', count: 2 })
    expect(left(180)).toEqual({ unit: 'hours', count: 3 })
    // 23.5 hours is "in a day", and a day and a half is still a day.
    expect(left(23.5 * 60)).toEqual({ unit: 'days', count: 1 })
    expect(left(1440)).toEqual({ unit: 'days', count: 1 })
    expect(left(36 * 60)).toEqual({ unit: 'days', count: 1 })
    expect(left(3 * 1440)).toEqual({ unit: 'days', count: 3 })
  })
})

describe('reminder and broadcast messages', () => {
  const variables = { name: 'Ann <b>', team: 'Bar', role: 'Lead', when: '28 Jun 2027, 12:00', where: 'Main bar', start: startsAt.toISOString() }

  it('words the time left in English and Danish, English for anything else', () => {
    expect(describeTimeLeft({ unit: 'days', count: 1 })).toBe('in a day')
    expect(describeTimeLeft({ unit: 'days', count: 2 }, 'en')).toBe('in 2 days')
    expect(describeTimeLeft({ unit: 'hours', count: 3 }, 'en-GB')).toBe('in 3 hours')
    expect(describeTimeLeft({ unit: 'hours', count: 1 })).toBe('in an hour')
    expect(describeTimeLeft({ unit: 'minutes', count: 45 })).toBe('in 45 minutes')
    expect(describeTimeLeft({ unit: 'hours', count: 3 }, 'da')).toBe('om 3 timer')
    expect(describeTimeLeft({ unit: 'days', count: 1 }, 'da-DK')).toBe('om en dag')
    expect(describeTimeLeft({ unit: 'minutes', count: 5 }, 'da_DK')).toBe('om 5 minutter')
    expect(describeTimeLeft({ unit: 'hours', count: 3 }, 'sv')).toBe('in 3 hours')
    expect(reminderLanguage('not a locale!!')).toBe('en')
    expect(reminderLanguage(null)).toBe('en')
    expect(reminderLanguage('dar')).toBe('en')
  })

  it('formats the time in the locale, and falls back to English for a locale Intl rejects', () => {
    const when = new Date('2027-06-28T08:00:00.000Z')
    expect(formatShiftWhen(when, 'en', 'Europe/Berlin')).toContain('10:00')
    expect(() => formatShiftWhen(when, 'not a locale!!', 'Europe/Berlin')).not.toThrow()
    expect(formatShiftWhen(when, 'not a locale!!', 'Europe/Berlin')).toBe(formatShiftWhen(when, 'en', 'Europe/Berlin'))
    expect(formatShiftWhen(when, null, 'Europe/Berlin')).toBe(formatShiftWhen(when, 'en', 'Europe/Berlin'))
  })

  it('builds the reminder email with the template, escaped html and the link', () => {
    const left = { unit: 'hours', count: 2 } as const
    const email = buildShiftReminderEmail({ email: 'ann@example.com', variables, offset: 120, left, url: 'https://example.com/shifts/sha_1?a=1&b=2', locale: 'en' })!
    expect(email.to).toBe('ann@example.com')
    expect(email.subject).toBe('Reminder: your shift starts in 2 hours')
    expect(email.body).toContain('Hi Ann &lt;b&gt;')
    expect(email.body).toContain('a=1&amp;b=2')
    expect(email.text).toContain('Bar (Lead) starts in 2 hours: 28 Jun 2027, 12:00, Main bar.')
    expect(email.template).toMatchObject({ name: 'shifts-reminder', locale: 'en', props: { heading: 'Your shift is coming up', button: 'See your shift', greeting: 'Hi Ann <b>,' } })
    expect(buildShiftReminderEmail({ email: null, variables, offset: 120, left })).toBeNull()
    expect(buildShiftReminderEmail({ email: 'ann@example.com', variables, offset: 120, left })!.text).not.toContain('http')
    // Danish: subject, text, greeting, heading and button.
    const da = buildShiftReminderEmail({ email: 'ann@example.com', variables, offset: 120, left, locale: 'da' })!
    expect(da.subject).toBe('Påmindelse: din vagt starter om 2 timer')
    expect(da.text).toContain('Hej Ann <b>,')
    expect(da.text).toContain('Din vagt på Bar (Lead) starter om 2 timer: 28 Jun 2027, 12:00, Main bar.')
    expect(da.template).toMatchObject({ locale: 'da', props: { heading: 'Din vagt nærmer sig', button: 'Se din vagt', greeting: 'Hej Ann <b>,' } })
    // A garbage locale gets the English text.
    expect(buildShiftReminderEmail({ email: 'ann@example.com', variables, offset: 120, left, locale: 'not a locale!!' })!.subject).toBe('Reminder: your shift starts in 2 hours')
  })

  it('builds the reminder SMS only with a phone number', () => {
    const left = { unit: 'hours', count: 2 } as const
    expect(buildShiftReminderSms({ phone: null, variables, offset: 120, left })).toBeNull()
    expect(buildShiftReminderSms({ phone: '+4512345678', variables, offset: 120, left, url: 'https://example.com/s' })).toMatchObject({
      to: '+4512345678',
      body: 'Your shift on Bar (Lead) starts in 2 hours: 28 Jun 2027, 12:00, Main bar. https://example.com/s',
    })
    expect(buildShiftReminderSms({ phone: '+4512345678', variables, offset: 120, left, locale: 'da' })!.body).toBe('Din vagt på Bar (Lead) starter om 2 timer: 28 Jun 2027, 12:00, Main bar.')
  })

  it('builds the broadcast email and SMS', () => {
    const email = buildShiftBroadcastEmail({ email: 'ann@example.com', name: 'Ann', subject: 'Briefing', message: 'Line 1\nLine 2\n\nPara <2>', locale: 'en' })!
    expect(email.template).toMatchObject({ name: 'shifts-broadcast', props: { subject: 'Briefing' } })
    expect(email.body).toContain('<p>Line 1<br>Line 2</p><p>Para &lt;2&gt;</p>')
    expect(buildShiftBroadcastEmail({ email: null, name: 'Ann', subject: 's', message: 'm' })).toBeNull()
    expect(buildShiftBroadcastSms({ phone: null, subject: 's', message: 'm' })).toBeNull()
    expect(buildShiftBroadcastSms({ phone: '+45', subject: 'Briefing', message: 'Come at 9' })).toMatchObject({ to: '+45', body: 'Briefing\nCome at 9' })
  })
})
