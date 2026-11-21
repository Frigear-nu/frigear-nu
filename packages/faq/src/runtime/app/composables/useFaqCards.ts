import type { FaqCardProps, FaqGroupDto } from '../../../types'
import { faqCardProps, faqPageJsonLd } from '../../utils/cards'
import { useFaq } from './useFaq'
import { useFaqFallbackLocale, useFaqLocale } from './useFaqLocale'
import { computed, useHead, useRuntimeConfig } from '#imports'

/** What `Faq`, `FaqGrid` and `FaqSectionList` take to say which cards to show. */
export type FaqCardsSource = {
  /** Slugs of managed groups: an array, or a comma separated string (what MDC passes). */
  groups?: string | string[]
  /** Only the groups owned by this operation. */
  operation?: string
  /** Inline cards in the shape of the website's page frontmatter. They follow the managed ones. */
  items?: FaqCardProps[]
  /** A contact button added to every managed card (the card's `contact` prop). */
  contact?: FaqCardProps['contact']
  /** Fetch what anonymous visitors read only: no sign-in, and the response may be cached. */
  public?: boolean
}

/**
 * The cards of a component: the managed groups (fetched through `useFaq`) as `FaqCardProps`, then the inline `items`.
 * Also adds the `FAQPage` JSON-LD of the public managed groups, unless the `schema` option is `false`.
 */
export function useFaqCards(source: () => FaqCardsSource) {
  const initial = source()
  const managed = initial.groups !== undefined || !!initial.operation
    ? useFaq(() => source().groups ?? [], { operationId: () => source().operation, public: initial.public, lazy: true })
    : undefined
  const locale = useFaqLocale()
  const fallback = useFaqFallbackLocale()

  const groups = computed<FaqGroupDto[]>(() => managed?.groups.value ?? [])
  const cards = computed<FaqCardProps[]>(() => {
    const { contact, items = [] } = source()
    const mapped = groups.value.map((group) => {
      const card = faqCardProps(group, locale.value, fallback.value)
      return contact ? { ...card, contact } : card
    })
    return [...mapped, ...items]
  })

  if (managed && useRuntimeConfig().public.faq?.schema !== false) {
    useHead({
      script: computed(() => {
        const jsonLd = faqPageJsonLd(groups.value, locale.value, fallback.value)
        // `<` is escaped so a text containing `</script>` cannot end the tag.
        return jsonLd ? [{ key: `faq-jsonld:${groups.value.map(group => group.slug).join(',')}`, type: 'application/ld+json', innerHTML: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }] : []
      }),
    })
  }

  return {
    cards,
    groups,
    /** The first response of the managed groups is still on its way. */
    loading: computed(() => !!managed && managed.status.value === 'pending' && !groups.value.length),
  }
}
