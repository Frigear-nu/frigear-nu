<script setup lang="ts">
import type { FormAdminDto, FormStatus } from '../../../types'
import { formDefinitionSchema } from '../../utils'

const t = useModuleT('forms')
const route = useRoute()
const paths = useFormsPaths()
const toast = useToast()
const id = computed(() => String(route.params.id))
const { data: form, error, refresh } = await useFetch<FormAdminDto>(() => `/api/forms/admin/forms/${id.value}`)

const draft = reactive({ name: form.value?.name ?? '', slug: form.value?.slug ?? '', status: (form.value?.status ?? 'draft') as FormStatus })
const json = ref(form.value ? JSON.stringify(form.value.definition, null, 2) : '')

const checked = computed(() => {
  try {
    const result = formDefinitionSchema.safeParse(JSON.parse(json.value))
    return result.success
      ? { definition: result.data, issues: [] as string[] }
      : { definition: undefined, issues: result.error.issues.map(issue => `${issue.path.join('.') || '(root)'}: ${issue.message}`) }
  }
  catch {
    return { definition: undefined, issues: [t('admin.invalidJson', 'The JSON is not valid.')] }
  }
})

const previewKey = ref(0)
const saving = ref(false)
const statuses: FormStatus[] = ['draft', 'published', 'archived']

async function save() {
  if (!checked.value.definition) return
  saving.value = true
  try {
    await $fetch(`/api/forms/admin/forms/${id.value}`, { method: 'PATCH', body: { ...draft, definition: checked.value.definition } })
    await refresh()
    previewKey.value++
    toast.add({ title: t('admin.saved', 'Saved.'), color: 'success' })
  }
  catch (cause) {
    toast.add({ title: (cause as { statusMessage?: string }).statusMessage ?? t('error.generic', 'Something went wrong. Please try again.'), color: 'error' })
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <UContainer class="space-y-6 py-10">
    <UAlert
      v-if="error || !form"
      color="error"
      variant="subtle"
      :title="t('admin.forbidden', 'You are not allowed to manage forms.')"
    />

    <template v-else>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <NuxtLink
            :to="paths('admin')"
            class="text-sm text-muted hover:underline"
          >
            ← {{ t('admin.title', 'Forms') }}
          </NuxtLink>
          <h1 class="text-3xl font-bold">
            {{ form.name }} <span class="text-base font-normal text-muted">v{{ form.version }}</span>
          </h1>
        </div>
        <div class="flex gap-2">
          <UButton
            v-if="form.definition.storage === 'db'"
            color="neutral"
            variant="outline"
            :to="paths('adminSubmissions', { id: form.id })"
            :label="t('admin.submissionsTitle', 'Submissions')"
          />
          <UButton
            :loading="saving"
            :disabled="!checked.definition"
            :label="t('admin.save', 'Save')"
            @click="save"
          />
        </div>
      </div>

      <div class="grid gap-4 sm:grid-cols-3">
        <UFormField :label="t('admin.name', 'Name')">
          <UInput
            v-model="draft.name"
            class="w-full"
          />
        </UFormField>
        <UFormField :label="t('admin.slug', 'Slug')">
          <UInput
            v-model="draft.slug"
            class="w-full"
          />
        </UFormField>
        <UFormField :label="t('admin.status', 'Status')">
          <USelect
            v-model="draft.status"
            :items="statuses.map(value => ({ value, label: t(`status.${value}`, value) }))"
            class="w-full"
          />
        </UFormField>
      </div>

      <div class="grid gap-6 lg:grid-cols-2">
        <div class="space-y-3">
          <h2 class="font-semibold">
            {{ t('admin.definition', 'Definition (JSON)') }}
          </h2>
          <UTextarea
            v-model="json"
            :rows="30"
            class="w-full font-mono text-xs"
          />
          <UAlert
            v-if="checked.issues.length"
            color="error"
            variant="subtle"
            :title="t('admin.invalidDefinition', 'The definition has problems')"
          >
            <template #description>
              <ul class="list-disc pl-4">
                <li
                  v-for="issue in checked.issues"
                  :key="issue"
                >
                  {{ issue }}
                </li>
              </ul>
            </template>
          </UAlert>
        </div>

        <div class="space-y-3">
          <h2 class="font-semibold">
            {{ t('admin.preview', 'Preview') }}
          </h2>
          <div class="rounded-lg border border-default p-6">
            <FormRenderer
              v-if="checked.definition"
              :key="previewKey + json.length"
              :form="{ slug: draft.slug, definition: checked.definition }"
              preview
            />
            <p
              v-else
              class="text-muted"
            >
              {{ t('admin.previewUnavailable', 'Fix the definition to see a preview.') }}
            </p>
          </div>
        </div>
      </div>
    </template>
  </UContainer>
</template>
