<script setup lang="ts">
import type { Translated } from '../../../types'
import { fromCents, toCents } from '@frigear-nu/ui/money'
import { DEFAULT_CURRENCY } from '../../utils'
import { type AdminAddon, type AdminAddonGroup, useAdminAction } from '../utils/admin-event'

defineOptions({ name: 'EventAdminAddonDialog' })

// Create/edit dialog for an add-on choice (e.g. "Vegan"). Open it with `open(group, currency)` (new) or
// `open(group, currency, addon)` (edit).
const emit = defineEmits<{ refresh: [] }>()

const t = useModuleT('events')
const tr = useEventsTranslate()
const { busy, run } = useAdminAction()

const dialog = ref(false)
const groupId = ref('')
const editingAddon = ref<AdminAddon | null>(null)
const addon = reactive({ label: undefined as Translated | undefined, description: undefined as Translated | undefined, price: 0, capacity: '' as string | number })

// Add-ons are priced in the currency of the ticket type they belong to.
const addonCurrency = ref(DEFAULT_CURRENCY)

function open(addonGroup: AdminAddonGroup, currency: string, existing?: AdminAddon) {
  groupId.value = addonGroup.id
  addonCurrency.value = currency
  editingAddon.value = existing ?? null
  Object.assign(addon, {
    label: existing?.label,
    description: existing?.description ?? undefined,
    price: existing ? fromCents(existing.price, currency) : 0,
    capacity: existing?.capacity ?? '',
  })
  dialog.value = true
}

defineExpose({ open })

const save = () => run(async () => {
  const body = {
    label: addon.label,
    description: addon.description ?? null,
    // Prices are stored in minor units (øre/cents).
    price: toCents(Number(addon.price), addonCurrency.value),
    capacity: addon.capacity === '' ? null : Number(addon.capacity),
  }
  if (editingAddon.value) {
    await $fetch(`/api/events/admin/addons/${editingAddon.value.id}`, { method: 'PATCH', body })
  }
  else {
    await $fetch(`/api/events/admin/addon-groups/${groupId.value}/addons`, { method: 'POST', body })
  }
  dialog.value = false
  emit('refresh')
}, t('admin.addonSaved', 'Add-on saved.'))
</script>

<template>
  <UModal
    v-model:open="dialog"
    :title="editingAddon ? t('admin.editAddon', 'Edit choice') : t('admin.addAddon', 'Add choice')"
  >
    <template #body>
      <form
        id="admin-addon-form"
        class="flex flex-col gap-4"
        @submit.prevent="save"
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
          @click="dialog = false"
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
</template>
