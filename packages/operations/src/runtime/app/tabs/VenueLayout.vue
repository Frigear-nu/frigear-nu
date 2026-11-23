<script setup lang="ts">
import type { MapLocation, MapViewerOverlay, PlaneFeatureCollection, PlanePlacement, PlaneUnderlay } from '@frigear-nu/maps/utils'
import { isPlacedLayout } from '@frigear-nu/maps/utils'
import type { OperationVenueLayoutDto, OperationVenuePlacementDto, OperationVenueUnderlayDto } from '../../../types'
import { operationsApi } from '../../utils/api'
import { OPERATIONS_VENUE_KINDS, OPERATIONS_VENUE_SURFACE } from '../../utils/venue'
import type { StaffOperation } from '../utils/admin-operation'
import { $fetch, computed, errorMessage, ref, useAction, useFetch, useModuleT, useOperationsTranslate, useRoute } from '#imports'

defineOptions({ name: 'OperationsAdminVenueLayoutTab' })

// The "Venue layout" tab of the `admin.operations` area: coordinators (`operations:manage`) draw where the stations,
// containers and areas are with the plane editor of `@frigear-nu/maps` (on a plane with an uploaded floor plan, or
// directly on the map), place the plane on the real map around the operation's location, and save. The layout and its
// placement are saved apart (each with its own revision). Below, the saved layout with the live layers other modules
// draw on it (who is on duty, from shifts), and, once placed, the site map with the layout over it.
const props = defineProps<{ operation: StaffOperation }>()

const t = useModuleT('operations')
const tr = useOperationsTranslate()
const route = useRoute()
const { busy, run } = useAction()

const { data, status, error, refresh } = await useFetch<OperationVenueLayoutDto>(() => operationsApi.admin.venueLayout(props.operation.id), {
  key: `operations:venue-layout:${props.operation.id}`,
})

// The editor's copies leave out the revisions and the placement: they go back with a save, from `data` (what was last
// read or written).
const clone = (value: OperationVenueLayoutDto | null | undefined): PlaneFeatureCollection => {
  if (!value) return { type: 'FeatureCollection', features: [] }
  const { revision: _revision, placement: _placement, placementRevision: _placementRevision, ...layout } = JSON.parse(JSON.stringify(value)) as OperationVenueLayoutDto
  return layout
}
const clonePlacement = (value: OperationVenueLayoutDto | null | undefined): PlanePlacement | null => value?.placement ? JSON.parse(JSON.stringify(value.placement)) : null

// The editor's copies. They are reset from the saved values only on load, save and discard, never while unsaved edits exist.
const layout = ref<PlaneFeatureCollection>(clone(data.value))
const placement = ref<PlanePlacement | null>(clonePlacement(data.value))
const layoutDirty = computed(() => JSON.stringify(layout.value) !== JSON.stringify(clone(data.value)))
const placementDirty = computed(() => JSON.stringify(placement.value ?? null) !== JSON.stringify(clonePlacement(data.value)))
const dirty = computed(() => layoutDirty.value || placementDirty.value)

/** The operation's location as the maps components take it: only with a point. */
const location = computed<MapLocation | null>(() => {
  const value = props.operation.location
  return value?.point ? { point: value.point, radiusMeters: value.radiusMeters, area: value.area } : null
})
// The current page (already localised) on its Details tab.
const detailsLink = computed(() => ({ path: route.path, query: { ...route.query, tab: 'details' } }))

async function upload(file: File): Promise<PlaneUnderlay> {
  const body = new FormData()
  body.append('file', file)
  // With the revision read, so an upload never replaces a layout someone else changed meanwhile (409).
  const { revision, ...underlay } = await $fetch<OperationVenueUnderlayDto>(operationsApi.admin.venueUnderlay(props.operation.id), {
    method: 'POST',
    body,
    query: { revision: data.value?.revision },
  })
  // The image is stored (and the old one deleted) right away: the saved layout has it now, whether or not the drawing
  // is saved, so discarding never brings back the old image's URL. Its new revision is what the next save sends.
  if (data.value) data.value = { ...data.value, underlay, revision }
  return underlay
}

