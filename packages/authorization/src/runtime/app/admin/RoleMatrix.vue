<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { VNode } from 'vue'
import { authorizationApi } from '../../utils/api'
import type { AuthorizationMatrixPermissionDto, AuthorizationPermissionGrant, AuthorizationRoleMatrixDto } from '../../utils/api'
import { useRoleLabels } from './useRoleLabels'
import { computed, emptyCell, errorMessage, h, ref, resolveComponent, tableUi, useFetch } from '#imports'

defineOptions({ name: 'AuthorizationRoleMatrix' })

// Every role (columns) against every registered permission (rows), grouped by the module that registered it. Loaded
// when the tab opens: the page only mounts this component on the matrix tab.
const { t, translated, moduleLabel, roleLabel, rolePath } = useRoleLabels()

const { data, status, error, refresh } = useFetch<AuthorizationRoleMatrixDto>(authorizationApi.admin.matrix, {
  key: 'authorization-admin-matrix',
  lazy: true,
})
const loading = computed(() => status.value === 'pending' && !data.value)

/** The filter key of the app's own permissions (they have no module). */
const APP = '#app'
const moduleKey = (permission: AuthorizationMatrixPermissionDto) => permission.from ?? APP

const search = ref('')
const module = ref<string | null>(null)

const permissionLabel = (permission: AuthorizationMatrixPermissionDto) => translated(permission.labelKey, permission.label ?? permission.name)
const roleLabels = computed(() => new Map((data.value?.roles ?? []).map(role => [role.name, roleLabel(role)])))
const labelOf = (name: string) => roleLabels.value.get(name) ?? name

// The app's own permissions first, then the modules by name.
const modules = computed(() => {
  const keys = [...new Set((data.value?.permissions ?? []).map(moduleKey))]
  return keys
    .map(key => ({ value: key, label: moduleLabel(key === APP ? null : key) }))
    .sort((a, b) => Number(b.value === APP) - Number(a.value === APP) || a.label.localeCompare(b.label))
})

type MatrixRow
  = | { kind: 'group', key: string, label: string, count: number }
    | { kind: 'permission', permission: AuthorizationMatrixPermissionDto }

const rows = computed<MatrixRow[]>(() => {
  const query = search.value.trim().toLowerCase()
  const visible = (data.value?.permissions ?? []).filter(permission =>
    (!module.value || moduleKey(permission) === module.value)
    && (!query || permission.name.toLowerCase().includes(query) || permissionLabel(permission).toLowerCase().includes(query)))
  return modules.value.flatMap(({ value, label }) => {
    const permissions = visible.filter(permission => moduleKey(permission) === value)
    if (!permissions.length) return []
    return [{ kind: 'group' as const, key: value, label, count: permissions.length }, ...permissions.map(permission => ({ kind: 'permission' as const, permission }))]
  })
})

const UBadge = resolveComponent('UBadge')
const UIcon = resolveComponent('UIcon')
const UTooltip = resolveComponent('UTooltip')
const ULink = resolveComponent('ULink')

/** An icon with its meaning as a tooltip and as its accessible name. */
const marker = (icon: string, iconClass: string, text: string, tooltip = true): VNode => {
  const node = h('span', { 'class': 'inline-flex', 'role': 'img', 'aria-label': text }, [h(UIcon, { name: icon, class: iconClass })])
  return tooltip ? h(UTooltip, { text }, () => node) : node
}

const legend = computed(() => [
  { icon: 'i-lucide-check', class: 'size-4 text-primary', label: t('admin.matrix.granted', 'Granted') },
  { icon: 'i-lucide-check', class: 'size-4 text-muted', label: t('admin.matrix.inheritedLegend', 'Inherited') },
  { icon: 'i-lucide-dot', class: 'size-5 text-info', label: t('admin.matrix.implicit', 'Everyone (implicit)') },
  { icon: 'i-lucide-shield-alert', class: 'size-3.5 text-warning', label: t('admin.sensitive', 'Sensitive') },
  { icon: 'i-lucide-key-round', class: 'size-3.5 text-muted', label: t('admin.sessionOnly', 'Session only') },
])

function grantCell(grant: AuthorizationPermissionGrant | undefined, permission: AuthorizationMatrixPermissionDto) {
  if (!grant) return emptyCell()
  switch (grant.via) {
    case 'implicit': return marker('i-lucide-dot', 'size-5 text-info', t('admin.matrix.implicit', 'Everyone (implicit)'))
    case 'inherited': return marker('i-lucide-check', 'size-4 text-muted', t('admin.grant.inherited', 'Inherited from {role}', { role: labelOf(grant.from) }))
    case 'granted': return grant.by === permission.name
      ? marker('i-lucide-check', 'size-4 text-primary', t('admin.matrix.granted', 'Granted'), false)
      : marker('i-lucide-check', 'size-4 text-primary', t('admin.matrix.via', 'via {grant}', { grant: grant.by }))
  }
}

type Cell = { row: { original: MatrixRow } }
const isGroup = (cell: Cell) => cell.row.original.kind === 'group'

