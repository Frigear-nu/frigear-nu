<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { type OperationFormState, type StaffOperation, emptyOperationForm, formToOperationBody, operationFormSchema, operationToForm, slugify } from '../utils/admin-operation'
import { operationsApi } from '../../utils/api'
import { $fetch, computed, reactive, useAction, useModuleT, useOperationsTranslate, useRuntimeConfig, watch } from '#imports'

defineOptions({ name: 'OperationFormSlideover' })

// Create and edit form of an operation, opened with `useOverlay()` by `useOperationActions()`: it closes with the saved
// operation, or `false` when cancelled. A new operation is saved in `planning`; its status moves through the status
// actions. Validates with the same schema as the operation's "Details" tab.
const props = defineProps<{ operation?: StaffOperation }>()
const emit = defineEmits<{ close: [saved: StaffOperation | false] }>()

const t = useModuleT('operations')
const tr = useOperationsTranslate()
const { busy, run } = useAction()
const withEvents = !!useRuntimeConfig().public.operations?.events

const schema = operationFormSchema(t, tr)
const state = reactive<OperationFormState>(props.operation ? operationToForm(props.operation) : emptyOperationForm())

// For a new operation the URL name follows the name (in the current locale) until it is edited by hand.
const draftName = computed(() => tr(state.name))
watch(draftName, (name, previous) => {
  if (!props.operation && state.slug === slugify(previous)) state.slug = slugify(name)
})

async function save(event: FormSubmitEvent<OperationFormState>) {
  const body = formToOperationBody(event.data, props.operation)
  const saved = await run(
    () => props.operation
      ? $fetch<StaffOperation>(operationsApi.admin.operation(props.operation.id), { method: 'PATCH', body })
      : $fetch<StaffOperation>(operationsApi.admin.operations, { method: 'POST', body }),
    { success: props.operation
      ? t('admin.saved', 'Saved {name}', { name: tr(event.data.name) })
      : t('admin.created', 'Created {name}', { name: tr(event.data.name) }) },
  )
  if (saved) emit('close', saved)
}
</script>

<template>
  <FormSlideover
    form-id="operation-form"
    :title="operation ? t('admin.editTitle', 'Edit operation') : t('admin.create', 'Add operation')"
    :description="operation ? undefined : t('admin.createDescription', 'It starts in planning. Move it along when the plans are final.')"
    :submit-label="operation ? t('admin.saveOperation', 'Save operation') : t('admin.createAction', 'Create operation')"
    :loading="busy"
    @close="emit('close', false)"
  >
    <UForm
      id="operation-form"
      :schema="schema"
      :state="state"
      class="flex flex-col gap-4"
      @submit="save"
    >
      <UFormField
        name="name"
        :label="t('admin.name', 'Name')"
        required
      >
        <TranslatedInput v-model="state.name" />
      </UFormField>
      <UFormField
        name="slug"
        :label="t('admin.slug', 'URL name')"
        :description="t('admin.slugHelp', 'Lowercase letters, numbers and dashes.')"
        required
      >
        <UInput
          v-model="state.slug"
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="startsAt"
        :label="t('admin.starts', 'Starts')"
        required
      >
        <UInput
          v-model="state.startsAt"
          type="datetime-local"
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="endsAt"
        :label="t('admin.ends', 'Ends')"
      >
        <UInput
          v-model="state.endsAt"
          type="datetime-local"
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="locationName"
        :label="t('admin.location', 'Location')"
      >
        <TranslatedInput v-model="state.locationName" />
      </UFormField>
      <UFormField
        name="hostName"
        :label="t('admin.hostName', 'Host')"
        :description="t('admin.hostNameHelp', 'Who hosts it: your organisation, or the venue or event you work at.')"
      >
        <UInput
          v-model="state.hostName"
          class="w-full"
        />
      </UFormField>
      <UFormField
        v-if="withEvents"
        name="eventId"
        :label="t('admin.eventId', 'Event')"
        :description="t('admin.eventIdHelp', 'The id of the event this operation belongs to.')"
      >
        <UInput
          v-model="state.eventId"
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="public"
        :label="t('admin.public', 'Public')"
        :description="t('admin.publicHelp', 'A public operation has a public page and shows for everyone. Others show to the people who take part.')"
      >
        <USwitch v-model="state.public" />
      </UFormField>
    </UForm>
  </FormSlideover>
</template>
