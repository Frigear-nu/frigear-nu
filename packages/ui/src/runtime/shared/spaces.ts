// ICU versions differ in the spaces they put around range dashes, before AM/PM, between digit groups and next to a
// currency (U+0020 plain, U+2009 thin, U+202F narrow no-break, U+00A0 no-break), so Node on the server and the visitor's
// browser would otherwise render different text for the same value and the page would fail to hydrate. Every formatter
// puts one space there instead: U+00A0, the no-break space, so a time ("10:00 AM"), an amount ("1 234,50 €") or a range
// dash stays on one line. Ordinary word spaces ("15 Oct 2026") are the same in every ICU version and stay plain.
// Outside `runtime/utils` so the names are not auto-imported into host apps.

/** U+00A0, the no-break space every formatter emits where ICU puts a special space. */
export const NO_BREAK_SPACE = String.fromCharCode(0xA0)

const ICU_SPACES = /[\xA0\u2009\u202F]/g
const ANY_SPACE = /[ \xA0\u2009\u202F]/g
const RANGE_DASH = /[–—-]/

/** `text` with every ICU space (thin, narrow no-break, no-break) replaced by U+00A0; plain spaces stay. */
export const noBreakSpaces = (text: string): string => text.replace(ICU_SPACES, NO_BREAK_SPACE)

/** `text` with every space, plain ones too, replaced by U+00A0: for a value that is one unit, such as an amount. */
export const allNoBreakSpaces = (text: string): string => text.replace(ANY_SPACE, NO_BREAK_SPACE)

type Part = { type: string, value: string, source?: string }

/**
 * Joins `formatToParts` / `formatRangeToParts` output with `noBreakSpaces`, and with every space (plain ones too) as
 * U+00A0 in the literals where ICU versions disagree: next to the day period (AM/PM) and around a range's dash.
 */
export function joinNoBreakParts(parts: Part[]): string {
  return parts.map((part, index) => {
    if (part.type !== 'literal') return noBreakSpaces(part.value)
    const nextToDayPeriod = parts[index - 1]?.type === 'dayPeriod' || parts[index + 1]?.type === 'dayPeriod'
    const rangeSeparator = part.source === 'shared' && RANGE_DASH.test(part.value)
    return nextToDayPeriod || rangeSeparator ? allNoBreakSpaces(part.value) : noBreakSpaces(part.value)
  }).join('')
}
