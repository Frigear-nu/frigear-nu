<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { type EventFormState, eventFormSchema } from '../utils/admin-event'
import { eventsApi } from '../../utils/api'
import { $fetch, computed, reactive, useAction, useEventsTranslate, useModuleT, watch } from '#imports'

defineOptions({ name: 'EventFormSlideover' })

// Create form of a new event (a draft), opened with `useOverlay()` by `useEventActions().create()`: it closes with the
// created event, or `false` when cancelled. Validates with the same schema as the event's "Details" tab.
const emit = defineEmits<{ close: [created: { id: string, slug: string } | false] }>()

const t = useModuleT('events')
const tr = useEventsTranslate()
const { busy, run } = useAction()

const schema = eventFormSchema(t, tr)
const state = reactive<EventFormState>({ name: undefined, slug: '', startsAt: '', endsAt: '', status: 'draft', location: undefined })

const slugify = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
// The URL name follows the name (in the current locale) until it is edited by hand.
const draftName = computed(() => tr(state.name))
watch(draftName, (name, previous) => {
  if (state.slug === slugify(previous)) state.slug = slugify(name)
})

async function save(event: FormSubmitEvent<EventFormState>) {
  const { name, slug, startsAt, endsAt, location } = event.data
  const created = await run(
    () => $fetch<{ id: string, slug: string }>(eventsApi.admin.events, {
      method: 'POST',
      body: { name, slug, startsAt, endsAt: endsAt || null, location: location || null, status: 'draft' },
    }),
    { success: t('admin.created', 'Event created') },
  )
  if (created) emit('close', created)
}
</script>

<template>
  <FormSlideover
    form-id="event-form"
    :title="t('admin.create', 'New event')"
    :description="t('admin.createDescription', 'It is saved as a draft until you publish it.')"
    :submit-label="t('admin.createAction', 'Create draft')"
    :loading="busy"
    @close="emit('close', false)"
  >
    <UForm
      id="event-form"
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
        name="location"
        :label="t('admin.location', 'Location')"
      >
        <TranslatedInput v-model="state.location" />
      </UFormField>
    </UForm>
  </FormSlideover>
</template>
