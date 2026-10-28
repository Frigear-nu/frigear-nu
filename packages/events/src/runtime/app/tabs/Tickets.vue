<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { StaffEvent, StaffTicketType } from '../utils/admin-event'

defineOptions({ name: 'EventsAdminTicketsTab' })

// The built-in "Tickets" tab of the `admin.events` area: ticket types and their add-on groups and choices.
// Creating, editing and deleting them goes through `useEventCatalogActions` (slideovers and confirms).
const props = defineProps<{ event: StaffEvent }>()
const emit = defineEmits<{ refresh: [] }>()

const t = useModuleT('events')
const format = useFormat()
const tr = useEventsTranslate()
const refresh = () => emit('refresh')

// Membership rules are only offered when @frigear-nu/subscriptions is installed; the plans come from it.
type Membership = 'any' | string[] | null

// Not awaited (the tab renders at once) and without a default: until the options are known `optionsLoading` is true and
// the access column shows a placeholder where a rule is set, so labels never switch from plan keys to names later.
// Remembered across navigation, and part of the server render on a hard load.
const { data: membershipOptions, loading: optionsLoading } = useCachedFetch<{ available: boolean, options: Array<{ value: string, label: string }> }>('/api/events/admin/membership-options', {
  key: 'events:admin:membership-options',
  ttl: 5 * 60_000,
})
const plans = computed(() => (membershipOptions.value?.options ?? []).map(option => ({ label: option.label, value: option.value })))
const planLabel = (key: string) => plans.value.find(plan => plan.value === key)?.label ?? key
const describeRule = (value: Membership | undefined) => value === 'any' ? t('admin.ruleAny', 'Any membership') : Array.isArray(value) ? value.map(planLabel).join(', ') : ''

const catalog = useEventCatalogActions({
  eventId: () => props.event.id,
  onChanged: refresh,
  membership: () => ({ enabled: membershipOptions.value?.available === true, plans: plans.value }),
})

const RowMenu = resolveComponent('RowMenu')

const typeColumns = computed<TableColumn<StaffTicketType>[]>(() => [
  { id: 'expand', meta: { class: { th: 'w-0', td: 'w-0' } } },
  {
    accessorKey: 'name',
    header: t('admin.name', 'Name'),
    cell: ({ row }) => h('span', { class: 'text-highlighted font-medium' }, tr(row.original.name)),
  },
  {
    accessorKey: 'price',
    header: t('admin.price', 'Price'),
    meta: numericColumn,
    cell: ({ row }) => h('span', { class: 'whitespace-nowrap' }, format.money(row.original.price, row.original.currency)),
  },
  {
    accessorKey: 'capacity',
    header: t('admin.capacity', 'Capacity'),
    meta: numericColumn,
    cell: ({ row }) => row.original.capacity ?? emptyCell(),
  },
  { id: 'access', header: t('admin.access', 'Access') },
  {
    id: 'addons',
    header: t('admin.addonGroups', 'Add-ons'),
    meta: numericColumn,
    cell: ({ row }) => row.original.addonGroups.length,
  },
  {
    id: 'actions',
    meta: { class: { th: 'w-0', td: 'w-0' } },
    cell: ({ row }) => h(RowMenu, { items: catalog.typeMenu(row.original), subject: tr(row.original.name) }),
  },
])
</script>

<template>
  <TableCard :title="t('admin.ticketTypes', 'Ticket types')">
    <template #actions>
      <UButton
        icon="i-lucide-plus"
        variant="outline"
        color="neutral"
        size="xs"
        :label="t('admin.addType', 'Add ticket type')"
        @click="catalog.openTicketType()"
      />
    </template>
    <UTable
      :data="event.ticketTypes"
      :columns="typeColumns"
      :ui="tableUi({ tr: 'data-[expanded=true]:bg-elevated/30' })"
    >
      <template #expand-cell="{ row }">
        <UButton
          color="neutral"
          variant="ghost"
          size="xs"
          :icon="row.getIsExpanded() ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
          :aria-label="t('admin.addonGroups', 'Add-ons')"
          :aria-expanded="row.getIsExpanded()"
          @click="row.toggleExpanded()"
        />
      </template>
      <template #access-cell="{ row }">
        <USkeleton
          v-if="optionsLoading && (row.original.requiresMembership || row.original.excludesMembership)"
          class="h-5 w-28"
        />
        <div
          v-else-if="row.original.requiresMembership || row.original.excludesMembership"
          class="flex flex-wrap gap-1"
        >
          <UBadge
            v-if="row.original.requiresMembership"
            variant="subtle"
            color="success"
            :label="`${t('admin.requires', 'Requires')}: ${describeRule(row.original.requiresMembership)}`"
          />
          <UBadge
            v-if="row.original.excludesMembership"
            variant="subtle"
            color="warning"
            :label="`${t('admin.notFor', 'Not for')}: ${describeRule(row.original.excludesMembership)}`"
          />
        </div>
        <component
          :is="emptyCell"
          v-else
        />
      </template>
      <template #expanded="{ row }">
        <EventAdminAddonGroups
          :ticket-type="row.original"
          @refresh="refresh"
        />
      </template>
      <template #empty>
        <UEmpty
          variant="naked"
          icon="i-lucide-ticket"
          :title="t('admin.noTypes', 'No ticket types yet: nobody can buy a ticket.')"
          :actions="[{ label: t('admin.addType', 'Add ticket type'), icon: 'i-lucide-plus', onClick: () => catalog.openTicketType() }]"
        />
      </template>
    </UTable>
  </TableCard>
</template>
