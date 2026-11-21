<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { Page } from '@frigear-nu/module-kit/server'
import { kinds } from '#maps/registry'
import { mapsApi } from '../../utils/api'
import type { AdminMapDto } from '../../../types'
import { computed, errorMessage, h, navigateTo, resolveComponent, tableUi, useFetch, useMapActions, useMapLinks, useMapsTranslate, useModuleT } from '#imports'

defineOptions({ name: 'MapsOwnerMapsTab' })

// The "Maps" tab maps adds to an owner's staff page: `extendTabs(nuxt, 'admin.operations', ...)` with the prop
// `ownerType: 'operation'`. The owner page passes its record in the tab context; for operations that is `operation`.
// Maps never imports the owner module: it only reads the record's `id`.
const props = defineProps<{ ownerType: string, operation?: { id: string } }>()

const t = useModuleT('maps')
const tr = useMapsTranslate()
const links = useMapLinks()
const actions = useMapActions()

const owner = computed(() => ({ type: props.ownerType, id: props.operation?.id ?? null }))
// Without the owner's record there is nothing to list: never query every map of the owner type.
const hasOwner = computed(() => !!owner.value.id)
const { data, status, error, refresh } = await useFetch<Page<AdminMapDto>>(mapsApi.admin.maps, {
  query: computed(() => ({ ownerType: owner.value.type, ownerId: owner.value.id ?? undefined, pageSize: 100, sort: 'createdAt', order: 'asc' })),
  immediate: hasOwner.value,
  watch: false,
})
const rows = computed(() => data.value?.items ?? [])

const TableIdentity = resolveComponent('TableIdentity')
const RowMenu = resolveComponent('RowMenu')
const columns = computed<TableColumn<AdminMapDto>[]>(() => [
  { id: 'name', header: t('admin.name', 'Name'), cell: ({ row }) => h(TableIdentity, { title: tr(row.original.name), description: tr(kinds[row.original.kind]?.label) || row.original.kind }) },
  {
    id: 'actions',
    meta: { class: { th: 'w-0', td: 'w-0' } },
    cell: ({ row }) => h(RowMenu, { items: actions.menu(row.original, { onRemoved: refresh, onChanged: refresh }), subject: tr(row.original.name) }),
  },
])

async function create() {
  if (!hasOwner.value) return
  if (await actions.create({ owner: owner.value, navigate: false })) await refresh()
}

function open(map: AdminMapDto) {
  const to = links.adminMap(map.id)
  if (to) navigateTo(to)
}
</script>

<template>
  <TableCard
    :title="t('admin.title', 'Maps')"
    :loading="hasOwner && status === 'pending' && !data"
  >
    <template
      v-if="hasOwner"
      #actions
    >
      <UButton
        icon="i-lucide-plus"
        size="sm"
        :label="t('admin.create', 'Add map')"
        @click="create"
      />
    </template>
    <UEmpty
      v-if="!hasOwner"
      variant="naked"
      icon="i-lucide-circle-alert"
      :title="t('admin.noOwner', 'Open this tab from an operation page.')"
    />
    <UEmpty
      v-else-if="error && !data"
      variant="naked"
      icon="i-lucide-circle-alert"
      :title="t('admin.loadFailed', 'Maps could not be loaded')"
      :description="errorMessage(error, '')"
      :actions="[{ label: t('tryAgain', 'Try again'), icon: 'i-lucide-rotate-ccw', color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
    />
    <UTable
      v-else
      :data="rows"
      :columns="columns"
      :ui="tableUi()"
      @select="(_: Event, row: { original: AdminMapDto }) => open(row.original)"
    >
      <template #empty>
        <UEmpty
          variant="naked"
          icon="i-lucide-map"
          :title="t('admin.ownerEmpty', 'No maps here yet')"
          :description="t('admin.ownerEmptyDescription', 'Add the site map, a bar layout or any other map of this operation.')"
          :actions="[{ label: t('admin.create', 'Add map'), icon: 'i-lucide-plus', onClick: create }]"
        />
      </template>
    </UTable>
  </TableCard>
</template>
