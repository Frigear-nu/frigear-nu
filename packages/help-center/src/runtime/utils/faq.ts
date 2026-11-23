import { translate } from '@frigear-nu/ui/translated'
import type { FaqBodyLink, FaqBodyParts, FaqCardProps, HelpArticleDto, HelpCategoryDisplay, HelpCategoryKind, HelpFaqDto } from '../../types'
import { stripMarkdown } from './markdown'

/**
 * Maps an accordion category to the props of `FaqCard`, in `locale` (falling back to `fallback`, then `en`): the
 * category's name and description become the card's, and each article a question that opens on its text. Articles
 * without text in the language show another one instead of nothing, as `translate` does.
 *
 * In an app use the auto-imported `toFaqCardProps(faq)`, which reads the current locale itself.
 */
export function faqCardProps(faq: HelpFaqDto, locale = 'en', fallback?: string): FaqCardProps {
  const tr = (value: Parameters<typeof translate>[0]) => translate(value, locale, fallback)
  const description = tr(faq.description)
  return {
    title: tr(faq.name),
    description: description || undefined,
    icon: faq.icon ?? undefined,
    faqs: faq.articles.map(article => ({
      title: tr(article.title),
      details: tr(article.body) || undefined,
      icon: article.icon ?? undefined,
      as: article.id,
      links: article.links.length ? article.links.map(link => ({ label: link.label, to: link.to, ...(link.icon ? { icon: link.icon } : {}) })) : undefined,
    })),
  }
}

/** The displays that suit each kind: questions for `faq`, an article list or questions for `help`. */
const KIND_DISPLAYS: Record<HelpCategoryKind, readonly HelpCategoryDisplay[]> = {
  help: ['list', 'accordion'],
  faq: ['cards', 'accordion'],
}

/** The display a category of `kind` starts with: `cards` for `faq`, `list` for `help`. */
export const defaultHelpDisplay = (kind: HelpCategoryKind): HelpCategoryDisplay => KIND_DISPLAYS[kind][0]!

/**
 * The display a category keeps when it changes to `kind`: its own when it suits the kind, the kind's default otherwise
 * (a `list` becomes `cards` in an FAQ, `cards` a `list` in the help center; `accordion` suits both).
 */
export const helpDisplayForKind = (kind: HelpCategoryKind, display: HelpCategoryDisplay): HelpCategoryDisplay =>
  KIND_DISPLAYS[kind].includes(display) ? display : defaultHelpDisplay(kind)

/** The text of an article as the parts of its card, by the text (any locale): what `splitFaqBody` made of each. */
export type FaqBodyPartsMap = Record<string, FaqBodyParts>

/**
 * One card per article, the props of `FaqCard` in `locale` (a `cards` category): the article's title and icon, then the
 * parts of its text (`parts`, from `splitFaqBody`): the description, the questions that open in the card, and the buttons
 * at its foot (the article's `links` follow those of its text). A text that was not split (no MDC in the app) is the
 * whole description.
 */
export function articleCardProps(article: HelpArticleDto, locale = 'en', fallback?: string, parts: FaqBodyPartsMap = {}): FaqCardProps {
  const tr = (value: Parameters<typeof translate>[0]) => translate(value, locale, fallback)
  const body = tr(article.body)
  const split = parts[body] ?? { description: body, details: [], links: [] }
  const links = [
    ...split.links,
    ...article.links.map(link => ({ label: link.label, to: link.to, ...(link.icon ? { icon: link.icon } : {}) })),
  ] as NonNullable<FaqCardProps['links']>
  return {
    title: tr(article.title),
    description: split.description || undefined,
    icon: article.icon ?? undefined,
    faqs: split.details.map(detail => ({ title: detail.label, icon: detail.icon, lines: detail.lines })),
    ...(links.length ? { links } : {}),
    ...(split.contact ? { contact: split.contact as NonNullable<FaqCardProps['contact']> } : {}),
  }
}

/**
 * The cards of a category: one per article for a `cards` category (`articleCardProps`), else the one card of the
 * category (`faqCardProps`).
 */
export function faqCardsProps(faq: HelpFaqDto, locale = 'en', fallback?: string, parts: FaqBodyPartsMap = {}): FaqCardProps[] {
  return faq.display === 'cards'
    ? faq.articles.map(article => articleCardProps(article, locale, fallback, parts))
    : [faqCardProps(faq, locale, fallback)]
}

