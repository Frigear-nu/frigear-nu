<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { Translated } from '../../../types'
import { formatPrice, ticketMdcData } from '../../utils'
import { type AdminAddon, type AdminAddonGroup, type AdminEvent, type AdminTicketType, useAdminAction } from '../utils/admin-event'

defineOptions({ name: 'EventsAdminTicketsTab' })

// The built-in "Tickets" tab of the `admin.events` area: ticket types and their add-on groups and choices.
const props = defineProps<{ event: AdminEvent }>()
const emit = defineEmits<{ refresh: [] }>()

const t = useModuleT('events')
const locale = useEventsLocale()
const tr = useEventsTranslate()
const confirmAction = useConfirmDialog()
const { busy, run } = useAdminAction()
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

// --- ticket types -----------------------------------------------------------------------------
// Membership rules are only offered when @frigear-nu/subscriptions is installed; the plans come from it.
type Membership = 'any' | string[] | null
type Rule = { mode: 'none' | 'any' | 'plans', plans: string[] }

const { data: membershipOptions } = useLazyFetch<{ available: boolean, options: Array<{ value: string, label: string }> }>('/api/events/admin/membership-options', { default: () => ({ available: false, options: [] }) })
const membershipEnabled = computed(() => membershipOptions.value.available)
const plans = computed(() => membershipOptions.value.options.map(option => ({ label: option.label, value: option.value })))
const modes = computed(() => [
  { label: t('admin.ruleNone', 'Nobody'), value: 'none' },
  { label: t('admin.ruleAny', 'Any membership'), value: 'any' },
  { label: t('admin.rulePlans', 'Specific memberships'), value: 'plans' },
])
const toRule = (value: Membership | undefined): Rule => value === 'any' ? { mode: 'any', plans: [] } : Array.isArray(value) && value.length ? { mode: 'plans', plans: [...value] } : { mode: 'none', plans: [] }
const fromRule = (rule: Rule): Membership => rule.mode === 'any' ? 'any' : rule.mode === 'plans' && rule.plans.length ? [...rule.plans] : null
const planLabel = (key: string) => plans.value.find(plan => plan.value === key)?.label ?? key
const describeRule = (value: Membership | undefined) => value === 'any' ? t('admin.ruleAny', 'Any membership') : Array.isArray(value) ? value.map(planLabel).join(', ') : ''

const typeDialog = ref(false)
const editingType = ref<AdminTicketType | null>(null)
const type = reactive({ key: '', name: undefined as Translated | undefined, description: undefined as Translated | undefined, price: 0, capacity: '' as string | number, requires: toRule(null), excludes: toRule(null) })

function openType(ticketType?: AdminTicketType) {
  editingType.value = ticketType ?? null
  Object.assign(type, {
    key: ticketType?.key ?? '',
    name: ticketType?.name,
    description: ticketType?.description ?? undefined,
    price: ticketType ? ticketType.price / 100 : 0,
    capacity: ticketType?.capacity ?? '',
    requires: toRule(ticketType?.requiresMembership),
    excludes: toRule(ticketType?.excludesMembership),
  })
  typeDialog.value = true
}

const saveType = () => run(async () => {
  const body = {
    name: type.name,
    description: type.description ?? null,
    // Prices are stored in minor units (øre/cents).
    price: Math.round(Number(type.price) * 100),
    capacity: type.capacity === '' ? null : Number(type.capacity),
    ...(membershipEnabled.value ? { requiresMembership: fromRule(type.requires), excludesMembership: fromRule(type.excludes) } : {}),
  }
  if (editingType.value) {
    await $fetch(`/api/events/admin/ticket-types/${editingType.value.id}`, { method: 'PATCH', body })
  }
  else {
    await $fetch(`/api/events/admin/events/${props.event.id}/ticket-types`, { method: 'POST', body: { key: type.key, ...body } })
  }
  typeDialog.value = false
  await refresh()
}, t('admin.typeSaved', 'Ticket type saved.'))

const removeType = async (ticketType: AdminTicketType) => {
  if (!await confirmAction({ title: t('admin.confirmRemoveType', 'Delete this ticket type?'), confirmText: t('admin.remove', 'Delete'), cancelText: t('admin.cancel', 'Cancel'), destructive: true })) return
  return run(async () => {
    await $fetch(`/api/events/admin/ticket-types/${ticketType.id}`, { method: 'DELETE' })
    await refresh()
  })
}

