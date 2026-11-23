<script setup lang="ts">
import { useMapLiveLayers } from '../composables/useMapLiveLayers'
import { useMapOverlays } from '../composables/useMapOverlays'
import type { MapSelection, MapViewerLocation, MapViewerOverlay, PlaneFeatureCollection, PlanePlacement } from '../../../types'
import { computed, ref, useMapsTranslate, useModuleT, useTemplateRef } from '#imports'

defineOptions({ name: 'MapMobileViewer' })

// The read-only map of a mobile screen (a `@frigear-nu/mobile` tab or page): the same props as `<MapViewer>`, laid
// out for a phone. The map fills the space the page gives it (at least 60% of the screen), the controls float over it
// as large touch targets, and what was tapped opens in a bottom sheet above the tab bar.
const props = defineProps<{
  layout?: PlaneFeatureCollection | null
  placement?: PlanePlacement | null
  locations?: MapViewerLocation[]
  overlays?: MapViewerOverlay[]
  surface?: string
  params?: Record<string, string | number | null | undefined>
  liveLayers?: string[]
  focus?: string | null
  /** A fixed height (any CSS length). Default: fill the page. */
  height?: string
}>()

const emit = defineEmits<{ select: [selection: MapSelection | null] }>()

const t = useModuleT('maps')
const tr = useMapsTranslate()
const canvas = useTemplateRef<{ fit: () => void, focus: (id: string) => boolean }>('canvas')
const { base, overlays, hiddenOverlays, toggleOverlay, live } = useMapOverlays(props)
const { layers, hidden } = useMapLiveLayers({ surface: () => live.value.surface, params: () => live.value.params, only: () => props.liveLayers })
const selection = ref<MapSelection | null>(null)
const sheetOpen = computed({
  get: () => !!selection.value,
  set: (open) => {
    if (!open) selection.value = null
  },
})
const layersOpen = ref(false)

function setVisible(id: string, visible: boolean) {
  hidden.value = visible ? hidden.value.filter(other => other !== id) : [...new Set([...hidden.value, id])]
}

function onSelect(value: MapSelection | null) {
  selection.value = value
  emit('select', value)
}

defineExpose({ fit: () => canvas.value?.fit(), focus: (id: string) => canvas.value?.focus(id) ?? false })
</script>

<template>
  <div
    class="relative flex min-h-[60dvh] flex-1 flex-col overflow-hidden rounded-lg border border-default bg-elevated"
    :style="props.height ? { height: props.height, minHeight: 0, flex: 'none' } : undefined"
    data-maps-mobile-viewer
    :data-base="base"
    :data-overlay-count="overlays.length"
  >
    <ClientOnly>
      <MapsCanvas
        :key="base"
        ref="canvas"
        class="!absolute inset-0"
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
          class="absolute inset-0 rounded-none"
          data-testid="maps-skeleton"
        />
      </template>
    </ClientOnly>

    <div class="absolute bottom-3 right-3 z-[500] flex flex-col gap-2">
      <UButton
        v-if="layers.length || overlays.length"
        icon="i-lucide-layers"
        color="neutral"
        variant="solid"
        size="lg"
        class="rounded-full shadow-md"
        :aria-label="t('view.liveLayers', 'Live layers')"
        data-testid="maps-mobile-layers"
        @click="layersOpen = true"
      />
      <UButton
        icon="i-lucide-locate-fixed"
        color="neutral"
        variant="solid"
        size="lg"
        class="rounded-full shadow-md"
        :aria-label="t('view.fit', 'Show everything')"
        @click="canvas?.fit()"
      />
    </div>

    <UDrawer
      v-model:open="layersOpen"
      :title="t('view.liveLayers', 'Live layers')"
    >
      <template #body>
        <div class="flex flex-col divide-y divide-default">
          <label
            v-for="overlay in overlays"
            :key="overlay.id"
            class="flex min-h-12 items-center justify-between gap-3 py-2"
            :data-overlay="overlay.id"
          >
            <span>{{ tr(overlay.label) || overlay.id }}</span>
            <USwitch
              :model-value="!hiddenOverlays.includes(overlay.id)"
              :aria-label="tr(overlay.label) || overlay.id"
              @update:model-value="toggleOverlay(overlay.id, $event)"
            />
          </label>
          <label
            v-for="layer in layers"
            :key="layer.id"
            class="flex min-h-12 items-center justify-between gap-3 py-2"
          >
            <span>{{ tr(layer.label) || layer.id }}</span>
            <USwitch
              :model-value="!hidden.includes(layer.id)"
              :aria-label="tr(layer.label) || layer.id"
              @update:model-value="setVisible(layer.id, $event)"
            />
          </label>
        </div>
      </template>
    </UDrawer>

    <UDrawer
      v-model:open="sheetOpen"
      :overlay="false"
      :modal="false"
      :title="t('view.details', 'Details')"
      :ui="{ content: 'pb-[var(--mobile-inset-bottom,env(safe-area-inset-bottom,0px))]' }"
    >
      <template #body>
        <MapsSelectionDetails
          v-if="selection"
          :selection="selection"
        />
      </template>
    </UDrawer>
  </div>
</template>
