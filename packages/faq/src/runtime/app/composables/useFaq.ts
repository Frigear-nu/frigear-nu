import type { MaybeRefOrGetter } from 'vue'
import { faqApi } from '../../utils/api'
import { faqCardProps } from '../../utils/cards'
import type { FaqCardProps, FaqGroupDto, FaqItemDto } from '../../../types'
import { useFaqFallbackLocale, useFaqLocale } from './useFaqLocale'
import { computed, toValue, useFetch, useUserSession } from '#imports'

export type UseFaqOptions = {
  /** Only the groups owned by this operation (`?operation=`). */
  operationId?: MaybeRefOrGetter<string | null | undefined>
  /** Ask for what anonymous visitors read only (`?public=1`): no sign-in, and the response may be cached. */
  public?: boolean
  /** Do not block navigation while loading (`useFetch`'s `lazy`). */
  lazy?: boolean
}

const slugList = (value: string | string[] | null | undefined): string[] =>
  (Array.isArray(value) ? value : (value ?? '').split(',')).map(slug => slug.trim()).filter(Boolean)

/**
 * The groups `groups` names (a slug, an array of slugs, or a comma separated list; none for every group the viewer may
 * read), each with its published items the viewer may read. Built on `useFetch`, so it works with SSR.
 *
 *     const { groups, items, status } = await useFaq(['volunteering', 'roskilde'])
 *
 * The fetch key includes the signed-in user, so what a restricted group showed to one user is never reused for
 * another after a sign-in or sign-out. With `public: true` the key does not, and the request is cacheable.
 */
export function useFaq(groups?: MaybeRefOrGetter<string | string[] | null | undefined>, options: UseFaqOptions = {}) {
  const session = useUserSession()
  const slugs = computed(() => slugList(toValue(groups)))
  const operation = computed(() => toValue(options.operationId) || undefined)
  const who = computed(() => options.public ? 'public' : `user:${session.user.value?.id ?? 'anonymous'}`)

  const asyncData = useFetch<FaqGroupDto[]>(faqApi.groups, {
    query: computed(() => ({
      slugs: slugs.value.length ? slugs.value.join(',') : undefined,
      operation: operation.value,
      public: options.public ? 1 : undefined,
    })),
    key: computed(() => `faq:${who.value}:${slugs.value.join(',')}:${operation.value ?? ''}`),
    lazy: options.lazy,
    default: () => [],
  })

  const result = {
    /** The groups, in the order asked for. A group that does not exist or that the viewer may not read is not here. */
    groups: computed<FaqGroupDto[]>(() => asyncData.data.value ?? []),
    /** Every item of every group, in order. */
    items: computed<FaqItemDto[]>(() => (asyncData.data.value ?? []).flatMap(group => group.items)),
    status: asyncData.status,
    error: asyncData.error,
    refresh: asyncData.refresh,
  }
  // Awaitable like `useFetch` (it waits for the first response) and destructurable without `await`.
  return Object.assign(asyncData.then(() => result), result)
}

/**
 * Maps a managed group to the props of `FaqCard` in the current locale, so a custom page can render the card itself
 * (`<FaqGrid :items="groups.map(toFaqCardProps)" />`) or build its own markup from the result.
 */
export function toFaqCardProps(group: FaqGroupDto): FaqCardProps {
  // The locale is the app's at the moment the page renders, so it is read here and not at import time.
  return faqCardProps(group, useFaqLocale().value, useFaqFallbackLocale().value)
}
