<script setup lang="ts">
import { translate, type Translated } from '@frigear-nu/ui/translated'

// The website's upcoming events (`GET /api/events`, routed to the website by Auth's `client.routeApi`). An event opens
// its page on the website in the in-app browser, where tickets are bought.
interface EventSummary {
  id: string
  slug: string
  name: Translated
  description: Translated | null
  image: string | null
  location: Translated | null
  startsAt: string
  endsAt: string | null
  requiresMembership: 'any' | string[] | null
}

const { t, locale } = useI18n()
const format = useFormat()
const host = useMobileHost()
const hostPath = useHostPath()

// The last response shows at once (also after a restart of the app, `mobile.persistentCache`) and is asked for again in
// the background once it is five minutes old.
const { data: events, loading, error, refresh } = await useCachedFetch<EventSummary[]>('/api/events', { key: 'home-events', ttl: 5 * 60_000 })

// Only a list: without an API base the request can answer with the app's own HTML, which is no list of events.
const items = computed(() => (Array.isArray(events.value) ? events.value : []).map(event => ({
  ...event,
  title: translate(event.name, locale.value),
  place: event.location ? translate(event.location, locale.value) : '',
  when: event.endsAt ? format.dateRange(event.startsAt, event.endsAt) : format.dateTime(event.startsAt),
  image: event.image ? host.url(event.image) : undefined,
})))

const open = (slug: string) => host.open(hostPath(`/events/${encodeURIComponent(slug)}`))
</script>

<template>
  <section class="flex flex-col gap-3">
    <h2 class="text-lg font-semibold text-highlighted">
      {{ t('app.home.events.title') }}
    </h2>

    <div
      v-if="loading"
      class="flex flex-col gap-3"
    >
      <USkeleton
        v-for="n in 2"
        :key="n"
        class="h-24 w-full"
      />
    </div>
    <UAlert
      v-else-if="error && !items.length"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :title="t('app.home.events.error')"
      :actions="[{ label: t('app.home.events.retry'), color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
    />
    <UEmpty
      v-else-if="!items.length"
      icon="i-lucide-calendar"
      :title="t('app.home.events.empty')"
    />
    <template v-else>
      <!-- Offline or a failed refresh: the last events stay, with a quiet note. -->
      <StaleDataNotice
        :error="error"
        :refresh="refresh"
      />
      <ul
        class="flex flex-col gap-3"
        data-home-events
      >
        <li
          v-for="event in items"
          :key="event.id"
        >
          <button
            type="button"
            class="flex w-full items-center gap-3 rounded-lg border border-default bg-default p-3 text-left active:bg-elevated"
            @click="open(event.slug)"
          >
            <img
              v-if="event.image"
              :src="event.image"
              alt=""
              class="size-16 shrink-0 rounded-md object-cover"
            >
            <div
              v-else
              class="flex size-16 shrink-0 items-center justify-center rounded-md bg-elevated"
            >
              <UIcon
                name="i-lucide-calendar"
                class="size-6 text-muted"
              />
            </div>
            <div class="min-w-0 flex-1">
              <p class="truncate font-medium text-highlighted">
                {{ event.title }}
              </p>
              <p class="text-sm text-muted">
                {{ event.when }}
              </p>
              <p
                v-if="event.place"
                class="truncate text-sm text-muted"
              >
                {{ event.place }}
              </p>
            </div>
            <UBadge
              v-if="event.requiresMembership"
              :label="t('app.home.events.membersOnly')"
              color="neutral"
              variant="subtle"
            />
            <UIcon
              name="i-lucide-chevron-right"
              class="size-5 shrink-0 text-dimmed"
            />
          </button>
        </li>
      </ul>
    </template>
  </section>
</template>
