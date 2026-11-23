<script setup lang="ts">
import type { MapLocation, PlaneFeatureCollection, PlaneUnderlay } from '../../../src/runtime/utils'
import { demoLayout, demoLocation } from '../utils/demo'

const location = ref<MapLocation | null>(demoLocation())
const layout = ref<PlaneFeatureCollection>(demoLayout())

// What a module passes to the editor: its own upload route.
async function upload(file: File): Promise<PlaneUnderlay> {
  const body = new FormData()
  body.append('file', file)
  return await $fetch<PlaneUnderlay>('/api/demo/underlay', { method: 'POST', body })
}
</script>

<template>
  <UContainer class="flex flex-col gap-8 py-8">
    <section class="flex flex-col gap-3">
      <h2 class="text-lg font-semibold">
        Location picker
      </h2>
      <UFormField
        label="Location"
        description="A point, a radius or an area."
      >
        <MapLocationField v-model="location" />
      </UFormField>
    </section>

    <section class="flex flex-col gap-3">
      <h2 class="text-lg font-semibold">
        Plane editor
      </h2>
      <MapPlaneEditor
        v-model="layout"
        :kinds="['demo.seat', 'maps.area', 'maps.label', 'maps.marker']"
        :upload="upload"
      />
    </section>

    <section class="flex flex-col gap-3">
      <h2 class="text-lg font-semibold">
        Viewer
      </h2>
      <MapViewer
        :layout="layout"
        surface="demo.venue"
        :params="{ venue: 'main-stage' }"
      />
      <MapViewer :locations="location ? [{ id: 'site', label: 'Festival site', location }] : []" />
    </section>
  </UContainer>
</template>
