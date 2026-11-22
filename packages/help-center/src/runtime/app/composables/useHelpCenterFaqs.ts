import type { MaybeRefOrGetter } from 'vue'
import { helpCenterApi } from '../../utils/api'
import { type FaqBodyPartsMap, type FaqMarkdownParser, type FaqMarkdownStringifier, faqBodyPartsOf, faqCardProps } from '../../utils/faq'
import type { FaqCardProps, HelpArticleDto, HelpFaqDto } from '../../../types'
import { parseMarkdown, stringifyMarkdown } from '#help-center/mdc'
import { useHelpCenterFallbackLocale, useHelpCenterLocale } from './useHelpCenterLocale'
import { computed, toValue, useAsyncData, useAuth, useId, useRequestFetch, useUserSession } from '#imports'

export type UseHelpCenterFaqsOptions = {
  /** Ask for what anonymous visitors read only (`?public=1`): no sign-in, and the response may be cached. */
  public?: boolean
  /** Do not block navigation while loading (`useAsyncData`'s `lazy`). */
  lazy?: boolean
  /** Fetch only while this is true (a component whose `categories` prop is not set yet). Defaults to always. */
  enabled?: MaybeRefOrGetter<boolean>
}

const slugList = (value: string | string[] | null | undefined): string[] =>
  (Array.isArray(value) ? value : (value ?? '').split(',')).map(slug => slug.trim()).filter(Boolean)

/**
 * The categories `categories` names (a slug, an array of slugs, or a comma separated list; none for every accordion and
 * cards category the viewer may read), each with its published articles and their text. Built on `useAsyncData`, so it works
 * with SSR, and the request carries the session cookie on the server.
 *
 *     const { faqs, articles, status } = await useHelpCenterFaqs(['volunteering', 'summer-festival'])
 *
 * The fetch key includes the signed-in user, so what a restricted category showed to one user is never reused for
 * another after a sign-in or sign-out. A client that is signed in without a session user (a bearer token, the mobile
 * app) gets a key of its own per call and shares nothing. With `public: true` the key has no user, and the request is
 * cacheable.
 */
export function useHelpCenterFaqs(categories?: MaybeRefOrGetter<string | string[] | null | undefined>, options: UseHelpCenterFaqsOptions = {}) {
  const session = useUserSession()
  const auth = useAuth()
  const requestFetch = useRequestFetch()
  const instance = useId()
  const slugs = computed(() => slugList(toValue(categories)))
  const enabled = computed(() => toValue(options.enabled) ?? true)
  const who = computed(() => {
    if (options.public) return 'public'
    const id = session.user.value?.id
    if (id !== undefined && id !== null && id !== '') return `user:${id}`
    return auth.status.value === 'signed-in' ? `unknown:${instance}` : 'anonymous'
  })

  // The texts of `cards` categories are split into the parts of their cards here, with the response, so the cards render
  // at once on the server and the client (`parseMarkdown` is async). Without MDC in the app there are no parts.
  const asyncData = useAsyncData<{ faqs: HelpFaqDto[], parts: FaqBodyPartsMap }>(
    () => `help-center:faqs:${who.value}:${slugs.value.join(',')}:${enabled.value ? 'on' : 'off'}`,
    async () => {
      if (!enabled.value) return { faqs: [], parts: {} }
      const faqs = await requestFetch<HelpFaqDto[]>(helpCenterApi.faqs, {
        query: {
          categories: slugs.value.length ? slugs.value.join(',') : undefined,
          public: options.public ? 1 : undefined,
        },
      })
      return { faqs, parts: await faqBodyPartsOf(faqs, parseMarkdown as FaqMarkdownParser | undefined, stringifyMarkdown as FaqMarkdownStringifier | undefined) }
    },
    { lazy: options.lazy, default: () => ({ faqs: [], parts: {} }), watch: [slugs, enabled, who] },
  )

  const result = {
    /** The categories, in the order asked for. One that does not exist or that the viewer may not read is not here. */
    faqs: computed<HelpFaqDto[]>(() => asyncData.data.value?.faqs ?? []),
    /** Every article of every category, in order. */
    articles: computed<HelpArticleDto[]>(() => (asyncData.data.value?.faqs ?? []).flatMap(faq => faq.articles)),
    /** The texts of the `cards` categories split into the parts of their cards, by text (see `articleCardProps`). */
    parts: computed<FaqBodyPartsMap>(() => asyncData.data.value?.parts ?? {}),
    status: asyncData.status,
    error: asyncData.error,
    refresh: asyncData.refresh,
  }
  // Awaitable like `useAsyncData` (it waits for the first response) and destructurable without `await`.
  return Object.assign(asyncData.then(() => result), result)
}

/**
 * Maps a category with its articles to the props of `FaqCard` in the current locale, so a custom page can render the
 * card itself (`<FaqGrid :items="faqs.map(toFaqCardProps)" />`) or build its own markup from the result.
 */
export function toFaqCardProps(faq: HelpFaqDto): FaqCardProps {
  // The locale is the app's at the moment the page renders, so it is read here and not at import time.
  return faqCardProps(faq, useHelpCenterLocale().value, useHelpCenterFallbackLocale().value)
}
