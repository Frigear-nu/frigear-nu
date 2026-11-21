// The Nuxt Content side of the help center, as pure functions: ids, frontmatter rules and grouping the files of a
// collection into articles. The build hook (`module.ts`) and the content source (`server/utils`) use them; tests too.
import type { Translated } from '../../types'
import { HELP_SLUG_PATTERN, isReservedHelpSlug } from './slug'

/** Frontmatter keys that would restrict an article. Content is served to the browser as a whole, so it is always public. */
export const FORBIDDEN_CONTENT_KEYS = ['visibility', 'public'] as const

/** The id of a content article: `content:<collection>:<path>`, with the path without a locale prefix. */
export const contentArticleId = (collection: string, path: string) => `content:${collection}:${path}`

export function isContentArticleId(id: string): boolean {
  return id.startsWith('content:')
}

/** `{ collection, path }` of a content article id, or `null` for anything else. */
export function parseContentArticleId(id: string): { collection: string, path: string } | null {
  const match = /^content:([^:]+):(.+)$/.exec(id)
  return match ? { collection: match[1]!, path: match[2]! } : null
}

/** A file of a collection as the source reads it: the parsed frontmatter fields plus Nuxt Content's own. */
export type HelpContentRow = {
  stem?: string
  path?: string
  title?: string
  slug?: string
  category?: string
  order?: number
  checklist?: string | string[]
  locale?: string
  /** The raw Markdown of the file (the default page schema of Nuxt Content has it). */
  rawbody?: string
  meta?: Record<string, unknown>
  [key: string]: unknown
}

/** An article of Nuxt Content with every language it has. */
export type HelpContentArticle = {
  /** The path without a locale prefix, the part of the id after the collection. */
  key: string
  id: string
  slug: string
  title: Translated
  body: Translated
  categorySlug: string
  order: number
  /** The ids of the checklists the frontmatter adds the article to. */
  checklists: string[]
}

const stripLeadingSlash = (value: string) => value.replace(/^\/+/, '').replace(/\.[a-z0-9]+$/i, '')

/**
 * The key of a file: its stem (or path) without the leading slash, the extension and, when given, a leading
 * `<locale>/` directory. The same article in two languages therefore has one key, and one id.
 */
export function contentRowKey(row: Pick<HelpContentRow, 'stem' | 'path'>, locale?: string): string {
  const raw = stripLeadingSlash(row.stem ?? row.path ?? '')
  if (!locale) return raw
  return raw.startsWith(`${locale}/`) ? raw.slice(locale.length + 1) : raw
}

/** The Markdown of a file without its frontmatter block. */
export function contentBody(row: Pick<HelpContentRow, 'rawbody'>): string {
  const raw = row.rawbody ?? ''
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(raw)
  return (match ? raw.slice(match[0].length) : raw).trim()
}

const metaOf = (row: HelpContentRow) => (row.meta && typeof row.meta === 'object' ? row.meta : {})
const pick = <T>(row: HelpContentRow, key: string): T | undefined => (row[key] ?? metaOf(row)[key]) as T | undefined

const lastSegment = (key: string) => key.split('/').filter(Boolean).pop() ?? key

/** The checklist ids of a row, from `checklist: hck_x` or `checklist: [hck_x, hck_y]`. */
function checklistsOf(row: HelpContentRow): string[] {
  const value = pick<string | string[]>(row, 'checklist')
  return (Array.isArray(value) ? value : value ? [value] : []).filter((entry): entry is string => typeof entry === 'string' && !!entry.trim()).map(entry => entry.trim())
}

/**
 * Groups the files of a collection into articles, one per key, each with the languages it has. `locale` of an entry is
 * the language of the file (the collection suffix in per-locale mode, the `locale` frontmatter otherwise). The slug, the
 * category and the order come from the first file that sets them, the default (first required) language first.
 * Files without a category, or with an unusable slug, are skipped: the build hook already fails on them.
 */
