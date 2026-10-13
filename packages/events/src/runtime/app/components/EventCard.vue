<script setup lang="ts">
import type { EventSummaryDto } from '../../../types'

defineProps<{ event: EventSummaryDto, to: string }>()
const t = useModuleT('events')
const locale = useEventsLocale()
const tr = useEventsTranslate()
</script>

<template>
  <NuxtLink
    :to="to"
    class="group flex flex-col overflow-hidden rounded-xl bg-default ring ring-default transition hover:shadow-lg"
  >
    <img
      v-if="event.image"
      :src="event.image"
      :alt="tr(event.name)"
      class="aspect-[2/1] w-full object-cover"
    >
    <div
      v-else
      class="gradient-linear-br-teal-purple aspect-[2/1] w-full"
    />
    <div class="flex flex-1 flex-col gap-2 p-5">
      <UBadge
        v-if="event.requiresMembership"
        color="warning"
        variant="subtle"
        icon="i-lucide-user-star"
        class="self-start"
      >
        {{ t('members', 'Members') }}
      </UBadge>
      <h3 class="text-lg font-semibold text-highlighted">
        {{ tr(event.name) }}
      </h3>
      <p class="text-sm text-muted">
        <NuxtTime
          :datetime="event.startsAt"
          :locale="locale"
          date-style="full"
          time-style="short"
        /><template v-if="event.location">
          · {{ tr(event.location) }}
        </template>
      </p>
      <p
        v-if="event.description"
        class="line-clamp-3 text-sm text-muted"
      >
        {{ tr(event.description) }}
      </p>
      <span class="mt-auto inline-flex items-center gap-1 pt-2 text-sm font-medium text-primary">
        {{ t('viewEvent', 'View event') }}
        <UIcon
          name="i-lucide-arrow-right"
          class="transition group-hover:translate-x-0.5"
        />
      </span>
    </div>
  </NuxtLink>
</template>