/** A node of the tree `parseMarkdown` (`@nuxtjs/mdc`) answers: the part of it the splitter reads. */
export type FaqMdcNode = {
  type: string
  tag?: string
  value?: string
  props?: Record<string, unknown>
  children?: FaqMdcNode[]
}

/** `parseMarkdown` of `@nuxtjs/mdc` (the part the splitter uses). */
export type FaqMarkdownParser = (markdown: string) => Promise<{ body?: { children?: FaqMdcNode[] } | null } | null | undefined>
/** `stringifyMarkdown` of `@nuxtjs/mdc` (the part the splitter uses). */
export type FaqMarkdownStringifier = (body: { type: 'root', children: FaqMdcNode[] }, data: Record<string, never>) => Promise<string | null>

const FAQ_BLOCKS = new Set(['faq-details', 'faq-link', 'faq-contact'])
const BLOCK_TAGS = new Set(['p', 'ul', 'ol', 'li', 'blockquote', 'pre', 'hr', 'table', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'])

/** The props of a block, `kebab-case` names as `camelCase`, and `:name` bindings (JSON in MDC) read back. */
function blockProps(node: FaqMdcNode): Record<string, unknown> {
  const props: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(node.props ?? {})) {
    let name = key
    let read = value
    if (name.startsWith(':')) {
      name = name.slice(1)
      if (typeof value === 'string') {
        try {
          read = JSON.parse(value)
        }
        catch {
          read = value
        }
      }
    }
    props[name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())] = read
  }
  return props
}

const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : undefined

function attributes(props: Record<string, unknown> | undefined): string {
  const entries = Object.entries(props ?? {})
  if (!entries.length) return ''
  const one = ([key, value]: [string, unknown]) => {
    if (typeof value === 'string' && !key.startsWith(':')) return `${key}="${value.replace(/"/g, '&quot;')}"`
    return `${key.startsWith(':') ? key : `:${key}`}='${typeof value === 'string' ? value : JSON.stringify(value)}'`
  }
  return `{${entries.map(one).join(' ')}}`
}

/** Inline nodes back to Markdown/MDC. The marks of the FAQ texts are written here: see `splitFaqBody`. */
function inlineMarkdown(nodes: readonly FaqMdcNode[]): string {
  return nodes.map((node) => {
    if (node.type === 'text') return node.value ?? ''
    if (node.type !== 'element') return ''
    const inner = inlineMarkdown(node.children ?? [])
    switch (node.tag) {
      case 'strong': return `**${inner}**`
      case 'em': return `*${inner}*`
      case 'del': return `~~${inner}~~`
      case 'code': return '`' + inner + '`'
      case 'br': return ':br'
      case 'a': return `[${inner}](${String(node.props?.href ?? '')})`
      case 'img': return `![${String(node.props?.alt ?? '')}](${String(node.props?.src ?? '')})`
      case 'span': return node.props && Object.keys(node.props).length ? `[${inner}]${attributes(node.props)}` : inner
      default: return `:${node.tag}${inner ? `[${inner}]` : ''}${attributes(node.props)}`
    }
  }).join('')
}

const isInline = (node: FaqMdcNode): boolean => node.type === 'text'
  || (node.type === 'element' && !BLOCK_TAGS.has(node.tag ?? '') && !(node.children ?? []).some(child => !isInline(child)))

/** The text of a list item: its inline content, or its paragraphs and nested lists. */
async function itemMarkdown(item: FaqMdcNode, stringify?: FaqMarkdownStringifier): Promise<string> {
  const children = item.children ?? []
  if (children.every(isInline)) return inlineMarkdown(children).trim()
  return await blocksMarkdown(children, stringify)
}

const textOf = (node: FaqMdcNode): string => node.type === 'text' ? node.value ?? '' : (node.children ?? []).map(textOf).join('')

