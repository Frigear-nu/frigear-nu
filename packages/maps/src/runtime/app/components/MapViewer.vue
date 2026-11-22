<script setup lang="ts">
import { useMapLiveLayers } from '../composables/useMapLiveLayers'
import type { MapSelection, MapViewerLocation, PlaneFeatureCollection } from '../../../types'
import { computed, ref, useMapsTranslate, useModuleT, useTemplateRef } from '#imports'

defineOptions({ name: 'MapViewer' })

// A read-only map for the web: a plane layout (`layout`) or geographic locations (`locations`), the live layers
// registered for `surface` with toggles, and a panel for what was tapped. Works on props only: the module that owns
// the value loads it. Leaflet loads in the browser; the server renders the frame and a skeleton.
const props = withDefaults(defineProps<{
  /** A plane layout to show (the viewer is then a plane). */
  layout?: PlaneFeatureCollection | null
  /** Geographic locations to show, when there is no `layout`. */
  locations?: MapViewerLocation[]
  /** The surface name live layers apply to (`operations.venue-layout`). */
  surface?: string
  /** The values of the live layers' endpoint `:params` (`{ operationId }`). */
  params?: Record<string, string | number | null | undefined>
  /** Only these live layers (ids). Default: every layer of the surface. */
  liveLayers?: string[]
  /** A feature or location to focus when the map opens. */
  focus?: string | null
  /** The map's height (any CSS length). */
  height?: string
}>(), { height: '28rem' })

const emit = defineEmits<{ select: [selection: MapSelection | null] }>()

const t = useModuleT('maps')
const tr = useMapsTranslate()
const canvas = useTemplateRef<{ fit: () => void, focus: (id: string) => boolean }>('canvas')
const { layers } = useMapLiveLayers({ surface: () => props.surface, params: () => props.params, only: () => props.liveLayers })
const hidden = ref<string[]>([])
const selection = ref<MapSelection | null>(null)
const empty = computed(() => props.layout ? !props.layout.features.length && !props.layout.underlay : !props.locations?.length)

function toggle(id: string) {
  hidden.value = hidden.value.includes(id) ? hidden.value.filter(other => other !== id) : [...hidden.value, id]
}

function onSelect(value: MapSelection | null) {
  selection.value = value
  emit('select', value)
}

defineExpose({ fit: () => canvas.value?.fit(), focus: (id: string) => canvas.value?.focus(id) ?? false })
</script>

<template>
  <div
    class="flex flex-col gap-3"
    data-maps-viewer
    :data-base="props.layout ? 'plane' : 'geo'"
    :data-feature-count="props.layout ? props.layout.features.length : (props.locations?.length ?? 0)"
  >
    <div
      class="relative overflow-hidden rounded-md border border-default bg-elevated"
      :style="{ height: props.height }"
    >
      <ClientOnly>
        <MapsCanvas
          ref="canvas"
          :layout="props.layout"
          :locations="props.locations"
          :live-layers="layers"
          :hidden-layers="hidden"
          :focus="props.focus"
          @select="onSelect"
        />
        <template #fallback>
          <USkeleton
            class="size-full rounded-none"
            data-testid="maps-skeleton"
          />
        </template>
      </ClientOnly>
      <div
        v-if="empty"
        class="pointer-events-none absolute inset-x-0 bottom-3 z-[500] flex justify-center"
      >
        <UBadge
          color="neutral"
          variant="subtle"
          :label="t('view.empty', 'Nothing is drawn here yet')"
        />
      </div>
    </div>

    <div
      v-if="layers.length"
      class="flex flex-wrap items-center gap-2"
      data-testid="maps-live-layers"
    >
      <span class="text-sm text-muted">{{ t('view.liveLayers', 'Live layers') }}</span>
      <UButton
        v-for="layer in layers"
        :key="layer.id"
        size="xs"
        :color="hidden.includes(layer.id) ? 'neutral' : 'primary'"
        :variant="hidden.includes(layer.id) ? 'outline' : 'soft'"
        :icon="hidden.includes(layer.id) ? 'i-lucide-eye-off' : 'i-lucide-eye'"
        :label="tr(layer.label) || layer.id"
        :aria-pressed="!hidden.includes(layer.id)"
        :data-layer="layer.id"
        @click="toggle(layer.id)"
      />
    </div>

    <div
      v-if="selection"
      class="rounded-md border border-default p-3"
    >
      <MapsSelectionDetails :selection="selection" />
    </div>
  </div>
</template>
