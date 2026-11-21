import { translate } from '@frigear-nu/ui/translated'
import type { FaqCardProps, FaqGroupDto } from '../../types'

/**
 * Maps a managed group to the props of `FaqCard`, in `locale` (falling back to `fallback`, then `en`): the group's
 * title and description become the card's, and each item a collapsible question. Items without text in the language
 * show another one instead of nothing, as `translate` does.
 *
 * In an app use the auto-imported `toFaqCardProps(group)`, which reads the current locale itself.
 */
export function faqCardProps(group: FaqGroupDto, locale = 'en', fallback?: string): FaqCardProps {
  const tr = (value: Parameters<typeof translate>[0]) => translate(value, locale, fallback)
  const description = tr(group.description)
  return {
    title: tr(group.title),
    description: description || undefined,
    icon: group.icon ?? undefined,
    faqs: group.items.map(item => ({
      title: tr(item.question),
      details: tr(item.answer) || undefined,
      icon: item.icon ?? undefined,
      as: item.id,
      links: item.links.length ? item.links.map(link => ({ label: link.label, to: link.to, ...(link.icon ? { icon: link.icon } : {}) })) : undefined,
    })),
  }
}

/**
 * Plain text of a Markdown or MDC answer, for JSON-LD: code blocks, MDC component fences, HTML tags and the Markdown marks
 * (links keep their text, images their alt text, headings, quotes, lists, emphasis) are removed. A simple strip, not a
 * Markdown parser: a bold word loses its stars, an unusual construct may keep a stray character.
 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^\s*:{2,}[\w-]*(?:\{[^}]*\})?\s*$/gm, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^\s{0,3}(?:#{1,6}\s+|>\s?|[-*+]\s+|\d+\.\s+)/gm, '')
    .replace(/(\*\*|__|~~|`)/g, '')
    .replace(/\*(\S(?:[^*]*\S)?)\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

/** A `Question` entity of the JSON-LD with the id of its item, for the items anonymous visitors read. */
export function faqJsonLdQuestions(groups: readonly FaqGroupDto[], locale = 'en', fallback?: string): Array<{ id: string, entity: Record<string, unknown> }> {
  const tr = (value: Parameters<typeof translate>[0]) => stripMarkdown(translate(value, locale, fallback))
  return groups
    .filter(group => group.public)
    .flatMap(group => group.items.filter(item => item.public))
    .map(item => ({
      id: item.id,
      entity: { '@type': 'Question', 'name': tr(item.question), 'acceptedAnswer': { '@type': 'Answer', 'text': tr(item.answer) } },
    }))
    .filter(({ entity }) => entity.name && (entity.acceptedAnswer as { text: string }).text)
}

/** The one `FAQPage` JSON-LD of some `Question` entities, or `null` when there are none. */
export function faqPageFromQuestions(questions: ReadonlyArray<{ id: string, entity: Record<string, unknown> }>): Record<string, unknown> | null {
  // One entity per item id: the same group shown twice on a page is listed once.
  const mainEntity = [...new Map(questions.map(question => [question.id, question.entity])).values()]
  if (!mainEntity.length) return null
  return { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity }
}

/** The `FAQPage` JSON-LD of groups, for search engines: only the groups and items anonymous visitors read, as plain text. `null` when there is none. */
export function faqPageJsonLd(groups: readonly FaqGroupDto[], locale = 'en', fallback?: string): Record<string, unknown> | null {
  return faqPageFromQuestions(faqJsonLdQuestions(groups, locale, fallback))
}
