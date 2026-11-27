import type { MaybeRefOrGetter } from 'vue'
import { helpCenterApi } from '../../utils/api'
import type { HelpArticleDetailDto, HelpArticleSummaryDto, HelpCategoryDto, HelpChecklistDto } from '../../../types'
import { computed, toValue, useAuth, useCachedAsyncData, useId, useRequestFetch, useUserSession } from '#imports'

/**
 * How long (ms) a remembered help-center response is reused when a page mounts again without asking the server. The
 * texts change rarely; the last response shows at once either way (also after a restart of the mobile app) and is
 * refreshed in the background once it is older.
 */
export const HELP_CENTER_TTL = 5 * 60 * 1000
/** The checklists carry what the viewer has read, which changes as they read: asked for again on every mount. */
const CHECKLISTS_TTL = 0

export type UseHelpCenterOptions = {
  /** Ask for what anonymous visitors read only (`?public=1`): no sign-in, and the response may be cached. */
  public?: boolean
  /** Do not block navigation while loading (`useAsyncData`'s `lazy`). */
  lazy?: boolean
}

/**
 * Who the data belongs to, for the fetch key: the signed-in user, `public`, or `anonymous`. What a restricted article
 * showed to one user is never reused for another after a sign-in or sign-out. A client that is signed in without a
 * session user (a bearer token, the mobile app) gets a key of its own per call and shares nothing.
 */
function useHelpCenterOwner(options: UseHelpCenterOptions) {
  const session = useUserSession()
  const auth = useAuth()
  const instance = useId()
  return computed(() => {
    if (options.public) return 'public'
    const id = session.user.value?.id
    if (id !== undefined && id !== null && id !== '') return `user:${id}`
    return auth.status.value === 'signed-in' ? `unknown:${instance}` : 'anonymous'
  })
}

/**
 * The categories the viewer may read. Awaitable like `useAsyncData`, and destructurable without `await`. These
 * composables are built on `useCachedAsyncData` (`@frigear-nu/ui`): coming back to a page shows the last response at
 * once, and `loading` is `true` only while there is nothing to show yet.
 */
export function useHelpCenterCategories(options: UseHelpCenterOptions = {}) {
  const requestFetch = useRequestFetch()
  const who = useHelpCenterOwner(options)
  const asyncData = useCachedAsyncData<HelpCategoryDto[]>(
    () => `help-center:categories:${who.value}`,
    () => requestFetch<HelpCategoryDto[]>(helpCenterApi.categories, { query: { public: options.public ? 1 : undefined } }),
    { lazy: options.lazy, ttl: HELP_CENTER_TTL, watch: [who] },
  )
  const result = { categories: computed(() => asyncData.data.value ?? []), status: asyncData.status, error: asyncData.error, refresh: asyncData.refresh, loading: asyncData.loading }
  return Object.assign(asyncData.then(() => result), result)
}

/** The articles the viewer may read (without their text), optionally of one category. */
export function useHelpCenterArticles(category?: MaybeRefOrGetter<string | null | undefined>, options: UseHelpCenterOptions = {}) {
  const requestFetch = useRequestFetch()
  const who = useHelpCenterOwner(options)
  const slug = computed(() => toValue(category) || undefined)
  const asyncData = useCachedAsyncData<HelpArticleSummaryDto[]>(
    () => `help-center:articles:${who.value}:${slug.value ?? ''}`,
    () => requestFetch<HelpArticleSummaryDto[]>(helpCenterApi.articles, { query: { category: slug.value, public: options.public ? 1 : undefined } }),
    { lazy: options.lazy, ttl: HELP_CENTER_TTL, watch: [who, slug] },
  )
  const result = { articles: computed(() => asyncData.data.value ?? []), status: asyncData.status, error: asyncData.error, refresh: asyncData.refresh, loading: asyncData.loading }
  return Object.assign(asyncData.then(() => result), result)
}

/** One article with its text and category. `article` is `null` when it does not exist or the viewer may not read it. */
export function useHelpCenterArticle(slug: MaybeRefOrGetter<string>, options: UseHelpCenterOptions = {}) {
  const requestFetch = useRequestFetch()
  const who = useHelpCenterOwner(options)
  const name = computed(() => toValue(slug))
  const asyncData = useCachedAsyncData<HelpArticleDetailDto | null>(
    () => `help-center:article:${who.value}:${name.value}`,
    () => requestFetch<HelpArticleDetailDto>(helpCenterApi.article(name.value), { query: { public: options.public ? 1 : undefined } })
      .catch((error: { statusCode?: number }) => {
        if (error.statusCode === 404) return null
        throw error
      }),
    { lazy: options.lazy, ttl: HELP_CENTER_TTL, watch: [who, name] },
  )
  const result = { article: computed(() => asyncData.data.value ?? null), status: asyncData.status, error: asyncData.error, refresh: asyncData.refresh, loading: asyncData.loading }
  return Object.assign(asyncData.then(() => result), result)
}

/** The onboarding checklists of the signed-in viewer, with what they have read. Empty when signed out. */
export function useHelpCenterChecklists(options: UseHelpCenterOptions = {}) {
  const requestFetch = useRequestFetch()
  const who = useHelpCenterOwner(options)
  const asyncData = useCachedAsyncData<HelpChecklistDto[]>(
    () => `help-center:checklists:${who.value}`,
    () => who.value === 'anonymous' ? Promise.resolve([]) : requestFetch<HelpChecklistDto[]>(helpCenterApi.me.checklists),
    { lazy: options.lazy, ttl: CHECKLISTS_TTL, watch: [who] },
  )
  const result = { checklists: computed(() => asyncData.data.value ?? []), status: asyncData.status, error: asyncData.error, refresh: asyncData.refresh, loading: asyncData.loading }
  return Object.assign(asyncData.then(() => result), result)
}
