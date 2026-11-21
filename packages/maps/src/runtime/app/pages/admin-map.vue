<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { kinds } from '#maps/registry'
import { mapsApi } from '../../utils/api'
import type { AdminMapDetailDto } from '../../../types'
import { computed, errorMessage, h, navigateTo, refreshNuxtData, resolveComponent, tableUi, useFetch, useMapActions, useMapLayerActions, useMapLinks, useMapsTranslate, useModuleT, useRoute } from '#imports'

defineOptions({ name: 'MapsAdminMapPage' })

type LayerRow = AdminMapDetailDto['layers'][number]

const t = useModuleT('maps')
const tr = useMapsTranslate()
const route = useRoute()
const links = useMapLinks()
const actions = useMapActions()
const id = computed(() => String(route.params.id))
const layerActions = useMapLayerActions(() => id.value)

const { data: map, error, refresh } = await useFetch<AdminMapDetailDto>(() => mapsApi.admin.map(id.value))
const notFound = computed(() => error.value?.statusCode === 404)
const forbidden = computed(() => error.value?.statusCode === 401 || error.value?.statusCode === 403)
const kind = computed(() => map.value ? kinds[map.value.kind] : undefined)
const viewTo = computed(() => map.value ? links.view(map.value.key ?? map.value.id) : undefined)

// The editor reads the map through `useMap()` (key `maps:map:<id>`): refresh both after layer or floor plan changes.
async function refreshAll() {
  await Promise.all([refresh(), refreshNuxtData(`maps:map:${id.value}`)])
}

const facts = computed(() => map.value
  ? [
      { key: 'kind', label: t('admin.kind', 'Kind'), value: tr(kind.value?.label) || map.value.kind },
      { key: 'base', label: t('admin.base', 'Base'), value: map.value.base === 'geo' ? t('admin.baseGeo', 'geographic') : t('admin.basePlane', 'floor plan') },
      { key: 'owner', label: t('admin.owner', 'Owner'), value: tr(map.value.ownerLabel) || (map.value.ownerType === 'platform' ? t('admin.owners.platform', 'Platform') : `${map.value.ownerType} ${map.value.ownerId ?? ''}`) },
      { key: 'key', label: t('admin.key', 'Key'), value: map.value.key },
      { key: 'visibility', label: t('admin.visibility', 'Who can see it'), value: map.value.public ? t('visibility.publicShort', 'Public') : t('visibility.restrictedShort', 'Signed in') },
      { key: 'source', label: t('admin.source', 'Created by'), value: map.value.source === 'code' ? t('admin.sourceCode', 'a module') : t('admin.sourceAdmin', 'staff') },
    ]
  : [])

const RowMenu = resolveComponent('RowMenu')
const TableIdentity = resolveComponent('TableIdentity')
const columns = computed<TableColumn<LayerRow>[]>(() => [
  { id: 'name', header: t('admin.name', 'Name'), cell: ({ row }) => h(TableIdentity, { title: tr(row.original.name) || row.original.key, description: row.original.key }) },
  { accessorKey: 'featureCount', header: t('admin.features', 'Features'), cell: ({ row }) => h('span', { class: 'tabular-nums' }, String(row.original.featureCount)) },
  {
    id: 'flags',
    header: t('admin.layerSettings', 'Settings'),
    cell: ({ row }) => h('span', { class: 'text-muted' }, [
      row.original.visible ? t('admin.shown', 'Shown') : t('admin.hidden', 'Hidden'),
      row.original.editable ? t('admin.editableShort', 'editable') : t('admin.lockedShort', 'locked'),
      row.original.visibility ? t('admin.restrictedShort', 'restricted') : null,
    ].filter(Boolean).join(' · ')),
  },
  {
    id: 'actions',
    meta: { class: { th: 'w-0', td: 'w-0' } },
    cell: ({ row }) => h(RowMenu, { items: layerActions.menu(row.original, { onChanged: refreshAll }), subject: tr(row.original.name) || row.original.key }),
  },
])

async function addLayer() {
  if (await layerActions.create()) await refreshAll()
}