// --- add-ons (e.g. a "Food" group with "Carnivore" / "Vegan") -----------------------------------
// Groups belong to a ticket type; buyers choose from them when buying that ticket.
const groupDialog = ref(false)
const groupTicketTypeId = ref('')
const editingGroup = ref<AdminAddonGroup | null>(null)
const group = reactive({ title: undefined as Translated | undefined, required: false, multiple: false })

function openGroup(ticketType: AdminTicketType, existing?: AdminAddonGroup) {
  groupTicketTypeId.value = ticketType.id
  editingGroup.value = existing ?? null
  Object.assign(group, { title: existing?.title, required: existing?.required ?? false, multiple: existing?.multiple ?? false })
  groupDialog.value = true
}

const saveGroup = () => run(async () => {
  const body = { title: group.title, required: group.required, multiple: group.multiple }
  if (editingGroup.value) {
    await $fetch(`/api/events/admin/addon-groups/${editingGroup.value.id}`, { method: 'PATCH', body })
  }
  else {
    await $fetch(`/api/events/admin/ticket-types/${groupTicketTypeId.value}/addon-groups`, { method: 'POST', body })
  }
  groupDialog.value = false
  await refresh()
}, t('admin.groupSaved', 'Add-on group saved.'))

const removeGroup = async (addonGroup: AdminAddonGroup) => {
  if (!await confirmAction({ title: t('admin.confirmRemoveGroup', 'Delete this add-on group and its choices?'), confirmText: t('admin.remove', 'Delete'), cancelText: t('admin.cancel', 'Cancel'), destructive: true })) return
  return run(async () => {
    await $fetch(`/api/events/admin/addon-groups/${addonGroup.id}`, { method: 'DELETE' })
    await refresh()
  })
}

const addonDialog = ref(false)
const addonGroupId = ref('')
const editingAddon = ref<AdminAddon | null>(null)
const addon = reactive({ label: undefined as Translated | undefined, description: undefined as Translated | undefined, price: 0, capacity: '' as string | number })

function openAddon(addonGroup: AdminAddonGroup, existing?: AdminAddon) {
  addonGroupId.value = addonGroup.id
  editingAddon.value = existing ?? null
  Object.assign(addon, {
    label: existing?.label,
    description: existing?.description ?? undefined,
    price: existing ? existing.price / 100 : 0,
    capacity: existing?.capacity ?? '',
  })
  addonDialog.value = true
}

const saveAddon = () => run(async () => {
  const body = {
    label: addon.label,
    description: addon.description ?? null,
    // Prices are stored in minor units (øre/cents).
    price: Math.round(Number(addon.price) * 100),
    capacity: addon.capacity === '' ? null : Number(addon.capacity),
  }
  if (editingAddon.value) {
    await $fetch(`/api/events/admin/addons/${editingAddon.value.id}`, { method: 'PATCH', body })
  }
  else {
    await $fetch(`/api/events/admin/addon-groups/${addonGroupId.value}/addons`, { method: 'POST', body })
  }
  addonDialog.value = false
  await refresh()
}, t('admin.addonSaved', 'Add-on saved.'))

