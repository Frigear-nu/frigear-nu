<script setup lang="ts">
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
import type { StaffEvent, StaffTicketType } from '../utils/admin-event'

defineOptions({ name: 'EventsAdminTicketsTab' })

// The built-in "Tickets" tab of the `admin.events` area: ticket types and their add-on groups and choices.
// The create/edit dialogs live in `EventAdminTicketTypeDialog`, `EventAdminAddonGroupDialog` and `EventAdminAddonDialog`.
const props = defineProps<{ event: StaffEvent }>()
const emit = defineEmits<{ refresh: [] }>()

const t = useModuleT('events')
const format = useFormat()
const tr = useEventsTranslate()
const confirmAction = useConfirmDialog()
const { run } = useAction()
const refresh = () => emit('refresh')

const typeColumns = computed<TableColumn<StaffTicketType>[]>(() => [
  { id: 'expand' },
  { accessorKey: 'name', header: t('admin.name', 'Name') },
  { accessorKey: 'price', header: t('admin.price', 'Price') },
  { accessorKey: 'capacity', header: t('admin.capacity', 'Capacity') },
  { id: 'access', header: t('admin.access', 'Access') },
  { id: 'addons', header: t('admin.addonGroups', 'Add-ons') },
  { id: 'actions' },
])

// Membership rules are only offered when @frigear-nu/subscriptions is installed; the plans come from it.
type Membership = 'any' | string[] | null

const { data: membershipOptions } = useLazyFetch<{ available: boolean, options: Array<{ value: string, label: string }> }>('/api/events/admin/membership-options', { default: () => ({ available: false, options: [] }) })
const membershipEnabled = computed(() => membershipOptions.value.available)
const plans = computed(() => membershipOptions.value.options.map(option => ({ label: option.label, value: option.value })))
const planLabel = (key: string) => plans.value.find(plan => plan.value === key)?.label ?? key
const describeRule = (value: Membership | undefined) => value === 'any' ? t('admin.ruleAny', 'Any membership') : Array.isArray(value) ? value.map(planLabel).join(', ') : ''

const typeDialog = useTemplateRef('typeDialog')
const groupDialog = useTemplateRef('groupDialog')
const addonDialog = useTemplateRef('addonDialog')

const removeType = async (ticketType: StaffTicketType) => {
  const name = tr(ticketType.name)
  if (!await confirmAction({
    title: t('admin.confirmRemoveType', 'Delete {name}?', { name }),
    description: t('admin.confirmRemoveTypeDescription', 'Its add-on groups and choices are deleted too. A ticket type with active tickets cannot be deleted.'),
    confirmText: t('admin.removeType', 'Delete ticket type'),
    destructive: true,
  })) return
  return run(async () => {
    await $fetch(`/api/events/admin/ticket-types/${ticketType.id}`, { method: 'DELETE' })
    await refresh()
  }, { success: t('admin.typeDeleted', 'Deleted {name}', { name }) })
}

const menu = (ticketType: StaffTicketType): DropdownMenuItem[][] => [
  [{ label: t('admin.editType', 'Edit ticket type'), icon: 'i-lucide-pencil', onSelect: () => typeDialog.value?.open(ticketType) }],
  [{ label: t('admin.removeType', 'Delete ticket type'), icon: 'i-lucide-trash-2', color: 'error', onSelect: () => { void removeType(ticketType) } }],
]
</script>

<template>
  <div class="flex flex-col gap-4">
    <SectionCard
      :title="t('admin.ticketTypes', 'Ticket types')"
      flush
    >
      <template #actions>
        <UButton
          icon="i-lucide-plus"
          variant="outline"
          color="neutral"
          size="xs"
          :label="t('admin.addType', 'Add ticket type')"
          @click="typeDialog?.open()"
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
            @click="row.toggleExpanded()"
          />
        </template>
        <template #name-cell="{ row }">
          <span class="text-highlighted font-medium">{{ tr(row.original.name) }}</span>
        </template>
        <template #price-cell="{ row }">
          <span class="whitespace-nowrap">{{ format.money(row.original.price, row.original.currency) }}</span>
        </template>
        <template #capacity-cell="{ row }">
          {{ row.original.capacity ?? '–' }}
        </template>
        <template #access-cell="{ row }">
          <div class="flex flex-wrap gap-1">
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
            <span
              v-if="!row.original.requiresMembership && !row.original.excludesMembership"
              class="text-muted"
            >–</span>
          </div>
        </template>
        <template #addons-cell="{ row }">
          {{ row.original.addonGroups.length }}
        </template>
        <template #actions-cell="{ row }">
          <RowMenu
            :items="menu(row.original)"
            :subject="tr(row.original.name)"
          />
        </template>
        <template #expanded="{ row }">
          <EventAdminAddonGroups
            :ticket-type="row.original"
            @refresh="refresh"
            @add-group="groupDialog?.open(row.original)"
            @edit-group="group => groupDialog?.open(row.original, group)"
            @add-addon="group => addonDialog?.open(group, row.original.currency)"
            @edit-addon="(group, addon) => addonDialog?.open(group, row.original.currency, addon)"
          />
        </template>
        <template #empty>
          <UEmpty
            variant="naked"
            icon="i-lucide-ticket"
            :title="t('admin.noTypes', 'No ticket types yet: nobody can buy a ticket.')"
            :actions="[{ label: t('admin.addType', 'Add ticket type'), icon: 'i-lucide-plus', onClick: () => typeDialog?.open() }]"
          />
        </template>
      </UTable>
    </SectionCard>

    <EventAdminTicketTypeDialog
      ref="typeDialog"
      :event-id="props.event.id"
      :membership-enabled="membershipEnabled"
      :plans="plans"
      @refresh="refresh"
    />
    <EventAdminAddonGroupDialog
      ref="groupDialog"
      @refresh="refresh"
    />
    <EventAdminAddonDialog
      ref="addonDialog"
      @refresh="refresh"
    />
  </div>
</template>
