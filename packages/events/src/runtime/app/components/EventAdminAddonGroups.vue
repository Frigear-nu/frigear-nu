<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { StaffAddon, StaffAddonGroup, StaffTicketType } from '../utils/admin-event'

defineOptions({ name: 'EventAdminAddonGroups' })

// The add-on groups of one ticket type (shown in the expanded row of the ticket types table), with their choices.
// Create/edit dialogs are owned by the parent; this component only asks for them and handles deletes.
defineProps<{ ticketType: StaffTicketType }>()
const emit = defineEmits<{
  refresh: []
  addGroup: []
  editGroup: [group: StaffAddonGroup]
  addAddon: [group: StaffAddonGroup]
  editAddon: [group: StaffAddonGroup, addon: StaffAddon]
}>()

const t = useModuleT('events')
const format = useFormat()
const tr = useEventsTranslate()
const confirmAction = useConfirmDialog()
const { run } = useAction()

const removeGroup = async (addonGroup: StaffAddonGroup) => {
  const title = tr(addonGroup.title)
  if (!await confirmAction({
    title: t('admin.confirmRemoveGroup', 'Delete {name}?', { name: title }),
    description: t('admin.confirmRemoveGroupDescription', 'Its choices are deleted too. Tickets already bought keep the choices they made.'),
    confirmText: t('admin.removeGroup', 'Delete add-on group'),
    destructive: true,
  })) return
  return run(async () => {
    await $fetch(`/api/events/admin/addon-groups/${addonGroup.id}`, { method: 'DELETE' })
    emit('refresh')
  }, { success: t('admin.groupDeleted', 'Deleted {name}', { name: title }) })
}

const removeAddon = async (existing: StaffAddon) => {
  const label = tr(existing.label)
  if (!await confirmAction({
    title: t('admin.confirmRemoveAddon', 'Delete {name}?', { name: label }),
    description: t('admin.confirmRemoveAddonDescription', 'Tickets already bought keep the choice they made.'),
    confirmText: t('admin.removeAddon', 'Delete choice'),
    destructive: true,
  })) return
  return run(async () => {
    await $fetch(`/api/events/admin/addons/${existing.id}`, { method: 'DELETE' })
    emit('refresh')
  }, { success: t('admin.addonDeleted', 'Deleted {name}', { name: label }) })
}

const groupMenu = (addonGroup: StaffAddonGroup): DropdownMenuItem[][] => [
  [
    { label: t('admin.addAddon', 'Add choice'), icon: 'i-lucide-plus', onSelect: () => emit('addAddon', addonGroup) },
    { label: t('admin.editGroup', 'Edit add-on group'), icon: 'i-lucide-pencil', onSelect: () => emit('editGroup', addonGroup) },
  ],
  [{ label: t('admin.removeGroup', 'Delete add-on group'), icon: 'i-lucide-trash-2', color: 'error', onSelect: () => { void removeGroup(addonGroup) } }],
]

const addonMenu = (addonGroup: StaffAddonGroup, item: StaffAddon): DropdownMenuItem[][] => [
  [{ label: t('admin.editAddon', 'Edit choice'), icon: 'i-lucide-pencil', onSelect: () => emit('editAddon', addonGroup, item) }],
  [{ label: t('admin.removeAddon', 'Delete choice'), icon: 'i-lucide-trash-2', color: 'error', onSelect: () => { void removeAddon(item) } }],
]
</script>

<template>
  <div class="flex flex-col gap-3 p-2">
    <div
      v-for="addonGroup in ticketType.addonGroups"
      :key="addonGroup.id"
      class="border-default bg-default overflow-hidden rounded-lg border"
    >
      <div class="border-default flex items-center justify-between gap-2 border-b px-3 py-2">
        <div class="min-w-0 text-sm">
          <span class="text-highlighted font-medium">{{ tr(addonGroup.title) }}</span>
          <span class="text-muted ms-2 text-xs">
            {{ addonGroup.required ? t('admin.groupRequired', 'required') : t('admin.groupOptional', 'optional') }}
            · {{ addonGroup.multiple ? t('admin.groupMultiple', 'several choices') : t('admin.groupSingle', 'one choice') }}
          </span>
        </div>
        <RowMenu
          :items="groupMenu(addonGroup)"
          :subject="tr(addonGroup.title)"
          size="xs"
        />
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
            <span class="text-muted">· {{ item.price === 0 ? t('admin.included', 'Included') : `+ ${format.money(item.price, ticketType.currency)}` }}<template v-if="item.capacity !== null"> · {{ t('admin.capacity', 'Capacity').toLowerCase() }} {{ item.capacity }}</template></span>
          </div>
          <RowMenu
            :items="addonMenu(addonGroup, item)"
            :subject="tr(item.label)"
            size="xs"
          />
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
        @click="emit('addGroup')"
      />
    </div>
  </div>
</template>
