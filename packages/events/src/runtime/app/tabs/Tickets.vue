<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { formatMoney as formatPrice } from '@frigear-nu/ui/money'
import { type AdminEvent, type AdminTicketType, useAdminAction } from '../utils/admin-event'

defineOptions({ name: 'EventsAdminTicketsTab' })

// The built-in "Tickets" tab of the `admin.events` area: ticket types and their add-on groups and choices.
// The create/edit dialogs live in `EventAdminTicketTypeDialog`, `EventAdminAddonGroupDialog` and `EventAdminAddonDialog`.
const props = defineProps<{ event: AdminEvent }>()
const emit = defineEmits<{ refresh: [] }>()

const t = useModuleT('events')
const locale = useEventsLocale()
const tr = useEventsTranslate()
const confirmAction = useConfirmDialog()
const { run } = useAdminAction()
const refresh = () => emit('refresh')

const typeColumns = computed<TableColumn<AdminTicketType>[]>(() => [
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

const removeType = async (ticketType: AdminTicketType) => {
  if (!await confirmAction({ title: t('admin.confirmRemoveType', 'Delete this ticket type?'), confirmText: t('admin.remove', 'Delete'), cancelText: t('admin.cancel', 'Cancel'), destructive: true })) return
  return run(async () => {
    await $fetch(`/api/events/admin/ticket-types/${ticketType.id}`, { method: 'DELETE' })
    await refresh()
  })
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <AdminSection :title="t('admin.ticketTypes', 'Ticket types')">
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
      <template #flush>
        <UTable
          :data="event.ticketTypes"
          :columns="typeColumns"
          :ui="{ tr: 'data-[expanded=true]:bg-elevated/30' }"
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
            <span class="whitespace-nowrap">{{ formatPrice(row.original.price, row.original.currency, locale) }}</span>
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
            <div class="flex justify-end gap-1">
              <UButton
                icon="i-lucide-pencil"
                color="neutral"
                variant="ghost"
                size="xs"
                :aria-label="t('admin.edit', 'Edit')"
                @click="typeDialog?.open(row.original)"
              />
              <UButton
                icon="i-lucide-trash"
                color="error"
                variant="ghost"
                size="xs"
                :aria-label="t('admin.remove', 'Delete')"
                @click="removeType(row.original)"
              />
            </div>
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
            <AdminEmpty
              icon="i-lucide-ticket"
              :title="t('admin.noTypes', 'No ticket types yet: nobody can buy a ticket.')"
            >
              <UButton
                icon="i-lucide-plus"
                :label="t('admin.addType', 'Add ticket type')"
                @click="typeDialog?.open()"
              />
            </AdminEmpty>
          </template>
        </UTable>
      </template>
    </AdminSection>

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