async function save() {
  const saved = await run(
    // A layout or placement someone changed since it was loaded is not overwritten: 409, shown as an error; "Discard
    // changes" and a reload bring the current one. The layout goes first: a converted layout drops its placement.
    async () => {
      let next = data.value!
      if (layoutDirty.value) {
        next = await $fetch<OperationVenueLayoutDto>(operationsApi.admin.venueLayout(props.operation.id), {
          method: 'PUT',
          body: { layout: layout.value, revision: next.revision },
        })
      }
      if (placementDirty.value) {
        const saved = await $fetch<OperationVenuePlacementDto>(operationsApi.admin.venuePlacement(props.operation.id), {
          method: 'PUT',
          body: { placement: placement.value, revision: next.placementRevision },
        })
        next = { ...next, placement: saved.placement, placementRevision: saved.revision }
      }
      return next
    },
    { success: t('admin.venueSaved', 'Saved the venue layout of {name}', { name: tr(props.operation.name) }) },
  )
  if (!saved) return
  data.value = saved
  layout.value = clone(saved)
  placement.value = clonePlacement(saved)
}

async function reload() {
  await refresh()
  discard()
}

function discard() {
  layout.value = clone(data.value)
  placement.value = clonePlacement(data.value)
}

/** The saved layout over the operation's location, once it is placed or drawn on the map. */
const overlays = computed<MapViewerOverlay[]>(() => {
  const saved = data.value
  if (!saved || !isPlacedLayout(saved, saved.placement)) return []
  return [{ id: 'venue', layout: clone(saved), placement: saved.placement, label: t('admin.venueLayout', 'Venue layout'), surface: OPERATIONS_VENUE_SURFACE, params: { operationId: props.operation.id } }]
})
const siteLocations = computed(() => location.value ? [{ id: props.operation.id, label: props.operation.location?.name ?? props.operation.name, location: location.value }] : [])
</script>

<template>
  <div class="flex flex-col gap-4">
    <SectionCard
      :title="t('admin.venueLayout', 'Venue layout')"
      :description="t('admin.venueLayoutHelp', 'Where the stations, containers and areas are. Shifts point to them, and the live layers draw on them.')"
      :loading="status === 'pending' && !data"
    >
      <UAlert
        v-if="error"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="t('admin.venueLoadFailed', 'The venue layout could not be loaded.')"
        :description="errorMessage(error, '')"
        :actions="[{ label: t('admin.tryAgain', 'Try again'), color: 'neutral', variant: 'outline', onClick: reload }]"
      />
      <MapPlaneEditor
        v-else-if="data"
        v-model="layout"
        v-model:placement="placement"
        :kinds="[...OPERATIONS_VENUE_KINDS]"
        :upload="upload"
        :location="location"
        allow-geo
      >
        <template #no-location>
          <UEmpty
            icon="i-lucide-map-pin-off"
            :title="t('admin.venueNoLocationTitle', 'This operation has no location yet')"
            :description="t('admin.venueNoLocation', 'Set where it takes place in Details: the map opens there, with the site shown while you place or draw.')"
            :actions="[{ label: t('admin.venueSetLocation', 'Set the location'), icon: 'i-lucide-map-pin', to: detailsLink, color: 'neutral', variant: 'outline' }]"
            data-testid="operations-venue-no-location"
          />
        </template>
      </MapPlaneEditor>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="outline"
            :disabled="!dirty || busy"
            :label="t('admin.discardVenue', 'Discard changes')"
            @click="discard"
          />
          <UButton
            :loading="busy"
            :disabled="!dirty"
            :label="t('admin.saveVenue', 'Save venue layout')"
            data-testid="operations-venue-save"
            @click="save"
          />
        </div>
      </template>
    </SectionCard>

    <SectionCard
      v-if="data"
      :title="t('admin.venueLive', 'Live view')"
      :description="t('admin.venueLiveHelp', 'The saved layout as crew see it, with the live layers.')"
    >
      <MapViewer
        :layout="clone(data)"
        :placement="data.placement"
        :surface="OPERATIONS_VENUE_SURFACE"
        :params="{ operationId: props.operation.id }"
        height="24rem"
      />
    </SectionCard>

    <SectionCard
      v-if="overlays.length && data?.crs !== 'geo'"
      :title="t('admin.venueSiteMap', 'On the site map')"
      :description="t('admin.venueSiteMapHelp', 'The saved layout over the map of the operation, as the operation page shows it.')"
    >
      <MapViewer
        :locations="siteLocations"
        :overlays="overlays"
        height="24rem"
      />
    </SectionCard>
  </div>
</template>
