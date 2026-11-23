<script setup lang="ts">
import { useMapLiveLayers } from '../composables/useMapLiveLayers'
import { useMapOverlays } from '../composables/useMapOverlays'
import type { MapSelection, MapViewerLocation, MapViewerOverlay, PlaneFeatureCollection, PlanePlacement } from '../../../types'
import { computed, ref, useMapsTranslate, useModuleT, useTemplateRef } from '#imports'

defineOptions({ name: 'MapViewer' })

// A read-only map for the web: a plane layout (`layout`) or geographic locations (`locations`), the live layers
// registered for `surface` with toggles, and a panel for what was tapped. Works on props only: the module that owns
// the value loads it. Leaflet loads in the browser; the server renders the frame and a skeleton.
const props = withDefaults(defineProps<{
  /** A layout to show: a plane (shown on map tiles when its placement says so) or a `geo` layout. */
  layout?: PlaneFeatureCollection | null
  /** The plane layout's placement (`PlanePlacement`): its underlay, and where it lies on the earth. */
  placement?: PlanePlacement | null
  /** Geographic locations to show (on a geographic map). */
  locations?: MapViewerLocation[]
  /** Layouts drawn over the geographic map: placed plane layouts or `geo` layouts, each with a toggle. */
  overlays?: MapViewerOverlay[]
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
const { base, overlays, hiddenOverlays, toggleOverlay, live } = useMapOverlays(props)
const { layers, hidden } = useMapLiveLayers({ surface: () => live.value.surface, params: () => live.value.params, only: () => props.liveLayers })
const selection = ref<MapSelection | null>(null)
const empty = computed(() => props.layout ? !props.layout.features.length && !props.layout.underlay : !props.locations?.length && !overlays.value.length)

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
    :data-base="base"
    :data-overlay-count="overlays.length"
    :data-feature-count="props.layout ? props.layout.features.length : (props.locations?.length ?? 0)"
  >
    <div
      class="relative overflow-hidden rounded-md border border-default bg-elevated"
      :style="{ height: props.height }"
    >
      <ClientOnly>
        <MapsCanvas
          :key="base"
          ref="canvas"
          :layout="props.layout"
          :placement="props.placement"
          :locations="props.locations"
          :overlays="overlays"
          :hidden-overlays="hiddenOverlays"
          :live-georeference="live.georeference"
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
      v-if="overlays.length"
      class="flex flex-wrap items-center gap-2"
      data-testid="maps-overlays"
    >
      <span class="text-sm text-muted">{{ t('view.overlays', 'Layouts') }}</span>
      <UButton
        v-for="overlay in overlays"
        :key="overlay.id"
        size="xs"
        :color="hiddenOverlays.includes(overlay.id) ? 'neutral' : 'primary'"
        :variant="hiddenOverlays.includes(overlay.id) ? 'outline' : 'soft'"
        :icon="hiddenOverlays.includes(overlay.id) ? 'i-lucide-eye-off' : 'i-lucide-map'"
        :label="tr(overlay.label) || overlay.id"
        :aria-pressed="!hiddenOverlays.includes(overlay.id)"
        :data-overlay="overlay.id"
        @click="toggleOverlay(overlay.id)"
      />
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
