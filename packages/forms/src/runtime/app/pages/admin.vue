<script setup lang="ts">
import type { FormSummaryDto } from '../../../types'
import { defineForm } from '../../utils'

const t = useModuleT('forms')
const paths = useFormsPaths()
const toast = useToast()
const { data: forms, error, refresh } = await useFetch<FormSummaryDto[]>('/api/forms/admin/forms')

const starter = defineForm({
  mode: 'single',
  storage: 'db',
  steps: [{
    id: 'main',
    fields: [
      { key: 'name', type: 'text', label: 'Name', required: true },
      { key: 'message', type: 'textarea', label: 'Message', required: true },
    ],
  }],
})

const creating = ref(false)
const draft = reactive({ name: '', slug: '' })
const importing = ref(false)
const importJson = ref('')

const slugify = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
watch(() => draft.name, (name, previous) => {
  if (draft.slug === slugify(previous)) draft.slug = slugify(name)
})

async function create() {
  try {
    const created = await $fetch<{ id: string }>('/api/forms/admin/forms', { method: 'POST', body: { ...draft, definition: starter } })
    await navigateTo(paths('adminForm', { id: created.id }))
  }
  catch (cause) {
    toast.add({ title: (cause as { statusMessage?: string }).statusMessage ?? t('error.generic', 'Something went wrong. Please try again.'), color: 'error' })
  }
}

async function runImport() {
  try {
    const parsed = JSON.parse(importJson.value)
    const result = await $fetch<{ inserted: string[], skipped: string[] }>('/api/forms/admin/import', {
      method: 'POST',
      body: { forms: Array.isArray(parsed) ? parsed : [parsed] },
    })
    toast.add({ title: t('admin.imported', 'Imported {inserted}, skipped {skipped} existing.', { inserted: result.inserted.length, skipped: result.skipped.length }), color: 'success' })
    importing.value = false
    importJson.value = ''
    await refresh()
  }
  catch (cause) {
    toast.add({ title: (cause as { statusMessage?: string }).statusMessage ?? t('admin.invalidJson', 'The JSON is not valid.'), color: 'error' })
  }
}

type Row = { original: FormSummaryDto }
const columns = [
  { accessorKey: 'name', header: t('admin.name', 'Name') },
  { accessorKey: 'status', header: t('admin.status', 'Status') },
  { id: 'actions', header: '' },
]

const statusColor = { draft: 'neutral', published: 'success', archived: 'warning' } as const
</script>

<template>
  <AdminPage>
    <AdminPageHeader :title="t('admin.title', 'Forms')">
      <template #actions>
        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-upload"
          :label="t('admin.import', 'Import')"
          @click="importing = true"
        />
        <UButton
          icon="i-lucide-plus"
          :label="t('admin.new', 'New form')"
          @click="creating = true"
        />
      </template>
    </AdminPageHeader>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      :title="t('admin.forbidden', 'You are not allowed to manage forms.')"
    />

    <AdminTable
      v-else
      :data="forms ?? []"
      :columns="columns"
      @select="(_: Event, row: Row) => navigateTo(paths('adminForm', { id: row.original.id }))"
    >
      <template #name-cell="{ row }">
        <div class="space-y-0.5">
          <p class="font-medium">
            {{ row.original.name }}
          </p>
          <p class="text-sm text-muted">
            /{{ row.original.slug }} · {{ row.original.mode === 'stepped' ? t('admin.stepped', 'Stepped') : t('admin.single', 'Single page') }}
            · v{{ row.original.version }}
            <template v-if="row.original.storage === 'none'">
              · {{ t('admin.notStored', 'Not stored') }}
            </template>
          </p>
        </div>
      </template>
      <template #status-cell="{ row }">
        <UBadge
          :color="statusColor[row.original.status]"
          variant="subtle"
          :label="t(`status.${row.original.status}`, row.original.status)"
        />
      </template>
      <template #actions-cell="{ row }">
        <div class="flex items-center justify-end gap-2">
          <UButton
            v-if="row.original.storage === 'db'"
            color="neutral"
            variant="outline"
            size="sm"
            :to="paths('adminSubmissions', { id: row.original.id })"
            :label="t('admin.submissions', 'Submissions ({count})', { count: row.original.submissionCount })"
            @click.stop
          />
          <UButton
            color="neutral"
            variant="ghost"
            size="sm"
            icon="i-lucide-pencil"
            :to="paths('adminForm', { id: row.original.id })"
            :aria-label="t('admin.edit', 'Edit')"
            @click.stop
          />
        </div>
      </template>
      <template #empty>
        <AdminEmpty
          icon="i-lucide-clipboard-list"
          :title="t('admin.empty', 'No forms yet.')"
        />
      </template>
    </AdminTable>

    <UModal
      v-model:open="creating"
      :title="t('admin.new', 'New form')"
    >
      <template #body>
        <form
          id="admin-form-create"
          class="space-y-4"
          @submit.prevent="create"
        >
          <UFormField :label="t('admin.name', 'Name')">
            <UInput
              v-model="draft.name"
              class="w-full"
              autofocus
            />
          </UFormField>
          <UFormField
            :label="t('admin.slug', 'Slug')"
            :description="t('admin.slugHint', 'Used in the public address.')"
          >
            <UInput
              v-model="draft.slug"
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
            @click="creating = false"
          />
          <UButton
            type="submit"
            form="admin-form-create"
            :label="t('admin.create', 'Create')"
            :disabled="!draft.name || !draft.slug"
          />
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="importing"
      :title="t('admin.import', 'Import')"
    >
      <template #body>
        <div class="space-y-4">
          <p class="text-sm text-muted">
            {{ t('admin.importHint', 'Paste one form or a list of forms (each with slug, name and definition). Forms whose slug already exists are skipped.') }}
          </p>
          <UTextarea
            v-model="importJson"
            :rows="12"
            class="w-full font-mono text-xs"
          />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            variant="subtle"
            color="neutral"
            :label="t('admin.cancel', 'Cancel')"
            @click="importing = false"
          />
          <UButton
            :label="t('admin.import', 'Import')"
            :disabled="!importJson.trim()"
            @click="runImport"
          />
        </div>
      </template>
    </UModal>
  </AdminPage>
</template>
