<script setup lang="ts">
import type { Translated } from '../../../types'
import { type AdminAddonGroup, type AdminTicketType, useAdminAction } from '../utils/admin-event'

defineOptions({ name: 'EventAdminAddonGroupDialog' })

// Create/edit dialog for an add-on group (e.g. "Food"). Groups belong to a ticket type; buyers choose from them
// when buying that ticket. Open it with `open(ticketType)` (new) or `open(ticketType, group)` (edit).
const emit = defineEmits<{ refresh: [] }>()

const t = useModuleT('events')
const tr = useEventsTranslate()
const { busy, run } = useAdminAction()

const dialog = ref(false)
const ticketTypeId = ref('')
const editingGroup = ref<AdminAddonGroup | null>(null)
const group = reactive({ title: undefined as Translated | undefined, required: false, multiple: false })

function open(ticketType: AdminTicketType, existing?: AdminAddonGroup) {
  ticketTypeId.value = ticketType.id
  editingGroup.value = existing ?? null
  Object.assign(group, { title: existing?.title, required: existing?.required ?? false, multiple: existing?.multiple ?? false })
  dialog.value = true
}

defineExpose({ open })

const save = () => run(async () => {
  const body = { title: group.title, required: group.required, multiple: group.multiple }
  if (editingGroup.value) {
    await $fetch(`/api/events/admin/addon-groups/${editingGroup.value.id}`, { method: 'PATCH', body })
  }
  else {
    await $fetch(`/api/events/admin/ticket-types/${ticketTypeId.value}/addon-groups`, { method: 'POST', body })
  }
  dialog.value = false
  emit('refresh')
}, t('admin.groupSaved', 'Add-on group saved.'))
</script>

<template>
  <UModal
    v-model:open="dialog"
    :title="editingGroup ? t('admin.editGroup', 'Edit add-on group') : t('admin.addGroup', 'Add add-on group')"
  >
    <template #body>
      <form
        id="admin-addon-group-form"
        class="flex flex-col gap-4"
        @submit.prevent="save"
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
          @click="dialog = false"
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
</template>
