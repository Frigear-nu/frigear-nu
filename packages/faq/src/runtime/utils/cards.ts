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

/** The `FAQPage` JSON-LD of groups, for search engines: only the groups and items anonymous visitors read. `null` when there is none. */
export function faqPageJsonLd(groups: readonly FaqGroupDto[], locale = 'en', fallback?: string): Record<string, unknown> | null {
  const tr = (value: Parameters<typeof translate>[0]) => translate(value, locale, fallback)
  const mainEntity = groups
    .filter(group => group.public)
    .flatMap(group => group.items.filter(item => item.public))
    .map(item => ({
      '@type': 'Question',
      'name': tr(item.question),
      'acceptedAnswer': { '@type': 'Answer', 'text': tr(item.answer) },
    }))
    .filter(entry => entry.name && entry.acceptedAnswer.text)
  if (!mainEntity.length) return null
  return { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity }
}