const columns = computed<TableColumn<MatrixRow>[]>(() => {
  const roles = data.value?.roles ?? []
  return [
    {
      id: 'permission',
      header: t('admin.permission', 'Permission'),
      meta: {
        // A group row is one cell across the whole table.
        colspan: { td: cell => isGroup(cell) ? String(roles.length + 1) : '1' },
        class: { td: cell => isGroup(cell) ? 'bg-elevated py-1.5' : 'min-w-56' },
      },
      cell: ({ row }: Cell) => {
        const value = row.original
        if (value.kind === 'group') {
          return h('div', { class: 'flex items-center gap-2' }, [
            h(UBadge, { color: 'neutral', variant: 'subtle', size: 'sm', label: value.label }),
            h('span', { class: 'text-muted text-xs' }, countLabel(value.count)),
          ])
        }
        const { permission } = value
        return h('div', { class: 'min-w-0' }, [
          h('div', { class: 'text-highlighted flex items-center gap-1.5 text-sm font-medium' }, [
            h('span', { class: 'truncate' }, permissionLabel(permission)),
            permission.sensitive ? marker('i-lucide-shield-alert', 'size-3.5 text-warning', t('admin.matrix.sensitiveHint', 'Sensitive: only granted by name, never by a wildcard')) : null,
            permission.sessionOnly ? marker('i-lucide-key-round', 'size-3.5 text-muted', t('admin.matrix.sessionOnlyHint', 'Session only: never held by an API or OAuth token')) : null,
          ]),
          h('div', { class: 'text-muted font-mono text-xs' }, permission.name),
        ])
      },
    },
    ...roles.map((role): TableColumn<MatrixRow> => ({
      id: `role:${role.name}`,
      header: () => h(ULink, { to: rolePath(role.name), class: 'text-muted hover:text-highlighted whitespace-nowrap' }, () => roleLabels.value.get(role.name) ?? role.name),
      meta: {
        class: {
          th: 'text-center',
          td: cell => isGroup(cell) ? 'hidden' : 'text-center',
        },
      },
      cell: ({ row }: Cell) => {
        const value = row.original
        if (value.kind === 'group') return null
        return grantCell(data.value?.cells[role.name]?.[value.permission.name], value.permission)
      },
    })),
  ]
})

const tableMeta = { class: { tr: (row: { original: MatrixRow }) => row.original.kind === 'group' ? 'bg-elevated' : '' } }
function clearFilters() {
  search.value = ''
  module.value = null
}
const countLabel = (count: number) => count === 1
  ? t('admin.matrix.countOne', '1 permission')
  : t('admin.matrix.count', '{count} permissions', { count })
const permissionCount = computed(() => rows.value.filter(row => row.kind === 'permission').length)
</script>

<template>
  <div class="flex flex-col gap-3">
    <UEmpty
      v-if="error && !data"
      icon="i-lucide-circle-alert"
      :title="t('admin.matrix.loadFailed', 'The matrix could not be loaded')"
      :description="errorMessage(error, '')"
      :actions="[{ label: t('admin.tryAgain', 'Try again'), icon: 'i-lucide-rotate-ccw', color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
    />
    <template v-else>
      <PageToolbar>
        <UInput
          v-model="search"
          icon="i-lucide-search"
          :placeholder="t('admin.matrix.search', 'Search permissions...')"
          :aria-label="t('admin.matrix.search', 'Search permissions...')"
          class="w-full sm:w-64"
        />
        <USelectMenu
          v-model="module"
          :items="modules"
          value-key="value"
          :placeholder="t('admin.matrix.allModules', 'All modules')"
          :aria-label="t('admin.module', 'Module')"
          :search-input="false"
          clear
          class="w-full sm:w-48"
        />
        <template #right>
          <span class="text-muted text-sm">
            {{ countLabel(permissionCount) }}
          </span>
        </template>
      </PageToolbar>

      <div class="text-muted flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span
          v-for="item in legend"
          :key="item.label"
          class="inline-flex items-center gap-1"
        >
          <UIcon
            :name="item.icon"
            :class="item.class"
          />
          {{ item.label }}
        </span>
        <span>{{ t('admin.matrix.hoverHint', 'Hover a mark to see where the grant comes from.') }}</span>
      </div>

      <TableCard :loading="loading">
        <UTable
          :data="rows"
          :columns="columns"
          :meta="tableMeta"
          :column-pinning="{ left: ['permission'] }"
          sticky
          :ui="tableUi({ tr: '' }, { sticky: true })"
        >
          <template #empty>
            <UEmpty
              icon="i-lucide-search-x"
              variant="naked"
              :title="t('admin.matrix.noMatch', 'No permissions match')"
              :actions="search || module ? [{ label: t('admin.matrix.clearFilters', 'Clear filters'), color: 'neutral', variant: 'outline', onClick: clearFilters }] : []"
            />
          </template>
        </UTable>
      </TableCard>
    </template>
  </div>
</template>
