/**
 * Tiny inline-markup parser used by `TypewriterEffect`.
 *
 * The whole phrase is parsed up front ("read ahead") into styled graphemes, so a
 * partially typed phrase never shows raw markers or leaves a style unclosed.
 *
 * Supported: `[text]{.class-a.class-b}`, `**bold**`, `*italic*`, `_italic_`,
 * `` `code` `` and `\` escapes. Unmatched markers are kept as literal text.
 */
export type TypewriterStyle = {
  bold: boolean
  italic: boolean
  code: boolean
  classes: string[]
}

export type TypewriterCell = TypewriterStyle & { char: string }

export type TypewriterRun = {
  text: string
  class: string
}

const BASE_STYLE: TypewriterStyle = { bold: false, italic: false, code: false, classes: [] }

const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl
  ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  : null

export const splitGraphemes = (text: string): string[] =>
  segmenter ? Array.from(segmenter.segment(text), x => x.segment) : Array.from(text)

// `.mt-2.text-sm` / `.mt-2 .text-sm`; a dot followed by a digit belongs to the class (`.p-1.5`).
const parseClasses = (attrs: string): string[] =>
  Array.from(attrs.matchAll(/\.((?:[^\s.]|\.(?=\d))+)/g), m => m[1]!)

/** Index of the `]` matching the `[` at `open`, honouring nesting and escapes. */
function findBracketEnd(src: string, open: number): number {
  let depth = 0
  for (let i = open; i < src.length; i++) {
    const c = src[i]
    if (c === '\\') {
      i++
    } else if (c === '[') {
      depth++
    } else if (c === ']' && --depth === 0) {
      return i
    }
  }
  return -1
}

/** Index of the next unescaped `marker` after `from`, or -1. */
function findClosing(src: string, marker: string, from: number): number {
  for (let i = from; i < src.length; i++) {
    if (src[i] === '\\') {
      i++
    } else if (src.startsWith(marker, i)) {
      return i
    }
  }
  return -1
}

export function parseInlineMarkup(src: string, base: TypewriterStyle = BASE_STYLE): TypewriterCell[] {
  const cells: TypewriterCell[] = []
  let plain = ''

  const flush = () => {
    if (!plain) return
    for (const char of splitGraphemes(plain)) cells.push({ ...base, char })
    plain = ''
  }

  const nested = (inner: string, patch: Partial<TypewriterStyle>) => {
    flush()
    cells.push(...parseInlineMarkup(inner, { ...base, ...patch }))
  }

  let i = 0
  while (i < src.length) {
    const c = src[i]!

    if (c === '\\' && i + 1 < src.length) {
      plain += src[i + 1]
      i += 2
      continue
    }

    if (c === '[') {
      const end = findBracketEnd(src, i)
      const attrs = end > -1 ? /^\{([^}]*)\}/.exec(src.slice(end + 1)) : null
      if (end > -1 && attrs) {
        nested(src.slice(i + 1, end), { classes: [...base.classes, ...parseClasses(attrs[1]!)] })
        i = end + 1 + attrs[0].length
        continue
      }
    }

    if (c === '`') {
      const end = findClosing(src, '`', i + 1)
      if (end > i + 1) {
        flush()
        for (const char of splitGraphemes(src.slice(i + 1, end))) cells.push({ ...base, code: true, char })
        i = end + 1
        continue
      }
    }

    if (src.startsWith('**', i)) {
      const end = findClosing(src, '**', i + 2)
      if (end > i + 2) {
        nested(src.slice(i + 2, end), { bold: true })
        i = end + 2
        continue
      }
    }

    if (c === '*' || (c === '_' && !/\w/.test(src[i - 1] ?? ''))) {
      const end = findClosing(src, c, i + 1)
      if (end > i + 1 && src[end + 1] !== c) {
        nested(src.slice(i + 1, end), { italic: true })
        i = end + 1
        continue
      }
    }

    plain += c
    i++
  }

  flush()
  return cells
}

const styleClass = (cell: TypewriterStyle): string =>
  [cell.bold && 'font-bold', cell.italic && 'italic', cell.code && 'font-mono', ...cell.classes]
    .filter(Boolean)
    .join(' ')

/** Group the first `count` cells into runs of identical styling for rendering. */
export function typewriterRuns(cells: TypewriterCell[], count = cells.length): TypewriterRun[] {
  const runs: TypewriterRun[] = []
  for (const cell of cells.slice(0, count)) {
    const cls = styleClass(cell)
    const last = runs[runs.length - 1]
    if (last && last.class === cls) last.text += cell.char
    else runs.push({ text: cell.char, class: cls })
  }
  return runs
}

export const typewriterPlainText = (cells: TypewriterCell[]): string => cells.map(c => c.char).join('')
