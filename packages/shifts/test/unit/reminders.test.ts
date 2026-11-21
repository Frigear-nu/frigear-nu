import { describe, expect, it } from 'vitest'
import { DEFAULT_REMINDER_OFFSETS, dueReminderOffsets, normalizeReminderOffsets, reminderOffsetToSend } from '../../src/runtime/utils/reminders'
import { buildShiftBroadcastEmail, buildShiftBroadcastSms, buildShiftReminderEmail, buildShiftReminderSms, describeReminderOffset } from '../../src/runtime/server/reminder-email'

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

describe('reminder and broadcast messages', () => {
  const variables = { name: 'Ann <b>', team: 'Bar', role: 'BA', when: '28 Jun 2027, 12:00', where: 'Main bar', start: startsAt.toISOString() }

  it('words the offset', () => {
    expect(describeReminderOffset(1440)).toBe('in a day')
    expect(describeReminderOffset(2880)).toBe('in 2 days')
    expect(describeReminderOffset(120)).toBe('in 2 hours')
    expect(describeReminderOffset(60)).toBe('in an hour')
    expect(describeReminderOffset(45)).toBe('in 45 minutes')
  })

  it('builds the reminder email with the template, escaped html and the link', () => {
    const email = buildShiftReminderEmail({ email: 'ann@example.com', variables, offset: 120, url: 'https://example.com/shifts/sha_1?a=1&b=2', locale: 'da' })!
    expect(email.to).toBe('ann@example.com')
    expect(email.subject).toBe('Reminder: your shift starts in 2 hours')
    expect(email.body).toContain('Hi Ann &lt;b&gt;')
    expect(email.body).toContain('a=1&amp;b=2')
    expect(email.text).toContain('Bar (BA) starts in 2 hours: 28 Jun 2027, 12:00, Main bar.')
    expect(email.template).toMatchObject({ name: 'shifts-reminder', locale: 'da' })
    expect(buildShiftReminderEmail({ email: null, variables, offset: 120 })).toBeNull()
    expect(buildShiftReminderEmail({ email: 'ann@example.com', variables, offset: 120 })!.text).not.toContain('http')
  })

  it('builds the reminder SMS only with a phone number', () => {
    expect(buildShiftReminderSms({ phone: null, variables, offset: 120 })).toBeNull()
    expect(buildShiftReminderSms({ phone: '+4512345678', variables, offset: 120, url: 'https://example.com/s' })).toMatchObject({
      to: '+4512345678',
      body: 'Your shift on Bar (BA) starts in 2 hours: 28 Jun 2027, 12:00, Main bar. https://example.com/s',
    })
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
