<script setup lang="ts">
import type { Translated } from '../../../types'

defineOptions({ name: 'EventsAdminPage' })

type AdminEvent = { id: string, slug: string, name: Translated, status: 'draft' | 'published' | 'archived', startsAt: string, location: Translated | null }

const t = useModuleT('events')
const toast = useToast()
const locale = useEventsLocale()
const tr = useEventsTranslate()
const pages = useRuntimeConfig().public.events?.pages
const { data: events, refresh } = await useFetch<AdminEvent[]>('/api/events/admin/events', { default: () => [] })

const eventTo = (id: string) => (pages?.adminEvent || '/admin/events/:id').replace(':id', encodeURIComponent(id))
const when = (value: string) => new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
const statusColor = { draft: 'neutral', published: 'success', archived: 'warning' } as const

const columns = [
  { accessorKey: 'name', header: t('admin.name', 'Name'), cell: ({ row }: { row: { original: AdminEvent } }) => tr(row.original.name) },
  { accessorKey: 'status', header: t('admin.status', 'Status') },
  { accessorKey: 'startsAt', header: t('admin.starts', 'Starts'), cell: ({ row }: { row: { original: AdminEvent } }) => when(row.original.startsAt) },
  { accessorKey: 'location', header: t('admin.location', 'Location'), cell: ({ row }: { row: { original: AdminEvent } }) => tr(row.original.location) },
  { id: 'actions', header: '' },
]

async function clone(id: string) {
  try {
    const copy = await $fetch<{ id: string }>(`/api/events/admin/events/${id}/clone`, { method: 'POST' })
    await navigateTo(eventTo(copy.id))
  }
  catch (cause) {
    toast.add({ title: (cause as { statusMessage?: string }).statusMessage ?? t('admin.error', 'Something went wrong.'), color: 'error' })
  }
}

const creating = ref(false)
const saving = ref(false)
const draft = reactive({ name: undefined as Translated | undefined, slug: '', startsAt: '', location: undefined as Translated | undefined })

const slugify = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
// The URL name follows the name (in the current locale) until it is edited by hand.
const draftName = computed(() => tr(draft.name))
watch(draftName, (name, previous) => {
  if (draft.slug === slugify(previous)) draft.slug = slugify(name)
})

async function create() {
  saving.value = true
  try {
    const created = await $fetch<{ id: string }>('/api/events/admin/events', {
      method: 'POST',
      body: { name: draft.name, slug: draft.slug, startsAt: draft.startsAt, location: draft.location || null, status: 'draft' },
    })
    await refresh()
    await navigateTo(eventTo(created.id))
  }
  catch (cause) {
    toast.add({ title: (cause as { statusMessage?: string }).statusMessage ?? t('admin.error', 'Something went wrong.'), color: 'error' })
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <AdminPageHeader :title="t('admin.title', 'Events')">
      <template #links>
        <UButton
          icon="i-lucide-plus"
          :label="t('admin.create', 'New event')"
          @click="creating = true"
        />
      </template>
    </AdminPageHeader>

    <UTable
      v-if="events.length"
      :data="events"
      :columns="columns"
      @select="(_: Event, row: { original: AdminEvent }) => navigateTo(eventTo(row.original.id))"
    >
      <template #status-cell="{ row }">
        <UBadge
          variant="subtle"
          :color="statusColor[row.original.status]"
          :label="row.original.status"
        />
      </template>
      <template #actions-cell="{ row }">
        <UButton
          color="neutral"
          variant="ghost"
          size="sm"
          icon="i-lucide-copy"
          :aria-label="t('admin.clone', 'Duplicate')"
          @click.stop="clone(row.original.id)"
        />
      </template>
    </UTable>
    <UEmpty
      v-else
      :title="t('admin.empty', 'No events yet')"
      :description="t('admin.emptyDescription', 'Create the first event to start selling tickets.')"
    />

    <UModal
      v-model:open="creating"
      :title="t('admin.create', 'New event')"
    >
      <template #body>
        <form
          class="flex flex-col gap-4"
          @submit.prevent="create"
        >
          <UFormField :label="t('admin.name', 'Name')">
            <TranslatedInput
              v-model="draft.name"
              required
            />
          </UFormField>
          <UFormField
            :label="t('admin.slug', 'URL name')"
            :help="t('admin.slugHelp', 'Lowercase letters, numbers and dashes.')"
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
          <div class="flex justify-end gap-2">
            <UButton
              variant="subtle"
              :label="t('admin.cancel', 'Cancel')"
              @click="creating = false"
            />
            <UButton
              type="submit"
              :loading="saving"
              :disabled="!draftName"
              :label="t('admin.createAction', 'Create draft')"
            />
          </div>
        </form>
      </template>
    </UModal>
  </div>
</template>
