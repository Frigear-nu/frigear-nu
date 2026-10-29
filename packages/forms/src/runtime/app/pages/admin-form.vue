<script setup lang="ts">
import type { FormAdminDto, FormDefinition, FormStatus } from '../../../types'
import { formDefinitionSchema, formsApi } from '../../utils'

const t = useModuleT('forms')
const route = useRoute()
const paths = useFormsPaths()
const actions = useFormActions()
const { busy: saving, run } = useAction()
const id = computed(() => String(route.params.id))
const { data: form, error, refresh } = await useFetch<FormAdminDto>(() => formsApi.admin.form(id.value), {
  key: `forms:admin:form:${id.value}`,
})
const notFound = computed(() => error.value?.statusCode === 404)
const forbidden = computed(() => [401, 403].includes(error.value?.statusCode ?? 0))

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

// The builder, settings, access and JSON tabs edit one unsaved draft, so they are state tabs, not routes.
const tabs = computed(() => [
  { value: 'builder', label: t('admin.builder', 'Builder'), icon: 'i-lucide-layout-list' },
  { value: 'settings', label: t('admin.settings', 'Delivery & storage'), icon: 'i-lucide-settings' },
  { value: 'access', label: t('admin.access', 'Access'), icon: 'i-lucide-lock' },
  { value: 'json', label: t('admin.json', 'JSON'), icon: 'i-lucide-braces' },
])

const previewKey = ref(0)
const statuses: FormStatus[] = ['draft', 'published', 'archived']

async function save() {
  if (!checked.value.definition) return
  await run(async () => {
    await $fetch(formsApi.admin.form(id.value), { method: 'PATCH', body: { ...draft, definition: checked.value.definition } })
    await refresh()
    previewKey.value++
  }, { success: t('admin.saved', 'Saved.') })
}

const listPath = paths('admin')
const menu = computed(() => form.value
  ? actions.menu({ ...form.value, storage: form.value.definition.storage }, { open: false, onRemoved: () => navigateTo(listPath) })
  : [])
</script>

<template>
  <div class="flex flex-col gap-4">
    <template v-if="form">
      <PageHeading
        :breadcrumb="[{ label: t('admin.title', 'Forms'), to: listPath }, { label: form.name }]"
        :title="form.name"
      >
        <template #title>
          {{ form.name }} <span class="text-muted text-base font-normal">v{{ form.version }}</span>
        </template>
        <template #badge>
          <StatusBadge
            :status="form.status"
            :label="t(`status.${form.status}`, form.status)"
            :colors="{ archived: 'warning' }"
          />
        </template>
        <template #actions>
          <UButton
            :loading="saving"
            :disabled="!checked.definition"
            :label="t('admin.save', 'Save form')"
            @click="save"
          />
          <RowMenu
            :items="menu"
            :subject="form.name"
            variant="outline"
          />
        </template>
      </PageHeading>

      <SectionCard :title="t('admin.details', 'Details')">
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
      </SectionCard>

      <PageTabs
        v-model="tab"
        :items="tabs"
      />

      <!-- The builder has its own chrome (canvas and settings panel), so it is not framed again. -->
      <FormBuilder
        v-if="tab === 'builder'"
        v-model="definition"
        :form-id="form.id"
      >
        <template #preview>
          <FormPreview
            :slug="draft.slug"
            :name="draft.name"
            :definition="checked.definition"
            :content-key="previewKey"
          />
        </template>
      </FormBuilder>

      <!-- Settings and access render their own `SectionCard`s, one per topic. -->
      <FormBuilderSettings
        v-else-if="tab === 'settings'"
        v-model="definition"
      />

      <FormBuilderAccess
        v-else-if="tab === 'access'"
        v-model="definition"
        :form-id="form.id"
        :slug="form.slug"
      />

      <SectionCard
        v-else-if="tab === 'json'"
        :title="t('admin.definition', 'Definition (JSON)')"
      >
        <UTextarea
          :model-value="json"
          :rows="30"
          class="w-full font-mono text-xs"
          @update:model-value="onJson(String($event))"
        />
      </SectionCard>

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

    <UEmpty
      v-else-if="notFound"
      icon="i-lucide-clipboard-x"
      :title="t('admin.notFound', 'This form does not exist.')"
    >
      <template #actions>
        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-arrow-left"
          :to="listPath"
          :label="t('admin.allForms', 'All forms')"
        />
      </template>
    </UEmpty>

    <UEmpty
      v-else-if="forbidden"
      icon="i-lucide-lock"
      :title="t('admin.forbidden', 'You are not allowed to manage forms.')"
    />

    <UEmpty
      v-else
      icon="i-lucide-circle-alert"
      :title="t('admin.formLoadFailed', 'The form could not be loaded')"
      :description="errorMessage(error, '')"
      :actions="[{ label: t('admin.tryAgain', 'Try again'), icon: 'i-lucide-rotate-ccw', color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
    />
  </div>
</template>
