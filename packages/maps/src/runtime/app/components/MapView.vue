<script setup lang="ts">
import { featureComponents, featureKinds, layerComponents } from '#maps/registry'
import { mapHandle } from '../composables/useMap'
import type { Translated } from '../../../types'
import { computed, errorMessage, ref, useMap, useMapLinks, useMapsTranslate, useModuleT } from '#imports'

defineOptions({ name: 'MapView' })

// A read-only map: stored layers and provider layers with toggles, popups with translated labels, and a panel for the
// selected feature (with the feature kind's own component when it has one). Mobile-friendly; Leaflet loads in the
// browser only, the server renders the frame and a skeleton.
const props = withDefaults(defineProps<{
  /** The map's key or id. */
  map: string
  /** Keys of the layers shown when the map opens (the others can be turned on). Default: each layer's own setting. */
  layers?: string[]
  /** A feature to focus when the map opens (the page passes `?feature=`). */
  feature?: string | null
  /** The map's height (any CSS length). */
  height?: string
}>(), { height: '28rem' })

const t = useModuleT('maps')
const tr = useMapsTranslate()
const links = useMapLinks()
const { detail, map, features, providerLayers, error, refresh } = await useMap(() => props.map)
const handle = computed(() => mapHandle(props.map))
const selectedId = ref<string | null>(null)
const selected = computed(() => features.value.find(feature => feature.id === selectedId.value) ?? null)
const selectedKind = computed(() => selected.value ? featureKinds[selected.value.featureKind] : undefined)
const selectedComponent = computed(() => selected.value ? featureComponents[selected.value.featureKind] : undefined)
const selectedDescription = computed(() => tr(selected.value?.properties.description as Translated | undefined))
const drawnLayers = computed(() => providerLayers.value.filter(layer => layerComponents[layer.key]))
const statusCode = computed(() => (error.value as { statusCode?: number } | null)?.statusCode)
</script>

<template>
  <div
    class="flex flex-col gap-3"
    data-maps-view
    :data-map="props.map"
    :data-map-id="map?.id"
    :data-map-kind="map?.kind"
    :data-map-base="map?.base"
    :data-feature-count="features.length"
  >
    <template v-if="detail && map">
      <div
        class="relative overflow-hidden rounded-md border border-default bg-elevated"
        :style="{ height: props.height }"
      >
        <ClientOnly>
          <MapsCanvas
            :detail="detail"
            :map-key="props.map"
            :initial-layers="props.layers"
            :focus-feature="props.feature"
            @select="selectedId = $event"
          />
          <template #fallback>
            <USkeleton
              class="size-full rounded-none"
              data-testid="maps-skeleton"
            />
          </template>
        </ClientOnly>
      </div>

      <ClientOnly>
        <component
          :is="layerComponents[layer.key]"
          v-for="layer in drawnLayers"
          :key="layer.key"
          :layer="layer"
          :map="map"
          :leaflet="handle.leaflet.value"
        />
      </ClientOnly>

      <div
        v-if="selected"
        class="rounded-md border border-default p-3"
        data-testid="maps-selected"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="flex min-w-0 items-center gap-2">
            <UIcon
              v-if="selectedKind?.icon"
              :name="selectedKind.icon"
              class="size-5 shrink-0 text-muted"
            />
            <div class="min-w-0">
              <p class="truncate font-medium">
                {{ tr(selected.label) || tr(selectedKind?.label) }}
              </p>
              <p
                v-if="selectedDescription"
                class="text-sm text-muted"
              >
                {{ selectedDescription }}
              </p>
            </div>
          </div>
          <UButton
            v-if="selected.linkMapId && links.view(selected.linkMapId)"
            :to="links.view(selected.linkMapId)"
            size="sm"
            variant="outline"
            color="neutral"
            icon="i-lucide-map"
            :label="t('view.openLinked', 'Open the linked map')"
          />
        </div>
        <component
          :is="selectedComponent"
          v-if="selectedComponent"
          class="mt-3"
          :feature="selected"
          :map="map"
        />
      </div>
    </template>

    <UEmpty
      v-else-if="statusCode === 401"
      icon="i-lucide-lock"
      :title="t('view.signIn', 'Sign in to see this map')"
    />
    <UEmpty
      v-else-if="statusCode === 404 || statusCode === 403"
      icon="i-lucide-map"
      :title="t('view.notFound', 'Map not found')"
    />
    <UEmpty
      v-else-if="error"
      icon="i-lucide-circle-alert"
      :title="t('view.loadFailed', 'The map could not be loaded.')"
      :description="errorMessage(error, '')"
      :actions="[{ label: t('tryAgain', 'Try again'), icon: 'i-lucide-rotate-ccw', color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
    />
  </div>
</template>
