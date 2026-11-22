// A hand-written iCalendar (RFC 5545) writer for the shifts feed: CRLF line ends, lines folded at 75 octets, text
// escaped, instants in UTC. No dependency, so it runs on every runtime and is tested as a unit.

const encoder = new TextEncoder()

/**
 * Escapes a TEXT value: backslash, semicolon, comma and line breaks. Control characters (U+0000-0008, U+000B-001F,
 * U+007F) are not allowed in a TEXT value and would break the file or the line: they are dropped (a tab stays).
 */
export function icsEscape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n')
    // eslint-disable-next-line no-control-regex -- stripping them is the point
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '')
}

/** An instant as `YYYYMMDDTHHMMSSZ` (UTC). */
export function icsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

/**
 * Folds a content line: no line is longer than 75 octets, the continuations start with one space. A multi-byte
 * character is never split.
 */
export function icsFold(line: string): string {
  if (encoder.encode(line).length <= 75) return line
  const lines: string[] = []
  let current = ''
  let size = 0
  for (const char of line) {
    const bytes = encoder.encode(char).length
    // A continuation line holds the leading space, so 74 octets of content.
    const limit = lines.length === 0 ? 75 : 74
    if (size + bytes > limit) {
      lines.push(current)
      current = ''
      size = 0
    }
    current += char
    size += bytes
  }
  lines.push(current)
  return lines.map((part, index) => index === 0 ? part : ` ${part}`).join('\r\n')
}

/** One event of a feed. `end` is exclusive. */
export type IcsEvent = {
  uid: string
  start: Date
  end: Date
  summary: string
  description?: string
  location?: string
  url?: string
  /** When the event was last changed (`DTSTAMP`); defaults to the calendar's `generatedAt`. */
  stamp?: Date
  status?: 'CONFIRMED' | 'CANCELLED' | 'TENTATIVE'
}

/** A whole calendar as one string (CRLF line ends, ending with a final CRLF). */
export function buildIcs(input: { name: string, events: readonly IcsEvent[], generatedAt?: Date, prodId?: string }): string {
  const generatedAt = input.generatedAt ?? new Date()
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${input.prodId ?? '-//frigear-nu//shifts//EN'}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEscape(input.name)}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ]
  for (const event of input.events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${event.uid}`,
      `DTSTAMP:${icsDate(event.stamp ?? generatedAt)}`,
      `DTSTART:${icsDate(event.start)}`,
      `DTEND:${icsDate(event.end)}`,
      `SUMMARY:${icsEscape(event.summary)}`,
    )
    if (event.location) lines.push(`LOCATION:${icsEscape(event.location)}`)
    if (event.description) lines.push(`DESCRIPTION:${icsEscape(event.description)}`)
    if (event.url) lines.push(`URL:${event.url}`)
    lines.push(`STATUS:${event.status ?? 'CONFIRMED'}`, 'END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return `${lines.map(icsFold).join('\r\n')}\r\n`
}
