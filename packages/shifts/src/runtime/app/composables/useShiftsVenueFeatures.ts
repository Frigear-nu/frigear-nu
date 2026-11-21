import type { MaybeRefOrGetter } from 'vue'
import { operationsApi } from '@frigear-nu/operations/api'
import type { PlaneFeatureCollection } from '@frigear-nu/maps/utils'
import { computed, toValue, useLazyFetch, useModuleT, useShiftsTranslate } from '#imports'

/** The value of a "no feature" option in the selects (a select item cannot be empty). */
export const SHIFTS_NO_FEATURE = '__none__'

/**
 * The features of an operation's venue layout as select options (label, else kind and id), for the `featureId` pickers of
 * shifts and stations. `kind` narrows to one feature kind (`operations.station`). Loaded lazily; staff only.
 */
export function useShiftsVenueFeatures(operationId: MaybeRefOrGetter<string>, options: { kind?: string } = {}) {
  const t = useModuleT('shifts')
  const tr = useShiftsTranslate()
  const { data, status } = useLazyFetch<PlaneFeatureCollection>(() => operationsApi.admin.venueLayout(toValue(operationId) || '_'), {
    key: computed(() => `shifts:venue-layout:${toValue(operationId)}`),
    immediate: !!toValue(operationId),
    server: false,
  })
  const features = computed(() => (data.value?.features ?? []).filter(feature => !options.kind || feature.kind === options.kind))
  const items = computed(() => [
    { label: t('admin.noFeature', 'No place on the venue layout'), value: SHIFTS_NO_FEATURE },
    ...features.value.map(feature => ({ label: (feature.label ? tr(feature.label) : '') || `${feature.kind} · ${feature.id}`, value: feature.id })),
  ])
  return { features, items, status }
}
