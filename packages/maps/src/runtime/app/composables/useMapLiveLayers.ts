import type { MaybeRefOrGetter } from 'vue'
import { layers as registeredLayers } from '#maps/registry'
import { layerUrl, layersForSurface } from '../../utils/registry'
import type { MapLayerInfo, MapLiveFeatureCollection } from '../../../types'
import { $fetch, computed, onBeforeUnmount, onMounted, ref, shallowRef, toValue, watch } from '#imports'

/** A live layer the viewer draws: its registration, its filled-in URL and the last GeoJSON it returned. */
export type MapLiveLayer = MapLayerInfo & {
  url: string
  collection: MapLiveFeatureCollection | null
}

export type MapLiveLayersOptions = {
  /** The surface the viewer shows (`operations.venue-layout`): every layer that applies to it is drawn. */
  surface: MaybeRefOrGetter<string | null | undefined>
  /** The values of the endpoints' `:params` (`{ operationId }`). A layer with a missing param is skipped. */
  params?: MaybeRefOrGetter<Record<string, string | number | null | undefined> | null | undefined>
  /** Only these layer ids. */
  only?: MaybeRefOrGetter<readonly string[] | null | undefined>
}

const statusOf = (error: unknown) => (error as { statusCode?: number, status?: number } | null)?.statusCode
  ?? (error as { status?: number } | null)?.status

/**
 * Fetches the live layers of a surface in the browser, and refetches each one every `refreshInterval` seconds while the
 * component is mounted. A layer whose route answers 401 or 403 is dropped: the caller may not see it. A layer that
 * fails otherwise keeps its last features.
 */
export function useMapLiveLayers(options: MapLiveLayersOptions) {
  const entries = computed(() => layersForSurface(registeredLayers, toValue(options.surface), toValue(options.only) ?? undefined)
    .map(info => ({ info, url: layerUrl(info.endpoint, toValue(options.params) ?? {}) }))
    .filter((entry): entry is { info: MapLayerInfo, url: string } => !!entry.url))
  const collections = shallowRef<Record<string, MapLiveFeatureCollection>>({})
  const refused = ref<string[]>([])
  const timers: ReturnType<typeof setInterval>[] = []
  let active = false

  async function load(id: string, url: string) {
    try {
      const collection = await $fetch<MapLiveFeatureCollection>(url)
      if (!active) return
      collections.value = { ...collections.value, [id]: collection?.type === 'FeatureCollection' ? collection : { type: 'FeatureCollection', features: [] } }
    }
    catch (error) {
      const status = statusOf(error)
      if (active && (status === 401 || status === 403) && !refused.value.includes(id)) refused.value = [...refused.value, id]
    }
  }

  function stop() {
    for (const timer of timers.splice(0)) clearInterval(timer)
  }

  function start() {
    stop()
    active = true
    for (const { info, url } of entries.value) {
      load(info.id, url)
      if (info.refreshInterval) timers.push(setInterval(() => load(info.id, url), info.refreshInterval * 1000))
    }
  }

  onMounted(start)
  watch(() => entries.value.map(entry => entry.url).join('\n'), () => {
    if (!active) return
    refused.value = []
    collections.value = {}
    start()
  })
  onBeforeUnmount(() => {
    active = false
    stop()
  })

  const layers = computed<MapLiveLayer[]>(() => entries.value
    .filter(entry => !refused.value.includes(entry.info.id))
    .map(entry => ({ ...entry.info, url: entry.url, collection: collections.value[entry.info.id] ?? null })))

  /** Refetches every layer now. */
  const refresh = () => Promise.all(entries.value.map(entry => load(entry.info.id, entry.url)))

  return { layers, refresh }
}
