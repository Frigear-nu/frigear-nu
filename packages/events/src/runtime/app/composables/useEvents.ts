import type { EventDetailDto, EventSummaryDto, TicketDto, Translated } from '../../../types'
import { translate } from '../../utils'

export async function useEvents() {
  // `now` is captured once and shared with the client payload, so the grouping hydrates identically.
  const now = useState('events:now', () => Date.now())
  const { data, status, refresh } = await useFetch<EventSummaryDto[]>('/api/events', { key: 'events:list', default: () => [] })

  const grouped = computed(() => {
    const start = (e: EventSummaryDto) => new Date(e.startsAt).getTime()
    const end = (e: EventSummaryDto) => (e.endsAt ? new Date(e.endsAt).getTime() : start(e) + 24 * 3600_000)
    return {
      ongoing: data.value.filter(e => start(e) <= now.value && now.value < end(e)),
      upcoming: data.value.filter(e => start(e) > now.value),
      past: data.value.filter(e => end(e) <= now.value).reverse(),
    }
  })

  return { events: data, grouped, status, refresh }
}

/** Awaitable: resolves once the event is fetched, so SSR renders the page with data. */
export async function useEvent(slug: MaybeRefOrGetter<string>) {
  const { loggedIn } = useUserSession()
  // Resolved before the await: composables need the Nuxt context.
  const locale = useEventsLocale()
  const { data, status, error, refresh } = await useFetch<EventDetailDto>(() => `/api/events/${toValue(slug)}`, {
    key: `events:detail:${toValue(slug)}`,
    // Eligibility (membership, limits) depends on the session; refetch quietly, keeping the data on screen.
    watch: [loggedIn],
  })

  async function purchase(ticketTypeId: string, addonIds: string[] = []) {
    const result = await $fetch<{ ticket: TicketDto, url?: string }>(`/api/events/${toValue(slug)}/purchase`, {
      method: 'POST',
      body: { ticketTypeId, addonIds, locale: locale.value },
    })
    if (result.url) await navigateTo(result.url, { external: true })
    else await refresh()
    return result
  }

  return { event: data, status, error, refresh, purchase }
}

export function useMyTickets() {
  const { loggedIn } = useUserSession()
  const { data, status, refresh } = useFetch<TicketDto[]>('/api/events/tickets/me', {
    key: 'events:tickets:mine',
    immediate: loggedIn.value,
    watch: false,
    default: () => [],
  })

  async function pay(ticketId: string) {
    const { url } = await $fetch<{ url: string }>(`/api/events/tickets/${ticketId}/pay`, { method: 'POST' })
    await navigateTo(url, { external: true })
  }

  return { tickets: data, status, refresh, pay }
}

/** Locale for translated texts: `@nuxtjs/i18n`'s when installed, otherwise `en`. */
export function useEventsLocale() {
  const nuxtApp = useNuxtApp() as { $i18n?: { locale?: { value?: string } } }
  return computed(() => nuxtApp.$i18n?.locale?.value ?? 'en')
}

/** The site's default locale: shown for texts that have no translation in the current locale. */
export function useEventsFallbackLocale() {
  const nuxtApp = useNuxtApp() as { $i18n?: { defaultLocale?: string } }
  return computed(() => nuxtApp.$i18n?.defaultLocale ?? 'en')
}

/** `tr(value)`: a translated text in the current locale, falling back to the default locale, then `en`, then any. */
export function useEventsTranslate() {
  const locale = useEventsLocale()
  const fallback = useEventsFallbackLocale()
  return (value: Translated | null | undefined) => translate(value, locale.value, fallback.value)
}
