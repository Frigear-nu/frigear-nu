const escape = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const safeHref = (href: string) => /^(?:https?:\/\/|\/(?![/\\])|mailto:)/.test(href)

/**
 * Tiny, safe renderer for `markdown` fields: escapes everything, then supports `**bold**`,
 * `_italic_`, `[text](https://…)` links and blank-line separated paragraphs.
 */
export function renderMarkdown(source: string): string {
  return source
    .split(/\n{2,}/)
    .map(paragraph => escape(paragraph.trim())
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\b_(.+?)_\b/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label, href) =>
        safeHref(href.replace(/&amp;/g, '&')) ? `<a href="${href}" target="_blank" rel="noopener" class="underline">${label}</a>` : match)
      .replace(/\n/g, '<br>'))
    .filter(Boolean)
    .map(paragraph => `<p>${paragraph}</p>`)
    .join('')
}

/**
 * Prepends `data` as frontmatter so MDC (`<MDC :value>`) can resolve `{{ name }}` in the text.
 * JSON values are valid YAML, which keeps quoting safe for arbitrary strings.
 */
export function withMdcData(source: string, data?: Record<string, unknown>): string {
  const entries = Object.entries(data ?? {}).filter(([, value]) => value !== undefined)
  if (!entries.length) return source
  return `---\n${entries.map(([key, value]) => `${JSON.stringify(key)}: ${JSON.stringify(value)}`).join('\n')}\n---\n${source}`
}