async function uploadUnderlay() {
  if (map.value && await actions.uploadUnderlay(map.value)) await refreshAll()
}

async function removeUnderlay() {
  if (map.value && await actions.removeUnderlay(map.value)) await refreshAll()
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <template v-if="map">
      <PageHeading
        :title="tr(map.name)"
        :breadcrumb="[{ label: t('admin.title', 'Maps'), to: links.admin() }, { label: tr(map.name) }]"
      >
        <template #actions>
          <UButton
            v-if="viewTo"
            :to="viewTo"
            target="_blank"
            variant="outline"
            color="neutral"
            icon="i-lucide-external-link"
            :label="t('admin.viewMap', 'View map')"
          />
          <RowMenu
            variant="outline"
            :subject="tr(map.name)"
            :items="actions.menu(map, { open: false, onChanged: refreshAll, onRemoved: () => navigateTo(links.admin() ?? '/') })"
          />
        </template>
      </PageHeading>

      <SectionCard :title="t('admin.keyFacts', 'Map')">
        <DescriptionList :items="facts" />
      </SectionCard>

      <SectionCard
        :title="t('admin.editorTitle', 'Drawing')"
        :description="t('admin.editorDescription', 'Draw with the tools of this map\'s kind. Changes are saved as you make them.')"
      >
        <MapEditor :map="map.id" />
      </SectionCard>

      <TableCard :title="t('admin.layers', 'Layers')">
        <template #actions>
          <UButton
            icon="i-lucide-plus"
            size="sm"
            :label="t('admin.addLayer', 'Add layer')"
            @click="addLayer"
          />
        </template>
        <UTable
          :data="map.layers"
          :columns="columns"
          :ui="tableUi()"
        >
          <template #empty>
            <UEmpty
              variant="naked"
              icon="i-lucide-layers"
              :title="t('admin.noLayers', 'No layers yet')"
              :description="t('admin.noLayersDescription', 'Features are drawn on layers. Add one to start drawing.')"
              :actions="[{ label: t('admin.addLayer', 'Add layer'), icon: 'i-lucide-plus', onClick: addLayer }]"
            />
          </template>
        </UTable>
      </TableCard>

      <SectionCard
        v-if="map.base === 'plane'"
        :title="t('admin.underlayTitle', 'Floor plan')"
        :description="t('admin.underlaySection', 'An image under the drawing, such as an architect\'s plan.')"
      >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <p class="text-sm text-muted">
            {{ map.underlay
              ? t('admin.underlayCurrent', '{width} × {height} pixels', { width: map.underlay.width, height: map.underlay.height })
              : t('admin.underlayNone', 'No floor plan yet.') }}
          </p>
          <div class="flex gap-2">
            <UButton
              v-if="map.underlay"
              color="error"
              variant="outline"
              icon="i-lucide-trash-2"
              :label="t('admin.removeUnderlayAction', 'Remove floor plan')"
              @click="removeUnderlay"
            />
            <UButton
              icon="i-lucide-image-up"
              :label="map.underlay ? t('admin.replaceUnderlay', 'Replace floor plan') : t('admin.underlayAction', 'Upload floor plan')"
              @click="uploadUnderlay"
            />
          </div>
        </div>
      </SectionCard>
    </template>

    <UEmpty
      v-else-if="forbidden"
      icon="i-lucide-lock"
      :title="t('admin.forbidden', 'You do not have access to maps')"
      :actions="[{ label: t('admin.allMaps', 'All maps'), to: links.admin(), color: 'neutral', variant: 'outline' }]"
    />
    <UEmpty
      v-else-if="notFound || !error"
      icon="i-lucide-map"
      :title="t('view.notFound', 'Map not found')"
      :actions="[{ label: t('admin.allMaps', 'All maps'), to: links.admin(), color: 'neutral', variant: 'outline' }]"
    />
    <UEmpty
      v-else
      icon="i-lucide-circle-alert"
      :title="t('admin.mapLoadFailed', 'The map could not be loaded')"
      :description="errorMessage(error, '')"
      :actions="[{ label: t('tryAgain', 'Try again'), icon: 'i-lucide-rotate-ccw', color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
    />
  </div>
</template>
