<script setup lang="ts">
import type { EventSummaryDto } from '../../../types'

defineProps<{ event: EventSummaryDto, to: string }>()
const t = useModuleT('events')
const format = useFormat()
const tr = useEventsTranslate()
</script>

<template>
  <NuxtLink
    :to="to"
    class="group bg-default ring-default flex flex-col overflow-hidden rounded-lg ring transition hover:shadow-lg"
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
      <h3 class="text-highlighted font-semibold">
        {{ tr(event.name) }}
      </h3>
      <p class="text-muted text-sm">
        {{ format.dateTime(event.startsAt, { dateStyle: 'full' }) }}<template v-if="event.location">
          · {{ tr(event.location) }}
        </template>
      </p>
      <p
        v-if="event.description"
        class="text-muted line-clamp-3 text-sm"
      >
        {{ tr(event.description) }}
      </p>
      <span class="text-primary mt-auto inline-flex items-center gap-1 pt-2 text-sm font-medium">
        {{ t('viewEvent', 'View event') }}
        <UIcon
          name="i-lucide-arrow-right"
          class="transition group-hover:translate-x-0.5"
        />
      </span>
    </div>
  </NuxtLink>
</template>
