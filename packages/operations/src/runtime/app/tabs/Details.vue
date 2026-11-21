<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { operationsApi } from '../../utils/api'
import { type OperationFormState, type StaffOperation, formToOperationBody, operationFormSchema, operationToForm } from '../utils/admin-operation'
import { $fetch, reactive, useAction, useModuleT, useOperationsTranslate, useRuntimeConfig, watch } from '#imports'

defineOptions({ name: 'OperationsAdminDetailsTab' })

// The built-in "Details" tab of the `admin.operations` area: the operation's one form (dates, place, host, URL name,
// visibility and the texts shown on the public page), validated like the create slideover. The status is not here: it
// moves through the actions menu of the page.
const props = defineProps<{ operation: StaffOperation }>()
const emit = defineEmits<{ refresh: [] }>()

const t = useModuleT('operations')
const tr = useOperationsTranslate()
const { busy, run } = useAction()
const withEvents = !!useRuntimeConfig().public.operations?.events

const schema = operationFormSchema(t, tr)
const state = reactive<OperationFormState>(operationToForm(props.operation))
watch(() => props.operation, value => Object.assign(state, operationToForm(value)))

async function save(event: FormSubmitEvent<OperationFormState>) {
  const saved = await run(
    () => $fetch(operationsApi.admin.operation(props.operation.id), {
      method: 'PATCH',
      body: formToOperationBody(event.data, props.operation),
    }).then(() => true),
    { success: t('admin.saved', 'Saved {name}', { name: tr(event.data.name) }) },
  )
  if (saved) emit('refresh')
}
</script>

<template>
  <SectionCard :title="t('admin.details', 'Details')">
    <UForm
      id="admin-operation-details"
      :schema="schema"
      :state="state"
      class="flex flex-col divide-y divide-default"
      @submit="save"
    >
      <FormRow
        name="name"
        :label="t('admin.name', 'Name')"
        required
      >
        <TranslatedInput
          v-model="state.name"
          class="sm:max-w-sm"
        />
      </FormRow>
      <FormRow
        name="slug"
        :label="t('admin.slug', 'URL name')"
        :description="t('admin.slugHelp', 'Lowercase letters, numbers and dashes.')"
        required
      >
        <UInput
          v-model="state.slug"
          class="w-full sm:max-w-sm"
        />
      </FormRow>
      <FormRow
        name="startsAt"
        :label="t('admin.starts', 'Starts')"
        required
      >
        <UInput
          v-model="state.startsAt"
          type="datetime-local"
          class="w-full sm:max-w-sm"
        />
      </FormRow>
      <FormRow
        name="endsAt"
        :label="t('admin.ends', 'Ends')"
      >
        <UInput
          v-model="state.endsAt"
          type="datetime-local"
          class="w-full sm:max-w-sm"
        />
      </FormRow>
      <FormRow
        name="locationName"
        :label="t('admin.location', 'Location')"
      >
        <TranslatedInput
          v-model="state.locationName"
          class="sm:max-w-sm"
        />
      </FormRow>
      <FormRow
        name="locationAddress"
        :label="t('admin.address', 'Address')"
      >
        <UInput
          v-model="state.locationAddress"
          class="w-full sm:max-w-sm"
        />
      </FormRow>
      <FormRow
        name="locationMap"
        :label="t('admin.locationMap', 'On the map')"
        :description="t('admin.locationMapHelp', 'Tap the map to place the operation, and give it a radius or draw its area.')"
      >
        <MapLocationField
          v-model="state.locationMap"
          class="w-full"
        />
      </FormRow>
      <FormRow
        name="hostName"
        :label="t('admin.hostName', 'Host')"
        :description="t('admin.hostNameHelp', 'Who hosts it: your organisation, or the venue or event you work at.')"
      >
        <UInput
          v-model="state.hostName"
          class="w-full sm:max-w-sm"
        />
      </FormRow>
      <FormRow
        name="hostUrl"
        :label="t('admin.hostUrl', 'Host website')"
      >
        <UInput
          v-model="state.hostUrl"
          type="url"
          class="w-full sm:max-w-sm"
        />
      </FormRow>
      <FormRow
        v-if="withEvents"
        name="eventId"
        :label="t('admin.eventId', 'Event')"
        :description="t('admin.eventIdHelp', 'The id of the event this operation belongs to.')"
      >
        <UInput
          v-model="state.eventId"
          class="w-full sm:max-w-sm"
        />
      </FormRow>
      <FormRow
        name="public"
        :label="t('admin.public', 'Public')"
        :description="t('admin.publicHelp', 'A public operation has a public page and shows for everyone. Others show to the people who take part.')"
      >
        <USwitch v-model="state.public" />
      </FormRow>
      <FormRow
        name="description"
        :label="t('admin.description', 'Description')"
        :description="t('admin.descriptionHelp', 'Shown on the public page. Markdown is supported.')"
      >
        <TranslatedInput
          v-model="state.description"
          multiline
          mdc
          :rows="6"
        />
      </FormRow>
    </UForm>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton
          type="submit"
          form="admin-operation-details"
          :loading="busy"
          :label="t('admin.saveOperation', 'Save operation')"
        />
      </div>
    </template>
  </SectionCard>
</template>
