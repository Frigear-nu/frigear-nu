<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { type FaqGroupFormState, type StaffFaqGroup, OWNER_TYPE_OPTIONS, emptyFaqGroupForm, faqGroupFormSchema, formToGroupBody, groupToForm, slugify } from '../utils/admin-faq'
import { faqApi } from '../../utils/api'
import { $fetch, computed, reactive, useAction, useFaqTranslate, useModuleT, watch } from '#imports'

defineOptions({ name: 'FaqGroupFormSlideover' })

// Create and edit form of a group, opened with `useOverlay()` by `useFaqGroupActions()`: it closes with the saved group, or
// `false` when cancelled. Validates with the same schema as the settings section of the group page.
const props = defineProps<{ group?: StaffFaqGroup }>()
const emit = defineEmits<{ close: [saved: StaffFaqGroup | false] }>()

const t = useModuleT('faq')
const tr = useFaqTranslate()
const { busy, run } = useAction()

const schema = faqGroupFormSchema(t, tr)
const state = reactive<FaqGroupFormState>(props.group ? groupToForm(props.group) : emptyFaqGroupForm())

// For a new group the URL name follows the title (in the current locale) until it is edited by hand.
const draftTitle = computed(() => tr(state.title))
watch(draftTitle, (title, previous) => {
  if (!props.group && state.slug === slugify(previous)) state.slug = slugify(title)
})

const ownerTypes = computed(() => OWNER_TYPE_OPTIONS.map(value => ({ value, label: t(`admin.ownerTypes.${value}`, value) })))

async function save(event: FormSubmitEvent<FaqGroupFormState>) {
  const body = formToGroupBody(event.data)
  const saved = await run(
    () => props.group
      ? $fetch<StaffFaqGroup>(faqApi.admin.group(props.group.id), { method: 'PATCH', body })
      : $fetch<StaffFaqGroup>(faqApi.admin.groups, { method: 'POST', body }),
    { success: props.group
      ? t('admin.saved', 'Saved {name}', { name: tr(event.data.title) })
      : t('admin.created', 'Created {name}', { name: tr(event.data.title) }) },
  )
  if (saved) emit('close', saved)
}
</script>

<template>
  <FormSlideover
    form-id="faq-group-form"
    :title="group ? t('admin.editGroupTitle', 'Edit FAQ group') : t('admin.createGroup', 'Add FAQ group')"
    :description="group ? undefined : t('admin.createGroupDescription', 'Create the group first, then add its questions.')"
    :submit-label="group ? t('admin.saveGroup', 'Save FAQ group') : t('admin.createGroupAction', 'Create FAQ group')"
    :loading="busy"
    @close="emit('close', false)"
  >
    <UForm
      id="faq-group-form"
      :schema="schema"
      :state="state"
      class="flex flex-col gap-4"
      @submit="save"
    >
      <UFormField
        name="title"
        :label="t('admin.groupTitle', 'Title')"
        required
      >
        <TranslatedInput v-model="state.title" />
      </UFormField>
      <UFormField
        name="slug"
        :label="t('admin.slug', 'URL name')"
        :description="t('admin.slugHelp', 'Lowercase letters, numbers and dashes. Pages refer to the group by it.')"
        required
      >
        <UInput
          v-model="state.slug"
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="description"
        :label="t('admin.description', 'Description')"
      >
        <TranslatedInput
          v-model="state.description"
          multiline
          :rows="3"
        />
      </UFormField>
      <UFormField
        name="icon"
        :label="t('admin.icon', 'Icon')"
        :description="t('admin.iconHelp', 'An icon name such as i-lucide-info.')"
      >
        <UInput
          v-model="state.icon"
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="ownerType"
        :label="t('admin.owner', 'Owner')"
        :description="t('admin.ownerHelp', 'The platform, or an operation or team the group belongs to.')"
      >
        <USelect
          v-model="state.ownerType"
          :items="ownerTypes"
          class="w-full"
        />
      </UFormField>
      <UFormField
        v-if="state.ownerType !== 'platform'"
        name="ownerId"
        :label="t('admin.ownerId', 'Owner id')"
        required
      >
        <UInput
          v-model="state.ownerId"
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="grants"
        :label="t('admin.grantsLabel', 'Who can see it')"
      >
        <GrantsEditor v-model="state.grants" />
      </UFormField>
    </UForm>
  </FormSlideover>
</template>