const removeAddon = async (existing: AdminAddon) => {
  if (!await confirmAction({ title: t('admin.confirmRemoveAddon', 'Delete this choice?'), confirmText: t('admin.remove', 'Delete'), cancelText: t('admin.cancel', 'Cancel'), destructive: true })) return
  return run(async () => {
    await $fetch(`/api/events/admin/addons/${existing.id}`, { method: 'DELETE' })
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
          @click="openType()"
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
                @click="openType(row.original)"
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
            <div class="flex flex-col gap-3 p-2">
              <div
                v-for="addonGroup in row.original.addonGroups"
                :key="addonGroup.id"
                class="border-default overflow-hidden rounded-lg border bg-default"
              >
                <div class="border-default flex items-center justify-between gap-2 border-b px-3 py-2">
                  <div class="min-w-0 text-sm">
                    <span class="font-medium">{{ tr(addonGroup.title) }}</span>
                    <span class="text-muted ms-2 text-xs">
                      {{ addonGroup.required ? t('admin.groupRequired', 'required') : t('admin.groupOptional', 'optional') }}
                      · {{ addonGroup.multiple ? t('admin.groupMultiple', 'several choices') : t('admin.groupSingle', 'one choice') }}
                    </span>
                  </div>
                  <div class="flex shrink-0 gap-1">
                    <UButton
                      icon="i-lucide-plus"
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      :aria-label="t('admin.addAddon', 'Add choice')"
                      @click="openAddon(addonGroup)"
                    />
                    <UButton
                      icon="i-lucide-pencil"
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      :aria-label="t('admin.edit', 'Edit')"
                      @click="openGroup(row.original, addonGroup)"
                    />
                    <UButton
                      icon="i-lucide-trash"
                      color="error"
                      variant="ghost"
                      size="xs"
                      :aria-label="t('admin.remove', 'Delete')"
                      @click="removeGroup(addonGroup)"
                    />
                  </div>
                </div>
                <ul
                  v-if="addonGroup.addons.length"
                  class="divide-default divide-y"
                >
                  <li
                    v-for="item in addonGroup.addons"
                    :key="item.id"
                    class="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                  >
                    <div>
                      {{ tr(item.label) }}
                      <span class="text-muted">· {{ item.price === 0 ? t('admin.included', 'Included') : `+ ${formatPrice(item.price, row.original.currency, locale)}` }}<template v-if="item.capacity !== null"> · {{ t('admin.capacity', 'capacity') }} {{ item.capacity }}</template></span>
                    </div>
                    <div class="flex shrink-0 gap-1">
                      <UButton
                        icon="i-lucide-pencil"
                        color="neutral"
                        variant="ghost"
                        size="xs"
                        :aria-label="t('admin.edit', 'Edit')"
                        @click="openAddon(addonGroup, item)"
                      />
                      <UButton
                        icon="i-lucide-trash"
                        color="error"
                        variant="ghost"
                        size="xs"
                        :aria-label="t('admin.remove', 'Delete')"
                        @click="removeAddon(item)"
                      />
                    </div>
                  </li>
                </ul>
                <p
                  v-else
                  class="text-muted px-3 py-2 text-xs"
                >
                  {{ t('admin.noAddons', 'No choices yet: buyers will see nothing to pick.') }}
                </p>
              </div>
              <div>
                <UButton
                  icon="i-lucide-plus"
                  color="neutral"
                  variant="outline"
                  size="xs"
                  :label="t('admin.addGroup', 'Add add-on group')"
                  @click="openGroup(row.original)"
                />
              </div>
            </div>
          </template>
          <template #empty>
            <AdminEmpty
              icon="i-lucide-ticket"
              :title="t('admin.noTypes', 'No ticket types yet: nobody can buy a ticket.')"
            >
              <UButton
                icon="i-lucide-plus"
                :label="t('admin.addType', 'Add ticket type')"
                @click="openType()"
              />
            </AdminEmpty>
          </template>
        </UTable>
      </template>
    </AdminSection>

    <UModal
      v-model:open="typeDialog"
      :title="editingType ? t('admin.editType', 'Edit ticket type') : t('admin.addType', 'Add ticket type')"
    >
      <template #body>
        <form
          id="admin-ticket-type-form"
          class="flex flex-col gap-4"
          @submit.prevent="saveType"
        >
          <UFormField :label="t('admin.name', 'Name')">
            <TranslatedInput
              v-model="type.name"
              required
            />
          </UFormField>
          <UFormField :label="t('admin.description', 'Description')">
            <TranslatedInput
              v-model="type.description"
              multiline
              mdc
              :mdc-data="ticketMdcData({ ...type, price: Math.round(Number(type.price) * 100), currency: 'DKK' }, tr(type.name), locale)"
              :rows="2"
            />
          </UFormField>
          <UFormField
            v-if="!editingType"
            :label="t('admin.key', 'Key')"
            :description="t('admin.keyHelp', 'A short unique id, e.g. member.')"
          >
            <UInput
              v-model="type.key"
              class="w-full"
              required
            />
          </UFormField>
          <UFormField :label="t('admin.price', 'Price')">
            <UInput
              v-model="type.price"
              type="number"
              min="0"
              step="0.01"
              class="w-full"
            />
          </UFormField>
          <UFormField
            :label="t('admin.capacity', 'Capacity')"
            :description="t('admin.capacityHelp', 'Leave empty for unlimited.')"
          >
            <UInput
              v-model="type.capacity"
              type="number"
              min="0"
              class="w-full"
            />
          </UFormField>

          <template v-if="membershipEnabled">
            <UFormField
              :label="t('admin.requiresMembership', 'Only for members of')"
              :description="t('admin.requiresHelp', 'Visitors without a matching active membership cannot buy this ticket.')"
            >
              <USelect
                v-model="type.requires.mode"
                :items="modes"
                class="w-full"
              />
              <USelectMenu
                v-if="type.requires.mode === 'plans'"
                v-model="type.requires.plans"
                :items="plans"
                value-key="value"
                multiple
                class="mt-2 w-full"
              />
            </UFormField>
            <UFormField
              :label="t('admin.excludesMembership', 'Not for members of')"
              :description="t('admin.excludesHelp', 'Holders of these memberships cannot buy this ticket, so members and non-members can have separate prices.')"
            >
              <USelect
                v-model="type.excludes.mode"
                :items="modes"
                class="w-full"
              />
              <USelectMenu
                v-if="type.excludes.mode === 'plans'"
                v-model="type.excludes.plans"
                :items="plans"
                value-key="value"
                multiple
                class="mt-2 w-full"
              />
            </UFormField>
          </template>
        </form>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            variant="subtle"
            color="neutral"
            :label="t('admin.cancel', 'Cancel')"
            @click="typeDialog = false"
          />
          <UButton
            type="submit"
            form="admin-ticket-type-form"
            :loading="busy"
            :disabled="!tr(type.name)"
            :label="t('admin.save', 'Save')"
          />
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="groupDialog"
      :title="editingGroup ? t('admin.editGroup', 'Edit add-on group') : t('admin.addGroup', 'Add add-on group')"
    >
      <template #body>
        <form
          id="admin-addon-group-form"
          class="flex flex-col gap-4"
          @submit.prevent="saveGroup"
        >
          <UFormField
            :label="t('admin.groupTitle', 'Title')"
            :description="t('admin.groupTitleHelp', 'Shown above the choices, e.g. Food.')"
          >
            <TranslatedInput
              v-model="group.title"
              required
            />
          </UFormField>
          <UCheckbox
            v-model="group.required"
            :label="t('admin.groupRequiredLabel', 'Buyers must choose at least one')"
          />
          <UCheckbox
            v-model="group.multiple"
            :label="t('admin.groupMultipleLabel', 'Buyers can choose several')"
          />
        </form>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            variant="subtle"
            color="neutral"
            :label="t('admin.cancel', 'Cancel')"
            @click="groupDialog = false"
          />
          <UButton
            type="submit"
            form="admin-addon-group-form"
            :loading="busy"
            :disabled="!tr(group.title)"
            :label="t('admin.save', 'Save')"
          />
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="addonDialog"
      :title="editingAddon ? t('admin.editAddon', 'Edit choice') : t('admin.addAddon', 'Add choice')"
    >
      <template #body>
        <form
          id="admin-addon-form"
          class="flex flex-col gap-4"
          @submit.prevent="saveAddon"
        >
          <UFormField :label="t('admin.name', 'Name')">
            <TranslatedInput
              v-model="addon.label"
              required
            />
          </UFormField>
          <UFormField :label="t('admin.description', 'Description')">
            <TranslatedInput
              v-model="addon.description"
              multiline
              :rows="2"
            />
          </UFormField>
          <UFormField
            :label="t('admin.price', 'Price')"
            :description="t('admin.addonPriceHelp', 'Added to the ticket price. 0 means included.')"
          >
            <UInput
              v-model="addon.price"
              type="number"
              min="0"
              step="0.01"
              class="w-full"
            />
          </UFormField>
          <UFormField
            :label="t('admin.capacity', 'Capacity')"
            :description="t('admin.capacityHelp', 'Leave empty for unlimited.')"
          >
            <UInput
              v-model="addon.capacity"
              type="number"
              min="0"
              class="w-full"
            />
          </UFormField>
        </form>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            variant="subtle"
            color="neutral"
            :label="t('admin.cancel', 'Cancel')"
            @click="addonDialog = false"
          />
          <UButton
            type="submit"
            form="admin-addon-form"
            :loading="busy"
            :disabled="!tr(addon.label)"
            :label="t('admin.save', 'Save')"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
