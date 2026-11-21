import { describe, expect, it } from 'vitest'
import { buildIcs, icsDate, icsEscape, icsFold } from '../../src/runtime/utils/ics'

const encoder = new TextEncoder()

describe('iCalendar writer', () => {
  it('escapes backslashes, semicolons, commas and line breaks', () => {
    expect(icsEscape('Bar; Nord, "Early"\\late\nnext\r\nlast')).toBe('Bar\\; Nord\\, "Early"\\\\late\\nnext\\nlast')
  })

  it('writes instants in UTC without separators', () => {
    expect(icsDate(new Date('2027-06-28T08:00:00.000Z'))).toBe('20270628T080000Z')
  })

  it('folds lines at 75 octets with a leading space on the continuations, and never splits a character', () => {
    const short = 'SUMMARY:short'
    expect(icsFold(short)).toBe(short)
    const long = `DESCRIPTION:${'abcdefghij'.repeat(20)}`
    const folded = icsFold(long)
    const lines = folded.split('\r\n')
    expect(lines.length).toBeGreaterThan(1)
    expect(lines.every(line => encoder.encode(line).length <= 75)).toBe(true)
    expect(lines.slice(1).every(line => line.startsWith(' '))).toBe(true)
    // Unfolding gives the line back.
    expect(folded.replace(/\r\n /g, '')).toBe(long)

    // Two-byte and four-byte characters stay whole.
    const text = `SUMMARY:${'æøå'.repeat(30)}${'😀'.repeat(10)}`
    const unicode = icsFold(text)
    expect(unicode.split('\r\n').every(line => encoder.encode(line).length <= 75)).toBe(true)
    expect(unicode.replace(/\r\n /g, '')).toBe(text)
  })

  it('builds a calendar with CRLF line ends, a final CRLF and the fields of each event', () => {
    const ics = buildIcs({
      name: 'My shifts',
      generatedAt: new Date('2027-06-01T00:00:00.000Z'),
      events: [
        {
          uid: 'sha_1@shifts.frigear-nu',
          start: new Date('2027-06-28T08:00:00.000Z'),
          end: new Date('2027-06-28T14:00:00.000Z'),
          summary: 'Bar, Nord · BA',
          location: 'Main bar',
          description: 'Line one\nhttps://example.com/shifts/sha_1',
          url: 'https://example.com/shifts/sha_1',
          stamp: new Date('2027-06-02T10:00:00.000Z'),
        },
        { uid: 'sha_2@shifts.frigear-nu', start: new Date('2027-06-29T08:00:00.000Z'), end: new Date('2027-06-29T09:00:00.000Z'), summary: 'Plain' },
      ],
    })
    expect(ics.endsWith('\r\n')).toBe(true)
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/)
    const lines = ics.split('\r\n')
    expect(lines[0]).toBe('BEGIN:VCALENDAR')
    expect(lines).toContain('VERSION:2.0')
    expect(lines).toContain('X-WR-CALNAME:My shifts')
    expect(lines.filter(line => line === 'BEGIN:VEVENT')).toHaveLength(2)
    expect(lines).toContain('DTSTART:20270628T080000Z')
    expect(lines).toContain('DTEND:20270628T140000Z')
    expect(lines).toContain('DTSTAMP:20270602T100000Z')
    // The event without a stamp takes the calendar's.
    expect(lines).toContain('DTSTAMP:20270601T000000Z')
    expect(lines).toContain('SUMMARY:Bar\\, Nord · BA')
    expect(lines).toContain('LOCATION:Main bar')
    expect(lines.some(line => line.startsWith('DESCRIPTION:Line one\\nhttps'))).toBe(true)
    expect(lines).toContain('UID:sha_1@shifts.frigear-nu')
    expect(lines.filter(line => line === 'STATUS:CONFIRMED')).toHaveLength(2)
    expect(lines.at(-2)).toBe('END:VCALENDAR')
  })
})
