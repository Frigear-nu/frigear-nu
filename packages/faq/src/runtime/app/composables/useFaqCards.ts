import type { FaqCardProps, FaqGroupDto } from '../../../types'
import { faqCardProps, faqJsonLdQuestions, faqPageFromQuestions } from '../../utils/cards'
import { useFaq } from './useFaq'
import { useFaqFallbackLocale, useFaqLocale } from './useFaqLocale'
import { computed, getCurrentInstance, onScopeDispose, shallowReactive, useHead, useNuxtApp, useRuntimeConfig } from '#imports'

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

type LdQuestions = Array<{ id: string, entity: Record<string, unknown> }>

/**
 * The questions every component on the page contributes to the JSON-LD, by component. The registry belongs to the app
 * instance (one per request on the server), and a component removes its entry when it goes away, so a page has one
 * `FAQPage` with every public question once, whatever the number of components.
 */
function jsonLdRegistry() {
  const nuxtApp = useNuxtApp() as unknown as { _faqJsonLd?: Map<number, { value: LdQuestions }> }
  return nuxtApp._faqJsonLd ??= shallowReactive(new Map<number, { value: LdQuestions }>())
}

/**
 * The cards of a component: the managed groups (fetched through `useFaq`) as `FaqCardProps`, then the inline `items`.
 * Also adds the public managed questions to the page's one `FAQPage` JSON-LD (as plain text), unless the `schema` option
 * is `false`. The managed part follows the source: a `groups` or `operation` that is set later starts the fetch.
 */
export function useFaqCards(source: () => FaqCardsSource) {
  const managed = computed(() => source().groups !== undefined || !!source().operation)
  const fetched = useFaq(() => source().groups ?? [], {
    operationId: () => source().operation,
    public: source().public,
    lazy: true,
    enabled: managed,
  })
  const locale = useFaqLocale()
  const fallback = useFaqFallbackLocale()

  const groups = computed<FaqGroupDto[]>(() => managed.value ? fetched.groups.value : [])
  const cards = computed<FaqCardProps[]>(() => {
    const { contact, items = [] } = source()
    const mapped = groups.value.map((group) => {
      const card = faqCardProps(group, locale.value, fallback.value)
      return contact ? { ...card, contact } : card
    })
    return [...mapped, ...items]
  })

  if (useRuntimeConfig().public.faq?.schema !== false) {
    const registry = jsonLdRegistry()
    const uid = getCurrentInstance()?.uid ?? -1
    registry.set(uid, computed(() => faqJsonLdQuestions(groups.value, locale.value, fallback.value)))
    onScopeDispose(() => registry.delete(uid))
    useHead({
      script: computed(() => {
        const page = faqPageFromQuestions([...registry.values()].flatMap(entry => entry.value))
        // `<` is escaped so a text containing `</script>` cannot end the tag.
        return page ? [{ key: 'faq-jsonld', type: 'application/ld+json', innerHTML: JSON.stringify(page).replace(/</g, '\\u003c') }] : []
      }),
    })
  }

  return {
    cards,
    groups,
    /** The first response of the managed groups is still on its way. */
    loading: computed(() => managed.value && fetched.status.value === 'pending' && !groups.value.length),
  }
}
