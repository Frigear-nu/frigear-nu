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
 *
 * `hidden` holds the ids of the layers the viewer hides. A layer registered with `visible: false` starts there. A hidden
 * layer is not fetched or polled; showing it fetches it at once. When `params` change, answers still in flight for the
 * old URLs are dropped.
 */
export function useMapLiveLayers(options: MapLiveLayersOptions) {
  const entries = computed(() => layersForSurface(registeredLayers, toValue(options.surface), toValue(options.only) ?? undefined)
    .map(info => ({ info, url: layerUrl(info.endpoint, toValue(options.params) ?? {}) }))
    .filter((entry): entry is { info: MapLayerInfo, url: string } => !!entry.url))
  const collections = shallowRef<Record<string, MapLiveFeatureCollection>>({})
  const refused = ref<string[]>([])
  const hidden = ref<string[]>([])
  const known = new Set<string>()
  watch(entries, (list) => {
    const start: string[] = []
    for (const { info } of list) {
      if (known.has(info.id)) continue
      known.add(info.id)
      if (!info.visible) start.push(info.id)
    }
    if (start.length) hidden.value = [...new Set([...hidden.value, ...start])]
  }, { immediate: true })
  const isHidden = (id: string) => hidden.value.includes(id)
  const timers: ReturnType<typeof setInterval>[] = []
  let active = false
  // Bumped by every (re)start: a response to a request of an older generation (old params) is dropped, so a slow
  // answer for the previous URL never overwrites the current layer.
  let generation = 0

  async function load(id: string, url: string, run = generation) {
    if (isHidden(id)) return
    const current = () => active && run === generation
    try {
      const collection = await $fetch<MapLiveFeatureCollection>(url)
      if (!current()) return
      collections.value = { ...collections.value, [id]: collection?.type === 'FeatureCollection' ? collection : { type: 'FeatureCollection', features: [] } }
    }
    catch (error) {
      const status = statusOf(error)
      if (current() && (status === 401 || status === 403) && !refused.value.includes(id)) refused.value = [...refused.value, id]
    }
  }

  function stop() {
    for (const timer of timers.splice(0)) clearInterval(timer)
  }

  function start() {
    stop()
    active = true
    const run = ++generation
    for (const { info, url } of entries.value) {
      load(info.id, url, run)
      if (info.refreshInterval) timers.push(setInterval(() => load(info.id, url, run), info.refreshInterval * 1000))
    }
  }

  onMounted(start)
  watch(() => entries.value.map(entry => entry.url).join('\n'), () => {
    if (!active) return
    refused.value = []
    collections.value = {}
    start()
  })
  // A layer that is shown again is fetched at once rather than at its next tick.
  watch(hidden, (now, before) => {
    if (!active) return
    for (const { info, url } of entries.value) {
      if (before?.includes(info.id) && !now.includes(info.id)) load(info.id, url)
    }
  })
  onBeforeUnmount(() => {
    active = false
    generation++
    stop()
  })

  const layers = computed<MapLiveLayer[]>(() => entries.value
    .filter(entry => !refused.value.includes(entry.info.id))
    .map(entry => ({ ...entry.info, url: entry.url, collection: collections.value[entry.info.id] ?? null })))

  /** Refetches every shown layer now. */
  const refresh = () => Promise.all(entries.value.map(entry => load(entry.info.id, entry.url)))

  return { layers, hidden, refresh }
}
