import type { Map as LeafletMap } from 'leaflet'
import type { MaybeRefOrGetter, ShallowRef } from 'vue'
import { mapsApi } from '../../utils/api'
import type { MapDetailDto } from '../../../types'
import { computed, shallowRef, toValue, useFetch } from '#imports'

/** What a mounted map canvas offers to `useMap()` callers. */
export type MapController = {
  /** Pans and zooms to a feature and opens its popup. Resolves `false` when the feature is not on the map. */
  focus: (featureId: string) => boolean
  /** Fits the view to every visible feature (or the map's extent when it has none). */
  fitBounds: () => void
}

type MapHandle = { leaflet: ShallowRef<LeafletMap | null>, controller: ShallowRef<MapController | null>, pendingFocus: string | null }

// One handle per map (key or id) in the browser, shared by every `useMap()` of that map and the canvas showing it.
// The server never mounts a canvas, so nothing is kept between requests.
const handles = new Map<string, MapHandle>()

/** The shared handle of a map: the Leaflet instance and the canvas controller once it is mounted. */
export function mapHandle(keyOrId: string): MapHandle {
  let handle = handles.get(keyOrId)
  if (!handle) {
    handle = { leaflet: shallowRef(null), controller: shallowRef(null), pendingFocus: null }
    if (import.meta.client) handles.set(keyOrId, handle)
  }
  return handle
}

/**
 * One map with its visible layers and features, for custom map pages. `await` it in `<script setup>`; the data comes
 * from `GET /api/maps/:map` (shared with `<MapView>` / `<MapEditor>` of the same map through the fetch key).
 *
 * - `refresh()` reloads the map; `focus(featureId)` and `fitBounds()` act on the `<MapView>` / `<MapEditor>` showing
 *   it (a focus before it mounts is applied once it does).
 * - `leaflet` is the Leaflet `Map` instance once a canvas mounted (`null` on the server), for anything custom.
 *
 * ```vue
 * <script setup lang="ts">
 * const { map, features, focus } = await useMap('roskilde-2027-site')
 * </script>
 * <template>
 *   <MapView map="roskilde-2027-site" />
 *   <UButton v-for="f in features" :key="f.id" @click="focus(f.id)">{{ f.id }}</UButton>
 * </template>
 * ```
 */
export async function useMap(keyOrId: MaybeRefOrGetter<string>) {
  const target = computed(() => toValue(keyOrId))
  const fetched = useFetch<MapDetailDto>(() => mapsApi.map(target.value), {
    key: computed(() => `maps:map:${target.value}`),
    dedupe: 'defer',
  })
  const handle = computed(() => mapHandle(target.value))
  await fetched

  const { data, status, error, refresh } = fetched
  return {
    /** The full response: map, layers, provider layers, features and whether the caller may edit. */
    detail: data,
    map: computed(() => data.value?.map ?? null),
    layers: computed(() => data.value?.layers ?? []),
    providerLayers: computed(() => data.value?.providerLayers ?? []),
    features: computed(() => data.value?.features ?? []),
    canEdit: computed(() => data.value?.canEdit ?? false),
    status,
    error,
    refresh,
    /** The Leaflet `Map` of the mounted canvas, or `null`. */
    leaflet: computed(() => handle.value.leaflet.value),
    focus(featureId: string): boolean {
      const controller = handle.value.controller.value
      if (controller) return controller.focus(featureId)
      handle.value.pendingFocus = featureId
      return false
    },
    fitBounds(): void {
      handle.value.controller.value?.fitBounds()
    },
  }
}
