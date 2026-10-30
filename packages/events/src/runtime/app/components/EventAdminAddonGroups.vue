<script setup lang="ts">
import type { StaffTicketType } from '../utils/admin-event'
import { useEventCatalogActions, useEventsTranslate, useFormat, useModuleT } from '#imports'

defineOptions({ name: 'EventAdminAddonGroups' })

// The add-on groups of one ticket type (shown in the expanded row of the ticket types table), with their choices.
// Forms, deletes and menus come from `useEventCatalogActions`; `refresh` is emitted after every change.
defineProps<{ ticketType: StaffTicketType }>()
const emit = defineEmits<{ refresh: [] }>()

const t = useModuleT('events')
const format = useFormat()
const tr = useEventsTranslate()
const catalog = useEventCatalogActions({ onChanged: () => emit('refresh') })
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
          :items="catalog.groupMenu(ticketType, addonGroup)"
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
            <span class="text-muted">· {{ item.price === 0 ? t('admin.included', 'Included') : `+ ${format.money(item.price, ticketType.currency)}` }}<template v-if="item.capacity !== null"> · {{ t('admin.capacity', 'Capacity').toLowerCase() }} <span class="tabular-nums">{{ item.capacity }}</span></template></span>
          </div>
          <RowMenu
            :items="catalog.addonMenu(ticketType, addonGroup, item)"
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
        @click="catalog.openGroup(ticketType)"
      />
    </div>
  </div>
</template>