async function blockMarkdown(node: FaqMdcNode, stringify?: FaqMarkdownStringifier): Promise<string> {
  if (isInline(node)) return inlineMarkdown([node])
  switch (node.tag) {
    case 'p':
      return inlineMarkdown(node.children ?? [])
    case 'ul':
    case 'ol': {
      const items = (node.children ?? []).filter(child => child.tag === 'li')
      const lines = await Promise.all(items.map(async (item, index) => {
        const marker = node.tag === 'ol' ? `${index + 1}. ` : '- '
        return marker + (await itemMarkdown(item, stringify)).replace(/\n/g, `\n${' '.repeat(marker.length)}`)
      }))
      return lines.join('\n')
    }
    case 'blockquote':
      return (await blocksMarkdown(node.children ?? [], stringify)).split('\n').map(line => `> ${line}`).join('\n')
    case 'hr':
      return '---'
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      return `${'#'.repeat(Number(node.tag.slice(1)))} ${inlineMarkdown(node.children ?? [])}`
  }
  // Anything else (a table, code, a block component) goes through `stringifyMarkdown`; without it, its text.
  try {
    const written = stringify ? await stringify({ type: 'root', children: [node] }, {}) : null
    if (written) return written.trim()
  }
  catch {
    // Falls back to the text below.
  }
  return textOf(node)
}

async function blocksMarkdown(nodes: readonly FaqMdcNode[], stringify?: FaqMarkdownStringifier): Promise<string> {
  const kept = nodes.filter(node => node.type !== 'text' || node.value?.trim())
  const written = await Promise.all(kept.map(node => blockMarkdown(node, stringify)))
  return written.filter(Boolean).join('\n\n').trim()
}

/**
 * Splits the text of a `cards` article into the parts of its card, with `parseMarkdown` of `@nuxtjs/mdc` (and
 * `stringifyMarkdown` for blocks it does not write itself):
 *
 *     Ansøgning → Generalforsamling → Svar.            <- the description: the Markdown outside the blocks
 *
 *     ::faq-details{label="Mere om processen..." icon="i-lucide-check-circle"}
 *     - ✅ Ansøgning indsendt senest 10 dage før.      <- one line of the question per list item
 *     ::
 *
 *     ::faq-link{label="Bliv medlem" to="/membership" icon="i-lucide-user-plus" trailing-icon="i-lucide-arrow-right" variant="subtle" size="lg"}
 *     ::
 *
 *     ::faq-contact{label="Kontakt os" :initial='{"subject":"other"}'}
 *     ::
 *
 * Bold, italics, links and inline components such as `:br` are written back as they were. (`stringifyMarkdown` of
 * `@nuxtjs/mdc` with `remark-mdc` 3.11 and `mdast-util-to-markdown` 2.1 overflows the stack on bold and italics, so
 * the inline marks are written here.) Without a parser (an app without MDC) the whole text is the description.
 */
export async function splitFaqBody(body: string, parse?: FaqMarkdownParser, stringify?: FaqMarkdownStringifier): Promise<FaqBodyParts> {
  const whole: FaqBodyParts = { description: body.trim(), details: [], links: [] }
  if (!parse || !body.trim()) return whole
  let nodes: FaqMdcNode[]
  try {
    nodes = (await parse(body))?.body?.children ?? []
  }
  catch {
    return whole
  }
  const parts: FaqBodyParts = { description: '', details: [], links: [] }
  const rest: FaqMdcNode[] = []
  for (const node of nodes) {
    if (node.type !== 'element' || !FAQ_BLOCKS.has(node.tag ?? '')) {
      rest.push(node)
      continue
    }
    const props = blockProps(node)
    const children = (node.children ?? []).filter(child => child.type !== 'text' || child.value?.trim())
    if (node.tag === 'faq-details') {
      const lines: string[] = []
      for (const child of children) {
        if (child.tag === 'ul' || child.tag === 'ol') {
          for (const item of (child.children ?? []).filter(entry => entry.tag === 'li')) lines.push(await itemMarkdown(item, stringify))
        }
        else {
          lines.push(await blockMarkdown(child, stringify))
        }
      }
      const icon = text(props.icon)
      parts.details.push({ label: text(props.label) ?? '', ...(icon ? { icon } : {}), lines: lines.filter(Boolean) })
    }
    else if (node.tag === 'faq-link') {
      const link: FaqBodyLink = {}
      for (const key of ['label', 'to', 'icon', 'trailingIcon', 'variant', 'size', 'color', 'target'] as const) {
        const value = text(props[key])
        if (value) link[key] = value
      }
      // `::faq-link{to="..."}` with its label as the content of the block.
      const label = link.label ?? (inlineMarkdown(children.flatMap(child => child.tag === 'p' ? child.children ?? [] : [child])).trim() || undefined)
      parts.links.push(label ? { ...link, label } : link)
    }
    else {
      const initial = props.initial && typeof props.initial === 'object' && !Array.isArray(props.initial) ? props.initial as Record<string, unknown> : undefined
      const label = text(props.label)
      parts.contact = { ...(label ? { label } : {}), ...(initial ? { initial } : {}) }
    }
  }
  parts.description = await blocksMarkdown(rest, stringify)
  return parts
}

