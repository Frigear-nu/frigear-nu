<script setup lang="ts">
import type { Translated } from '../../../types'
import type { StaffEvent } from '../utils/admin-event'

defineOptions({ name: 'EventsAdminDetailsTab' })

// The built-in "Details" tab of the `admin.events` area: the texts shown on the public event page.
const props = defineProps<{ event: StaffEvent }>()
const emit = defineEmits<{ refresh: [] }>()

const t = useModuleT('events')
const tr = useEventsTranslate()
const { busy, run } = useAction()

// Texts are edited per language with `TranslatedInput`; an empty one is `undefined` and saved as `null`.
const form = reactive({
  name: undefined as Translated | undefined,
  description: undefined as Translated | undefined,
  body: undefined as Translated | undefined,
})
function fill(value: StaffEvent) {
  Object.assign(form, { name: value.name, description: value.description ?? undefined, body: value.body ?? undefined })
}
fill(props.event)
watch(() => props.event, fill)

const save = () => run(async () => {
  await $fetch(`/api/events/admin/events/${props.event.id}`, {
    method: 'PATCH',
    body: { name: form.name, description: form.description ?? null, body: form.body ?? null },
  })
  emit('refresh')
}, { success: t('admin.saved', 'Saved.') })
</script>

<template>
  <SectionCard :title="t('admin.details', 'Details')">
    <form
      id="admin-event-details"
      class="flex flex-col gap-4"
      @submit.prevent="save"
    >
      <UFormField :label="t('admin.name', 'Name')">
        <TranslatedInput
          v-model="form.name"
          required
        />
      </UFormField>
      <UFormField :label="t('admin.description', 'Description')">
        <TranslatedInput
          v-model="form.description"
          multiline
          mdc
        />
      </UFormField>
      <UFormField
        :label="t('admin.body', 'Details')"
        :description="t('admin.bodyHelp', 'Shown on the event page. Markdown is supported.')"
      >
        <TranslatedInput
          v-model="form.body"
          multiline
          mdc
          :rows="8"
        />
      </UFormField>
    </form>
    <template #footer>
      <div class="flex justify-end">
        <UButton
          type="submit"
          form="admin-event-details"
          :loading="busy"
          :disabled="!tr(form.name)"
          :label="t('admin.save', 'Save')"
        />
      </div>
    </template>
  </SectionCard>
</template>
