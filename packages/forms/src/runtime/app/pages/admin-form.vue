<script setup lang="ts">
import type { FormAdminDto, FormDefinition, FormStatus } from '../../../types'
import { formDefinitionSchema } from '../../utils'

const t = useModuleT('forms')
const route = useRoute()
const paths = useFormsPaths()
const toast = useToast()
const id = computed(() => String(route.params.id))
const { data: form, error, refresh } = await useFetch<FormAdminDto>(() => `/api/forms/admin/forms/${id.value}`)

const draft = reactive({ name: form.value?.name ?? '', slug: form.value?.slug ?? '', status: (form.value?.status ?? 'draft') as FormStatus })
// The builder and the JSON editor both work on `definition`; the JSON text is only (re)generated when
// its tab opens, so typing is never reformatted underneath the cursor.
const definition = ref<FormDefinition>(structuredClone(toRaw(form.value?.definition ?? { mode: 'single', storage: 'db', steps: [] })))
const tab = ref('builder')
const json = ref('')
const jsonError = ref<string>()

watch(tab, (next) => {
  if (next === 'json') {
    json.value = JSON.stringify(definition.value, null, 2)
    jsonError.value = undefined
  }
}, { immediate: true })

function onJson(text: string) {
  json.value = text
  try {
    const result = formDefinitionSchema.safeParse(JSON.parse(text))
    jsonError.value = undefined
    // Invalid-but-parseable JSON is still kept so the issues below name what is wrong.
    definition.value = (result.success ? result.data : JSON.parse(text)) as FormDefinition
  }
  catch {
    jsonError.value = t('admin.invalidJson', 'The JSON is not valid.')
  }
}

const checked = computed(() => {
  if (jsonError.value) return { definition: undefined, issues: [jsonError.value] }
  const result = formDefinitionSchema.safeParse(definition.value)
  return result.success
    ? { definition: result.data as FormDefinition, issues: [] as string[] }
    : { definition: undefined, issues: result.error.issues.map(issue => `${issue.path.join('.') || '(root)'}: ${issue.message}`) }
})

const tabs = computed(() => [
  { value: 'builder', label: t('admin.builder', 'Builder'), icon: 'i-lucide-layout-list' },
  { value: 'json', label: t('admin.json', 'JSON'), icon: 'i-lucide-braces' },
])

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
  <div class="space-y-6">
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

      <UTabs
        v-model="tab"
        :items="tabs"
        :content="false"
        class="w-full"
      />

      <FormBuilder
        v-if="tab === 'builder'"
        v-model="definition"
      >
        <template #preview>
          <FormRenderer
            v-if="checked.definition"
            :key="previewKey + JSON.stringify(checked.definition).length"
            :form="{ slug: draft.slug, definition: checked.definition }"
            preview
          />
          <p
            v-else
            class="text-muted"
          >
            {{ t('admin.previewUnavailable', 'Fix the definition to see a preview.') }}
          </p>
        </template>
      </FormBuilder>

      <div
        v-else-if="tab === 'json'"
        class="space-y-3"
      >
        <h2 class="font-semibold">
          {{ t('admin.definition', 'Definition (JSON)') }}
        </h2>
        <UTextarea
          :model-value="json"
          :rows="30"
          class="w-full font-mono text-xs"
          @update:model-value="onJson(String($event))"
        />
      </div>

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
    </template>
  </div>
</template>
