<script setup lang="ts">
import type { PlaneFeatureCollection, PlaneUnderlay } from '@frigear-nu/maps/utils'
import type { OperationVenueLayoutDto, OperationVenueUnderlayDto } from '../../../types'
import { operationsApi } from '../../utils/api'
import { OPERATIONS_VENUE_KINDS, OPERATIONS_VENUE_SURFACE } from '../../utils/venue'
import type { StaffOperation } from '../utils/admin-operation'
import { $fetch, computed, errorMessage, ref, useAction, useFetch, useModuleT, useOperationsTranslate } from '#imports'

defineOptions({ name: 'OperationsAdminVenueLayoutTab' })

// The "Venue layout" tab of the `admin.operations` area: coordinators (`operations:manage`) draw where the stations,
// containers and areas are with the plane editor of `@frigear-nu/maps`, on an uploaded floor plan, and save it. Below,
// the saved layout with the live layers other modules draw on it (who is on duty, from shifts).
const props = defineProps<{ operation: StaffOperation }>()

const t = useModuleT('operations')
const tr = useOperationsTranslate()
const { busy, run } = useAction()

const { data, status, error, refresh } = await useFetch<OperationVenueLayoutDto>(() => operationsApi.admin.venueLayout(props.operation.id), {
  key: `operations:venue-layout:${props.operation.id}`,
})

// The editor's copy leaves out the `revision`: it goes back with a save, from `data` (what was last read or written).
const clone = (value: OperationVenueLayoutDto | null | undefined): PlaneFeatureCollection => {
  if (!value) return { type: 'FeatureCollection', features: [] }
  const { revision: _revision, ...layout } = JSON.parse(JSON.stringify(value)) as OperationVenueLayoutDto
  return layout
}
// The editor's copy. It is reset from the saved layout only on load, save and discard, never while unsaved edits exist.
const layout = ref<PlaneFeatureCollection>(clone(data.value))
const dirty = computed(() => JSON.stringify(layout.value) !== JSON.stringify(clone(data.value)))

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
    // A layout someone changed since it was loaded is not overwritten: 409, shown as an error; "Discard changes" and a
    // reload bring the current one.
    () => $fetch<OperationVenueLayoutDto>(operationsApi.admin.venueLayout(props.operation.id), {
      method: 'PUT',
      body: { layout: layout.value, revision: data.value?.revision },
    }),
    { success: t('admin.venueSaved', 'Saved the venue layout of {name}', { name: tr(props.operation.name) }) },
  )
  if (!saved) return
  data.value = saved
  layout.value = clone(saved)
}

async function reload() {
  await refresh()
  layout.value = clone(data.value)
}

function discard() {
  layout.value = clone(data.value)
}
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
        :kinds="[...OPERATIONS_VENUE_KINDS]"
        :upload="upload"
      />
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
        :layout="data"
        :surface="OPERATIONS_VENUE_SURFACE"
        :params="{ operationId: props.operation.id }"
        height="24rem"
      />
    </SectionCard>
  </div>
</template>
