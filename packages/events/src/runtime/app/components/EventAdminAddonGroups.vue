<script setup lang="ts">
import { formatMoney as formatPrice } from '@frigear-nu/ui/money'
import { type AdminAddon, type AdminAddonGroup, type AdminTicketType, useAdminAction } from '../utils/admin-event'

defineOptions({ name: 'EventAdminAddonGroups' })

// The add-on groups of one ticket type (shown in the expanded row of the ticket types table), with their choices.
// Create/edit dialogs are owned by the parent; this component only asks for them and handles deletes.
defineProps<{ ticketType: AdminTicketType }>()
const emit = defineEmits<{
  refresh: []
  addGroup: []
  editGroup: [group: AdminAddonGroup]
  addAddon: [group: AdminAddonGroup]
  editAddon: [group: AdminAddonGroup, addon: AdminAddon]
}>()

const t = useModuleT('events')
const locale = useEventsLocale()
const tr = useEventsTranslate()
const confirmAction = useConfirmDialog()
const { run } = useAdminAction()

const removeGroup = async (addonGroup: AdminAddonGroup) => {
  if (!await confirmAction({ title: t('admin.confirmRemoveGroup', 'Delete this add-on group and its choices?'), confirmText: t('admin.remove', 'Delete'), cancelText: t('admin.cancel', 'Cancel'), destructive: true })) return
  return run(async () => {
    await $fetch(`/api/events/admin/addon-groups/${addonGroup.id}`, { method: 'DELETE' })
    emit('refresh')
  })
}

const removeAddon = async (existing: AdminAddon) => {
  if (!await confirmAction({ title: t('admin.confirmRemoveAddon', 'Delete this choice?'), confirmText: t('admin.remove', 'Delete'), cancelText: t('admin.cancel', 'Cancel'), destructive: true })) return
  return run(async () => {
    await $fetch(`/api/events/admin/addons/${existing.id}`, { method: 'DELETE' })
    emit('refresh')
  })
}
</script>

<template>
  <div class="flex flex-col gap-3 p-2">
    <div
      v-for="addonGroup in ticketType.addonGroups"
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
            @click="emit('addAddon', addonGroup)"
          />
          <UButton
            icon="i-lucide-pencil"
            color="neutral"
            variant="ghost"
            size="xs"
            :aria-label="t('admin.edit', 'Edit')"
            @click="emit('editGroup', addonGroup)"
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
            <span class="text-muted">· {{ item.price === 0 ? t('admin.included', 'Included') : `+ ${formatPrice(item.price, ticketType.currency, locale)}` }}<template v-if="item.capacity !== null"> · {{ t('admin.capacity', 'capacity') }} {{ item.capacity }}</template></span>
          </div>
          <div class="flex shrink-0 gap-1">
            <UButton
              icon="i-lucide-pencil"
              color="neutral"
              variant="ghost"
              size="xs"
              :aria-label="t('admin.edit', 'Edit')"
              @click="emit('editAddon', addonGroup, item)"
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
        @click="emit('addGroup')"
      />
    </div>
  </div>
</template>
