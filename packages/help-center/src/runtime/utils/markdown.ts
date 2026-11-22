/**
 * Plain text of a Markdown or MDC body, for JSON-LD and search snippets: code blocks, MDC component fences (`::name{...}`
 * and the closing `::`), inline components such as `:br`, HTML tags and the Markdown marks (links keep their text, images
 * their alt text, headings, quotes, lists, emphasis) are removed. A simple strip, not a Markdown parser: a bold word loses
 * its stars, an unusual construct may keep a stray character.
 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^\s*:{2,}[\w-]*(?:\{.*\})?\s*$/gm, ' ')
    // An inline component (`:br`, `:icon{name="..."}`) on its own: a colon after a space or a line start, then a name.
    // Its `[text]`, if any, stays.
    .replace(/(^|\s):[a-z][\w-]*(?:\[([^\]]*)\])?(?:\{[^}]*\})?(?=\s|$)/gim, '$1$2 ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^\s{0,3}(?:#{1,6}\s+|>\s?|[-*+]\s+|\d+\.\s+)/gm, '')
    .replace(/(\*\*|__|~~|`)/g, '')
    .replace(/\*(\S(?:[^*]*\S)?)\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The start of a plain text, cut at a word boundary, for a card or a meta description. */
export function excerpt(text: string, max = 160): string {
  const plain = stripMarkdown(text)
  if (plain.length <= max) return plain
  const cut = plain.slice(0, max)
  const space = cut.lastIndexOf(' ')
  return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}…`
}
