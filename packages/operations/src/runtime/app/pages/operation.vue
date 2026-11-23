<script setup lang="ts">
import type { MapViewerOverlay } from '@frigear-nu/maps/utils'
import { isPlacedLayout } from '@frigear-nu/maps/utils'
import type { OperationDto, OperationPublicVenueLayoutDto } from '../../../types'
import { operationsApi } from '../../utils/api'
import { OPERATION_STATUS_LABELS } from '../../utils/status'
import { OPERATIONS_VENUE_SURFACE } from '../../utils/venue'
import { computed, createError, resolveComponent, surfaceClass, useFetch, useFormat, useModuleT, useOperationsTranslate, useRoute, useSeoMeta } from '#imports'

defineOptions({ name: 'OperationDetailPage' })

// The public page of a public operation (`/operations/:slug`). Anything the API answers 404 for (unknown, or not
// public and not yours) is a 404 page.
// MDC comes from the host app (Nuxt Content); resolves to a plain string name when absent.
const hasMdc = typeof resolveComponent('MDC') !== 'string'
const t = useModuleT('operations')
const route = useRoute()
const tr = useOperationsTranslate()
const format = useFormat()
const slug = computed(() => String(route.params.slug))

const { data: operation, error } = await useFetch<OperationDto>(() => operationsApi.operation(slug.value), { key: `operations:detail:${slug.value}` })
// The API also answers participants and staff for a non-public operation, but the public page exists for public ones only.
if (!operation.value || !operation.value.public) {
  throw createError({ statusCode: operation.value ? 404 : error.value?.statusCode ?? 404, statusMessage: t('notFound', 'Operation not found'), fatal: true })
}

useSeoMeta({ title: () => (operation.value ? tr(operation.value.name) : 'Operation') })

// The venue layout over the site map, once staff placed it on the map (or drew it there). A layout that cannot be read
// only leaves the map without it.
const { data: venue } = await useFetch<OperationPublicVenueLayoutDto>(() => operationsApi.venueLayout(slug.value), { key: `operations:venue:${slug.value}` })
const overlays = computed<MapViewerOverlay[]>(() => {
  const value = venue.value
  if (!value || !value.features.length || !isPlacedLayout(value, value.placement) || !operation.value) return []
  const { placement, ...layout } = value
  return [{ id: 'venue', layout, placement, label: t('venueLayout', 'Venue layout'), surface: OPERATIONS_VENUE_SURFACE, params: { operationId: operation.value.id } }]
})
const siteLocations = computed(() => {
  const value = operation.value
  if (!value?.location?.point) return []
  return [{ id: value.id, label: value.location.name ?? value.name, location: { point: value.location.point, radiusMeters: value.location.radiusMeters, area: value.location.area } }]
})
</script>

<template>
  <UContainer>
    <UPage v-if="operation">
      <UPageHeader
        :title="tr(operation.name)"
        :description="operation.hostName ? t('hostedBy', 'Hosted by {host}', { host: operation.hostName }) : undefined"
      >
        <template #headline>
          <UBadge
            v-if="operation.status !== 'active'"
            color="neutral"
            variant="subtle"
            :label="t(`admin.statuses.${operation.status}`, OPERATION_STATUS_LABELS[operation.status])"
          />
        </template>
      </UPageHeader>

      <UPageBody>
        <div class="grid gap-3 sm:grid-cols-2">
          <div
            class="flex items-start gap-3 p-4"
            :class="surfaceClass"
          >
            <UIcon
              name="i-lucide-calendar"
              class="text-primary mt-0.5 size-5 shrink-0"
            />
            <div class="min-w-0">
              <div class="text-muted text-xs font-semibold uppercase tracking-wide">
                {{ t('when', 'When?') }}
              </div>
              <div class="text-highlighted font-medium">
                {{ format.dateRange(operation.startsAt, operation.endsAt, { dateStyle: 'full' }) }}
              </div>
            </div>
          </div>
          <div
            v-if="operation.location"
            class="flex items-start gap-3 p-4"
            :class="surfaceClass"
          >
            <UIcon
              name="i-lucide-map-pin"
              class="text-primary mt-0.5 size-5 shrink-0"
            />
            <div class="min-w-0">
              <div class="text-muted text-xs font-semibold uppercase tracking-wide">
                {{ t('where', 'Where?') }}
              </div>
              <div class="text-highlighted font-medium">
                {{ tr(operation.location.name) }}
              </div>
              <div
                v-if="operation.location.address"
                class="text-muted text-sm"
              >
                {{ operation.location.address }}
              </div>
            </div>
          </div>
        </div>

        <MapViewer
          v-if="siteLocations.length || overlays.length"
          :locations="siteLocations"
          :overlays="overlays"
          :height="overlays.length ? '26rem' : '18rem'"
          data-testid="operation-site-map"
        />

        <UButton
          v-if="operation.hostUrl"
          :to="operation.hostUrl"
          target="_blank"
          rel="noopener"
          variant="outline"
          color="neutral"
          trailing-icon="i-lucide-external-link"
          :label="t('hostWebsite', 'Visit the host')"
          class="self-start"
        />

        <div v-if="operation.description">
          <MDC
            v-if="hasMdc"
            :value="tr(operation.description)"
            class="prose text-muted max-w-none"
          />
          <div
            v-else
            class="text-muted whitespace-pre-line"
          >
            {{ tr(operation.description) }}
          </div>
        </div>
      </UPageBody>
    </UPage>
  </UContainer>
</template>
