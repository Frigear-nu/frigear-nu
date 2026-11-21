<script setup lang="ts">
import { kindComponents, kinds, layers } from '#maps/registry'
import type { MapSelection, Translated } from '../../../types'
import { computed, useMapsTranslate } from '#imports'

defineOptions({ name: 'MapsSelectionDetails' })

// What the viewers show for the selected feature, location or live feature: its icon, name and description, and the
// feature kind's own component when it has one.
const props = defineProps<{ selection: MapSelection }>()

const tr = useMapsTranslate()
const kind = computed(() => props.selection.kind ? kinds[props.selection.kind] : undefined)
const layer = computed(() => props.selection.layer ? layers[props.selection.layer] : undefined)
const component = computed(() => props.selection.kind ? kindComponents[props.selection.kind] : undefined)
const title = computed(() => tr(props.selection.label) || tr(kind.value?.label) || tr(layer.value?.label) || props.selection.id)
const subtitle = computed(() => {
  const own = tr(props.selection.label)
  if (!own) return ''
  return tr(kind.value?.label) || tr(layer.value?.label) || ''
})
const description = computed(() => tr(props.selection.properties.description as Translated | undefined))
</script>

<template>
  <div
    class="flex flex-col gap-2"
    data-testid="maps-selection"
    :data-source="props.selection.source"
    :data-id="props.selection.id"
  >
    <div class="flex min-w-0 items-center gap-2">
      <UIcon
        :name="kind?.icon ?? (props.selection.source === 'live' ? 'i-lucide-radio' : 'i-lucide-map-pin')"
        class="size-5 shrink-0 text-muted"
      />
      <div class="min-w-0">
        <p class="truncate font-medium">
          {{ title }}
        </p>
        <p
          v-if="subtitle"
          class="truncate text-sm text-muted"
        >
          {{ subtitle }}
        </p>
      </div>
    </div>
    <p
      v-if="description"
      class="text-sm text-muted"
    >
      {{ description }}
    </p>
    <component
      :is="component"
      v-if="component"
      :feature="props.selection"
    />
  </div>
</template>
