import type { FaqCardProps, HelpFaqDto } from '../../../types'
import { faqCardsProps, faqJsonLdQuestions, faqPageFromQuestions } from '../../utils/faq'
import { useHelpCenterFaqs } from './useHelpCenterFaqs'
import { useHelpCenterFallbackLocale, useHelpCenterLocale } from './useHelpCenterLocale'
import { computed, getCurrentInstance, onScopeDispose, shallowReactive, useHead, useNuxtApp, useRuntimeConfig } from '#imports'

/** What `Faq`, `FaqGrid`, `FaqSectionList` and an accordion category page take to say which questions to show. */
export type FaqCardsSource = {
  /** Slugs of help-center categories: an array, or a comma separated string (what MDC passes). */
  categories?: string | string[]
  /** Inline cards in the shape of page frontmatter. They follow the managed ones. */
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
  const nuxtApp = useNuxtApp() as unknown as { _helpCenterFaqJsonLd?: Map<number, { value: LdQuestions }> }
  return nuxtApp._helpCenterFaqJsonLd ??= shallowReactive(new Map<number, { value: LdQuestions }>())
}

/**
 * The cards of a component: the named categories (fetched through `useHelpCenterFaqs`) as `FaqCardProps` (one card per
 * category, or per article in a `cards` category), then the inline `items`. Also adds the public questions to the page's one `FAQPage` JSON-LD (as plain text), unless the
 * `schema` option is `false` or `jsonLd` is (the signed-in area is not for search engines). A `categories` that is set
 * later starts the fetch. `lazy: false` makes navigation wait for the cards: `await` the result so a client-side
 * navigation does not flash a skeleton.
 */
export function useHelpCenterFaqCards(source: () => FaqCardsSource, options: { jsonLd?: boolean, lazy?: boolean } = {}) {
  const managed = computed(() => source().categories !== undefined)
  const fetched = useHelpCenterFaqs(() => source().categories ?? [], {
    public: source().public,
    lazy: options.lazy ?? true,
    enabled: managed,
  })
  const locale = useHelpCenterLocale()
  const fallback = useHelpCenterFallbackLocale()

  const faqs = computed<HelpFaqDto[]>(() => managed.value ? fetched.faqs.value : [])
  const cards = computed<FaqCardProps[]>(() => {
    const { contact, items = [] } = source()
    const mapped = faqs.value.flatMap(faq => faqCardsProps(faq, locale.value, fallback.value, fetched.parts.value)
      .map(card => contact && !card.contact ? { ...card, contact } : card))
    return [...mapped, ...items]
  })

  if (options.jsonLd !== false && useRuntimeConfig().public.helpCenter?.schema !== false) {
    const registry = jsonLdRegistry()
    const uid = getCurrentInstance()?.uid ?? -1
    registry.set(uid, computed(() => faqJsonLdQuestions(faqs.value, locale.value, fallback.value)))
    onScopeDispose(() => registry.delete(uid))
    useHead({
      script: computed(() => {
        const page = faqPageFromQuestions([...registry.values()].flatMap(entry => entry.value))
        // `<` is escaped so a text containing `</script>` cannot end the tag.
        return page ? [{ key: 'help-center-faq-jsonld', type: 'application/ld+json', innerHTML: JSON.stringify(page).replace(/</g, '\\u003c') }] : []
      }),
    })
  }

  const result = {
    cards,
    faqs,
    /** The first response of the managed categories is still on its way. */
    loading: computed(() => managed.value && fetched.status.value === 'pending' && !faqs.value.length),
    error: fetched.error,
    refresh: fetched.refresh,
  }
  // Awaitable (it waits for the first response, see `lazy: false`) and destructurable without `await`.
  return Object.assign(fetched.then(() => result), result)
}
