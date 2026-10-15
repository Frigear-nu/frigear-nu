<script setup lang="ts">
import type { Translated } from '../../../types'

defineOptions({ name: 'EventFormSlideover' })

// Create form of a new event (a draft), opened with `useOverlay()` by `useEventActions().create()`: it closes with the
// created event, or `false` when cancelled.
const emit = defineEmits<{ close: [created: { id: string, slug: string } | false] }>()

const t = useModuleT('events')
const tr = useEventsTranslate()
const { busy, run } = useAction()

const draft = reactive({ name: undefined as Translated | undefined, slug: '', startsAt: '', location: undefined as Translated | undefined })

const slugify = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
// The URL name follows the name (in the current locale) until it is edited by hand.
const draftName = computed(() => tr(draft.name))
watch(draftName, (name, previous) => {
  if (draft.slug === slugify(previous)) draft.slug = slugify(name)
})

async function save() {
  const created = await run(
    () => $fetch<{ id: string, slug: string }>('/api/events/admin/events', {
      method: 'POST',
      body: { name: draft.name, slug: draft.slug, startsAt: draft.startsAt, location: draft.location || null, status: 'draft' },
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
    :disabled="!draftName"
    @close="emit('close', false)"
  >
    <form
      id="event-form"
      class="flex flex-col gap-4"
      @submit.prevent="save"
    >
      <UFormField :label="t('admin.name', 'Name')">
        <TranslatedInput
          v-model="draft.name"
          required
        />
      </UFormField>
      <UFormField
        :label="t('admin.slug', 'URL name')"
        :description="t('admin.slugHelp', 'Lowercase letters, numbers and dashes.')"
      >
        <UInput
          v-model="draft.slug"
          class="w-full"
          required
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
        />
      </UFormField>
      <UFormField :label="t('admin.starts', 'Starts')">
        <UInput
          v-model="draft.startsAt"
          type="datetime-local"
          class="w-full"
          required
        />
      </UFormField>
      <UFormField :label="t('admin.location', 'Location')">
        <TranslatedInput v-model="draft.location" />
      </UFormField>
    </form>
  </FormSlideover>
</template>
