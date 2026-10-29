<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { eventsApi } from '../../utils/api'
import { EVENT_STATUSES, type EventFormState, type StaffEvent, eventFormSchema, toLocalInput } from '../utils/admin-event'

defineOptions({ name: 'EventsAdminDetailsTab' })

// The built-in "Details" tab of the `admin.events` area: the event's one form (status, dates, place, URL name and
// the texts shown on the public event page), validated like the create slideover.
const props = defineProps<{ event: StaffEvent }>()
const emit = defineEmits<{ refresh: [] }>()

const t = useModuleT('events')
const tr = useEventsTranslate()
const { busy, run } = useAction()

const schema = eventFormSchema(t, tr)
const statuses = computed(() => EVENT_STATUSES.map(value => ({ value, label: t(`admin.statuses.${value}`, value.charAt(0).toUpperCase() + value.slice(1)) })))

// Texts are edited per language with `TranslatedInput`; an empty one is `undefined` and saved as `null`.
const state = reactive<EventFormState>({ name: undefined, slug: '', startsAt: '', endsAt: '', status: 'draft' })
function fill(value: StaffEvent) {
  Object.assign(state, {
    name: value.name,
    slug: value.slug,
    status: value.status,
    startsAt: toLocalInput(value.startsAt),
    endsAt: toLocalInput(value.endsAt),
    location: value.location ?? undefined,
    description: value.description ?? undefined,
    body: value.body ?? undefined,
  })
}
fill(props.event)
watch(() => props.event, fill)

async function save(event: FormSubmitEvent<EventFormState>) {
  const data = event.data
  const saved = await run(
    () => $fetch(eventsApi.admin.event(props.event.id), {
      method: 'PATCH',
      body: {
        name: data.name,
        slug: data.slug,
        status: data.status,
        startsAt: data.startsAt,
        endsAt: data.endsAt || null,
        location: data.location ?? null,
        description: data.description ?? null,
        body: data.body ?? null,
      },
    }).then(() => true),
    { success: t('admin.saved', 'Saved.') },
  )
  if (saved) emit('refresh')
}
</script>

<template>
  <SectionCard :title="t('admin.details', 'Details')">
    <UForm
      id="admin-event-details"
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
        name="status"
        :label="t('admin.status', 'Status')"
      >
        <USelect
          v-model="state.status"
          :items="statuses"
          class="w-full sm:max-w-sm"
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
        name="location"
        :label="t('admin.location', 'Location')"
      >
        <TranslatedInput
          v-model="state.location"
          class="sm:max-w-sm"
        />
      </FormRow>
      <FormRow
        name="description"
        :label="t('admin.description', 'Description')"
      >
        <TranslatedInput
          v-model="state.description"
          multiline
          mdc
        />
      </FormRow>
      <FormRow
        name="body"
        :label="t('admin.body', 'Details')"
        :description="t('admin.bodyHelp', 'Shown on the event page. Markdown is supported.')"
      >
        <TranslatedInput
          v-model="state.body"
          multiline
          mdc
          :rows="8"
        />
      </FormRow>
    </UForm>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton
          type="submit"
          form="admin-event-details"
          :loading="busy"
          :label="t('admin.saveEvent', 'Save event')"
        />
      </div>
    </template>
  </SectionCard>
</template>
