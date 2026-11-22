// ICU versions differ in the spaces they put around range dashes, before AM/PM, between digit groups and next to a
// currency (U+2009 thin, U+202F narrow no-break, U+00A0 no-break), so Node on the server and the visitor's browser would
// otherwise render different text for the same value and the page would fail to hydrate. Every formatter returns plain
// spaces instead. Outside `runtime/utils` so the name is not auto-imported into host apps.

const ICU_SPACES = /[\xA0\u2009\u202F]/g

/** `text` with every ICU space (thin, narrow no-break, no-break) replaced by a plain space. */
export const plainSpaces = (text: string): string => text.replace(ICU_SPACES, ' ')
