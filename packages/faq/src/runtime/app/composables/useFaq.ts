import type { MaybeRefOrGetter } from 'vue'
import { faqApi } from '../../utils/api'
import { faqCardProps } from '../../utils/cards'
import type { FaqCardProps, FaqGroupDto, FaqItemDto } from '../../../types'
import { useFaqFallbackLocale, useFaqLocale } from './useFaqLocale'
import { computed, toValue, useAsyncData, useAuth, useId, useRequestFetch, useUserSession } from '#imports'

export type UseFaqOptions = {
  /** Only the groups owned by this operation (`?operation=`). */
  operationId?: MaybeRefOrGetter<string | null | undefined>
  /** Ask for what anonymous visitors read only (`?public=1`): no sign-in, and the response may be cached. */
  public?: boolean
  /** Do not block navigation while loading (`useAsyncData`'s `lazy`). */
  lazy?: boolean
  /** Fetch only while this is true (a component whose `groups` prop is not set yet). Defaults to always. */
  enabled?: MaybeRefOrGetter<boolean>
}

const slugList = (value: string | string[] | null | undefined): string[] =>
  (Array.isArray(value) ? value : (value ?? '').split(',')).map(slug => slug.trim()).filter(Boolean)

/**
 * The groups `groups` names (a slug, an array of slugs, or a comma separated list; none for every group the viewer may
 * read), each with its published items the viewer may read. Built on `useAsyncData`, so it works with SSR, and the
 * request carries the session cookie on the server.
 *
 *     const { groups, items, status } = await useFaq(['volunteering', 'roskilde'])
 *
 * The fetch key includes the signed-in user, so what a restricted group showed to one user is never reused for
 * another after a sign-in or sign-out. A client that is signed in without a session user (a bearer token, the mobile
 * app) gets a key of its own per call and shares nothing. With `public: true` the key has no user, and the request is
 * cacheable.
 */
export function useFaq(groups?: MaybeRefOrGetter<string | string[] | null | undefined>, options: UseFaqOptions = {}) {
  const session = useUserSession()
  const auth = useAuth()
  const requestFetch = useRequestFetch()
  const instance = useId()
  const slugs = computed(() => slugList(toValue(groups)))
  const operation = computed(() => toValue(options.operationId) || undefined)
  const enabled = computed(() => toValue(options.enabled) ?? true)
  const who = computed(() => {
    if (options.public) return 'public'
    const id = session.user.value?.id
    if (id !== undefined && id !== null && id !== '') return `user:${id}`
    return auth.status.value === 'signed-in' ? `unknown:${instance}` : 'anonymous'
  })

  const asyncData = useAsyncData<FaqGroupDto[]>(
    () => `faq:${who.value}:${slugs.value.join(',')}:${operation.value ?? ''}:${enabled.value ? 'on' : 'off'}`,
    () => enabled.value
      ? requestFetch<FaqGroupDto[]>(faqApi.groups, {
          query: {
            slugs: slugs.value.length ? slugs.value.join(',') : undefined,
            operation: operation.value,
            public: options.public ? 1 : undefined,
          },
        })
      : Promise.resolve([]),
    { lazy: options.lazy, default: () => [], watch: [slugs, operation, enabled, who] },
  )

  const result = {
    /** The groups, in the order asked for. A group that does not exist or that the viewer may not read is not here. */
    groups: computed<FaqGroupDto[]>(() => asyncData.data.value ?? []),
    /** Every item of every group, in order. */
    items: computed<FaqItemDto[]>(() => (asyncData.data.value ?? []).flatMap(group => group.items)),
    status: asyncData.status,
    error: asyncData.error,
    refresh: asyncData.refresh,
  }
  // Awaitable like `useAsyncData` (it waits for the first response) and destructurable without `await`.
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
