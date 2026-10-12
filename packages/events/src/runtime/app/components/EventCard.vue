<script setup lang="ts">
import type { EventSummaryDto } from '../../../types'

const props = defineProps<{ event: EventSummaryDto, to: string }>()
const t = useModuleT('events')
const locale = useEventsLocale()
const tr = useEventsTranslate()
const date = computed(() => new Intl.DateTimeFormat(locale.value, { dateStyle: 'full', timeStyle: 'short' }).format(new Date(props.event.startsAt)))
</script>

<template>
  <UCard :ui="{ body: 'flex flex-col gap-2' }">
    <img
      v-if="event.image"
      :src="event.image"
      :alt="tr(event.name)"
      class="aspect-[3/1] w-full rounded-md object-cover"
    >
    <h3 class="text-lg font-semibold">
      {{ tr(event.name) }}
    </h3>
    <p class="text-sm text-muted">
      {{ date }}<template v-if="event.location">
        · {{ tr(event.location) }}
      </template>
    </p>
    <p
      v-if="event.description"
      class="text-sm"
    >
      {{ tr(event.description) }}
    </p>
    <div class="flex items-center gap-2">
      <UBadge
        v-if="event.requiresMembership"
        color="warning"
        variant="subtle"
        icon="i-lucide-user-star"
      >
        {{ t('members', 'Members') }}
      </UBadge>
      <UButton
        :to="to"
        class="ml-auto"
        trailing-icon="i-lucide-arrow-right"
      >
        {{ t('viewEvent', 'View event') }}
      </UButton>
    </div>
  </UCard>
</template>