export function groupContentArticles(
  entries: Array<{ row: HelpContentRow, locale: string | undefined }>,
  options: { collection: string, locales: readonly string[] },
): HelpContentArticle[] {
  const rank = (locale: string | undefined) => {
    const index = locale ? options.locales.indexOf(locale) : -1
    return index === -1 ? options.locales.length : index
  }
  const sorted = [...entries].sort((a, b) => rank(a.locale) - rank(b.locale))
  const groups = new Map<string, Array<{ row: HelpContentRow, locale: string | undefined }>>()
  for (const entry of sorted) {
    const key = contentRowKey(entry.row, entry.locale)
    if (!key) continue
    const group = groups.get(key) ?? []
    group.push(entry)
    groups.set(key, group)
  }

  const articles: HelpContentArticle[] = []
  for (const [key, group] of groups) {
    const slug = group.map(({ row }) => pick<string>(row, 'slug')).find(value => typeof value === 'string' && value) ?? lastSegment(key)
    const categorySlug = group.map(({ row }) => pick<string>(row, 'category')).find(value => typeof value === 'string' && value)
    if (!categorySlug || !HELP_SLUG_PATTERN.test(slug) || isReservedHelpSlug(slug)) continue

    const title: Record<string, string> = {}
    const body: Record<string, string> = {}
    for (const { row, locale } of group) {
      const code = locale || '*'
      const rowTitle = typeof row.title === 'string' ? row.title.trim() : ''
      if (rowTitle && !title[code]) title[code] = rowTitle
      const text = contentBody(row)
      if (text && !body[code]) body[code] = text
    }
    const order = group.map(({ row }) => pick<number>(row, 'order')).find(value => typeof value === 'number') ?? 0
    const plain = (map: Record<string, string>): Translated => {
      const codes = Object.keys(map)
      return codes.length === 1 && codes[0] === '*' ? map['*']! : Object.fromEntries(Object.entries(map).filter(([code]) => code !== '*'))
    }
    articles.push({
      key,
      id: contentArticleId(options.collection, key),
      slug,
      title: plain(title),
      body: plain(body),
      categorySlug,
      order,
      checklists: [...new Set(group.flatMap(({ row }) => checklistsOf(row)))],
    })
  }
  return articles.sort((a, b) => a.order - b.order || a.key.localeCompare(b.key))
}

/** The top-level keys of the YAML frontmatter block at the start of a Markdown file. */
export function frontmatterKeys(raw: string): string[] {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw)
  if (!match) return []
  return [...match[1]!.matchAll(/^([a-z_][\w-]*)\s*:/gim)].map(entry => entry[1]!)
}

export type ContentValidation = { errors: string[], warnings: string[] }

/**
 * The build-time rules of one file of the help collection. A file fails the build when it sets `visibility` or `public`
 * (content is public, restricted articles live in the database), has no `category`, or has an unusable `slug`; in the
 * single-collection mode it also needs a `locale`. `keys` is every frontmatter key found (parsed fields, `meta` and the
 * raw block), so a key the collection schema drops is still caught.
 */
export function validateContentFile(
  file: { id?: string, keys: readonly string[], category?: unknown, slug?: unknown, title?: unknown, locale?: unknown },
  options: { perLocale: boolean },
): ContentValidation {
  const where = file.id ? ` (${file.id})` : ''
  const errors: string[] = []
  for (const key of FORBIDDEN_CONTENT_KEYS) {
    if (file.keys.includes(key)) {
      errors.push(`help article${where} sets \`${key}\`: Nuxt Content articles are always public (Nuxt Content serves every collection to the browser). Put restricted articles in the database.`)
    }
  }
  if (typeof file.category !== 'string' || !file.category.trim()) errors.push(`help article${where} needs a \`category\` (the URL name of a category).`)
  else if (!HELP_SLUG_PATTERN.test(file.category) || isReservedHelpSlug(file.category)) errors.push(`help article${where} has an unusable \`category\` "${file.category}": use lowercase letters, numbers and dashes.`)
  if (file.slug !== undefined && (typeof file.slug !== 'string' || !HELP_SLUG_PATTERN.test(file.slug) || isReservedHelpSlug(file.slug))) {
    errors.push(`help article${where} has an unusable \`slug\`: use lowercase letters, numbers and dashes, and not a reserved word.`)
  }
  if (typeof file.title !== 'string' || !file.title.trim()) errors.push(`help article${where} needs a \`title\`.`)
  if (!options.perLocale && (typeof file.locale !== 'string' || !file.locale.trim())) {
    errors.push(`help article${where} needs a \`locale\` (for example \`da\` or \`en\`), because the collection holds every language.`)
  }
  return { errors, warnings: [] }
}

/** The articles of a collection that lack one of the required languages, with the languages they lack. */
export function missingContentLocales(
  records: ReadonlyArray<{ key: string, locale: string | undefined }>,
  required: readonly string[],
): Array<{ key: string, missing: string[] }> {
  const byKey = new Map<string, Set<string>>()
  for (const { key, locale } of records) {
    const locales = byKey.get(key) ?? new Set<string>()
    if (locale) locales.add(locale)
    byKey.set(key, locales)
  }
  return [...byKey.entries()]
    .map(([key, locales]) => ({ key, missing: required.filter(locale => !locales.has(locale)) }))
    .filter(entry => entry.missing.length)
}

/** The name of the per-locale collection of `collection` (`help` and `da` give `help_da`), as the docs site names them. */
export const localizedContentCollection = (collection: string, locale: string) => `${collection}_${locale.replace(/-/g, '_')}`
