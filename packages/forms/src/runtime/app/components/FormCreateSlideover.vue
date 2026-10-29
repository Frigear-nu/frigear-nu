<script setup lang="ts">
import { z } from 'zod'
import type { FormAdminDto } from '../../../types'
import { defineForm, formsApi } from '../../utils'

// Opened by `useFormActions().create()` through `useOverlay()`; closes with the created form, or `false` when cancelled.
const emit = defineEmits<{
  close: [value: FormAdminDto | false]
}>()

const t = useModuleT('forms')
const { busy, run } = useAction()

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

const state = reactive({ name: '', slug: '' })
const schema = z.object({
  name: z.string().trim().min(1, t('error.invalid', 'Please check the highlighted fields.')),
  slug: z.string().trim().min(1, t('error.invalid', 'Please check the highlighted fields.')),
})

// The slug follows the name until it is edited by hand.
const slugify = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
watch(() => state.name, (name, previous) => {
  if (state.slug === slugify(previous)) state.slug = slugify(name)
})

async function save() {
  const created = await run(
    () => $fetch<FormAdminDto>(formsApi.admin.forms, { method: 'POST', body: { ...state, definition: starter } }),
    { success: t('admin.created', 'Form created') },
  )
  if (created) emit('close', created)
}
</script>

<template>
  <FormSlideover
    form-id="forms-create"
    :title="t('admin.new', 'New form')"
    :submit-label="t('admin.createForm', 'Create form')"
    :loading="busy"
    @close="emit('close', false)"
  >
    <UForm
      id="forms-create"
      :state="state"
      :schema="schema"
      class="flex flex-col gap-4"
      @submit="save"
    >
      <UFormField
        name="name"
        :label="t('admin.name', 'Name')"
      >
        <UInput
          v-model="state.name"
          class="w-full"
          autofocus
        />
      </UFormField>
      <UFormField
        name="slug"
        :label="t('admin.slug', 'Slug')"
        :description="t('admin.slugHint', 'Used in the public address.')"
      >
        <UInput
          v-model="state.slug"
          class="w-full"
        />
      </UFormField>
    </UForm>
  </FormSlideover>
</template>
