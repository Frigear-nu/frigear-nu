import { translate } from '@frigear-nu/ui/translated'
import type { FaqCardProps, HelpFaqDto } from '../../types'
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

/** The `FAQPage` JSON-LD of accordion categories: only what anonymous visitors read, as plain text. `null` when there is none. */
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
