<script setup lang="ts">
import type { FormSummaryDto } from '../../../types'
import { defineForm } from '../../utils'

const t = useModuleT('forms')
const paths = useFormsPaths()
const toast = useToast()
const link = useFormLink()
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

const statusColor = { draft: 'neutral', published: 'success', archived: 'warning' } as const
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between gap-2">
      <h1 class="text-3xl font-bold">
        {{ t('admin.title', 'Forms') }}
      </h1>
      <div class="flex gap-2">
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
      </div>
    </div>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      :title="t('admin.forbidden', 'You are not allowed to manage forms.')"
    />

    <UEmpty
      v-else-if="!forms?.length"
      icon="i-lucide-clipboard-list"
      :title="t('admin.empty', 'No forms yet.')"
    />

    <div
      v-else
      class="divide-y divide-default rounded-lg border border-default"
    >
      <div
        v-for="form in forms"
        :key="form.id"
        class="flex flex-wrap items-center justify-between gap-3 p-4"
      >
        <div class="space-y-1">
          <NuxtLink
            :to="paths('adminForm', { id: form.id })"
            class="font-medium hover:underline"
          >
            {{ form.name }}
          </NuxtLink>
          <p class="text-sm text-muted">
            /{{ form.slug }} · {{ form.mode === 'stepped' ? t('admin.stepped', 'Stepped') : t('admin.single', 'Single page') }}
            · v{{ form.version }}
            <template v-if="form.storage === 'none'">
              · {{ t('admin.notStored', 'Not stored') }}
            </template>
          </p>
        </div>
        <div class="flex items-center gap-3">
          <UBadge
            :color="statusColor[form.status]"
            variant="subtle"
            :label="t(`status.${form.status}`, form.status)"
          />
          <UButton
            v-if="form.storage === 'db' || form.submissionCount > 0"
            color="neutral"
            variant="outline"
            size="sm"
            :to="paths('adminSubmissions', { id: form.id })"
            :label="t('admin.submissions', 'Submissions ({count})', { count: form.submissionCount })"
          />
          <UButton
            v-if="form.status === 'published' && link.enabled.value"
            color="neutral"
            variant="ghost"
            size="sm"
            icon="i-lucide-link"
            :aria-label="t('admin.copyLink', 'Copy link')"
            @click="link.copy(form.slug)"
          />
          <UButton
            color="neutral"
            variant="ghost"
            size="sm"
            icon="i-lucide-pencil"
            :to="paths('adminForm', { id: form.id })"
            :aria-label="t('admin.edit', 'Edit')"
          />
        </div>
      </div>
    </div>

    <UModal
      v-model:open="creating"
      :title="t('admin.new', 'New form')"
    >
      <template #body>
        <form
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
          <UButton
            type="submit"
            :label="t('admin.create', 'Create')"
            :disabled="!draft.name || !draft.slug"
          />
        </form>
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
          <UButton
            :label="t('admin.import', 'Import')"
            :disabled="!importJson.trim()"
            @click="runImport"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
