<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { type HelpChecklistFormState, type StaffHelpChecklist, checklistToForm, emptyHelpChecklistForm, formToChecklistBody, helpChecklistFormSchema } from '../utils/admin'
import { helpCenterApi } from '../../utils/api'
import { $fetch, reactive, useAction, useHelpCenterTranslate, useModuleT } from '#imports'

defineOptions({ name: 'HelpChecklistFormSlideover' })

// Create and edit form of a checklist's own settings, opened with `useOverlay()` by `useHelpChecklistActions()`. Its
// articles are edited on the checklist's page.
const props = defineProps<{ checklist?: StaffHelpChecklist }>()
const emit = defineEmits<{ close: [saved: StaffHelpChecklist | false] }>()

const t = useModuleT('helpCenter')
const tr = useHelpCenterTranslate()
const { busy, run } = useAction()

const schema = helpChecklistFormSchema(t, tr)
const state = reactive<HelpChecklistFormState>(props.checklist ? checklistToForm(props.checklist) : emptyHelpChecklistForm())

async function save(event: FormSubmitEvent<HelpChecklistFormState>) {
  const body = formToChecklistBody(event.data)
  const saved = await run(
    () => props.checklist
      ? $fetch<StaffHelpChecklist>(helpCenterApi.admin.checklist(props.checklist.id), { method: 'PATCH', body })
      : $fetch<StaffHelpChecklist>(helpCenterApi.admin.checklists, { method: 'POST', body }),
    { success: props.checklist
      ? t('admin.checklistSaved', 'Saved {name}', { name: tr(event.data.name) })
      : t('admin.checklistCreated', 'Created {name}', { name: tr(event.data.name) }) },
  )
  if (saved) emit('close', saved)
}
</script>

<template>
  <FormSlideover
    form-id="help-checklist-form"
    :title="checklist ? t('admin.editChecklistTitle', 'Edit checklist') : t('admin.createChecklist', 'Add checklist')"
    :description="checklist ? undefined : t('admin.createChecklistDescription', 'Create the checklist first, then pick the articles people have to read.')"
    :submit-label="checklist ? t('admin.saveChecklist', 'Save checklist') : t('admin.createChecklistAction', 'Create checklist')"
    :loading="busy"
    @close="emit('close', false)"
  >
    <UForm
      id="help-checklist-form"
      :schema="schema"
      :state="state"
      class="flex flex-col gap-4"
      @submit="save"
    >
      <UFormField
        name="name"
        :label="t('admin.checklistName', 'Name')"
        required
      >
        <TranslatedInput v-model="state.name" />
      </UFormField>
      <UFormField
        name="operationId"
        :label="t('admin.operation', 'Operation')"
        :description="t('admin.operationHelp', 'Leave empty for everyone. With an operation id, only people who take part in it see the checklist.')"
      >
        <UInput
          v-model="state.operationId"
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="visibility"
        :label="t('admin.visibilityLabel', 'Who can see it')"
      >
        <HelpCenterVisibilityEditor v-model="state.visibility" />
      </UFormField>
    </UForm>
  </FormSlideover>
</template>