/**
 * Splits the text of every article of the `cards` categories among `faqs`, in every locale, keyed by the text (what
 * `articleCardProps` looks up). Empty without a parser.
 */
export async function faqBodyPartsOf(faqs: readonly HelpFaqDto[], parse?: FaqMarkdownParser, stringify?: FaqMarkdownStringifier): Promise<FaqBodyPartsMap> {
  if (!parse) return {}
  const bodies = new Set<string>()
  for (const faq of faqs) {
    if (faq.display !== 'cards') continue
    for (const article of faq.articles) {
      for (const value of typeof article.body === 'string' ? [article.body] : Object.values(article.body ?? {})) {
        if (value) bodies.add(value)
      }
    }
  }
  const entries = await Promise.all([...bodies].map(async body => [body, await splitFaqBody(body, parse, stringify)] as const))
  return Object.fromEntries(entries)
}

/** A `Question` entity of the JSON-LD with the id of its article, for the articles anonymous visitors read. */
export function faqJsonLdQuestions(faqs: readonly HelpFaqDto[], locale = 'en', fallback?: string): Array<{ id: string, entity: Record<string, unknown> }> {
  const tr = (value: Parameters<typeof translate>[0]) => stripMarkdown(translate(value, locale, fallback))
  return faqs
    .filter(faq => faq.public)
    .flatMap(faq => faq.articles.filter(article => article.public))
    .map(article => ({
      id: article.id,
      entity: { '@type': 'Question', 'name': tr(article.title), 'acceptedAnswer': { '@type': 'Answer', 'text': tr(article.body) } },
    }))
    .filter(({ entity }) => entity.name && (entity.acceptedAnswer as { text: string }).text)
}

/** The one `FAQPage` JSON-LD of some `Question` entities, or `null` when there are none. */
export function faqPageFromQuestions(questions: ReadonlyArray<{ id: string, entity: Record<string, unknown> }>): Record<string, unknown> | null {
  // One entity per article id: the same category shown twice on a page is listed once.
  const mainEntity = [...new Map(questions.map(question => [question.id, question.entity])).values()]
  if (!mainEntity.length) return null
  return { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity }
}

/** The `FAQPage` JSON-LD of accordion and cards categories: only what anonymous visitors read, as plain text. `null` when there is none. */
export function faqPageJsonLd(faqs: readonly HelpFaqDto[], locale = 'en', fallback?: string): Record<string, unknown> | null {
  return faqPageFromQuestions(faqJsonLdQuestions(faqs, locale, fallback))
}

/** What a submitted order gets wrong compared with the category's articles. All empty when it is valid. */
export type HelpReorderProblems = {
  /** Ids of the category's articles that the order leaves out. */
  missing: string[]
  /** Ids in the order that are not articles of the category. */
  unknown: string[]
  /** Ids that appear more than once. */
  duplicates: string[]
}

/**
 * Checks a reorder request: `submitted` must list exactly the ids of `current`, each once. Anything else could drop an
 * article from the order or move an article of another category, so the route refuses it with `400`.
 */
export function checkReorder(current: readonly string[], submitted: readonly string[]): HelpReorderProblems {
  const known = new Set(current)
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  const unknown: string[] = []
  for (const id of submitted) {
    if (seen.has(id)) duplicates.add(id)
    seen.add(id)
    if (!known.has(id)) unknown.push(id)
  }
  return {
    missing: current.filter(id => !seen.has(id)),
    unknown: [...new Set(unknown)],
    duplicates: [...duplicates],
  }
}

export const isValidReorder = (problems: HelpReorderProblems) =>
  !problems.missing.length && !problems.unknown.length && !problems.duplicates.length

/** Moves `from` to `to` in a copy of `ids` (the up/down buttons and the drag handle of the order editor). */
export function moveId(ids: readonly string[], from: number, to: number): string[] {
  const next = [...ids]
  if (from === to || from < 0 || to < 0 || from >= next.length || to >= next.length) return next
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved!)
  return next
}
