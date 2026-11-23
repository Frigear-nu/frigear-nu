<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { type HelpCategoryFormState, type StaffHelpCategory, OWNER_TYPE_OPTIONS, categoryToForm, emptyHelpCategoryForm, formToCategoryBody, helpCategoryFormSchema, slugify } from '../utils/admin'
import { helpCenterApi } from '../../utils/api'
import { helpDisplaysForKind } from '../../utils/faq'
import type { HelpCategoryDisplay, HelpCategoryKind } from '../../../types'
import { $fetch, computed, reactive, useAction, useHelpCenterTranslate, useModuleT, watch } from '#imports'

defineOptions({ name: 'HelpCategoryFormSlideover' })

// Create and edit form of a category, opened with `useOverlay()` by `useHelpCategoryActions()`: it closes with the saved
// category, or `false` when cancelled.
// `kind` is the kind of a new category (`faq` from the FAQ page, shown as cards to start with); an existing category keeps
// its own. `categories` are those of the same kind: the parent picker offers nothing else.
const props = defineProps<{ category?: StaffHelpCategory, categories: StaffHelpCategory[], kind?: HelpCategoryKind }>()
const kind = computed<HelpCategoryKind>(() => props.category?.kind ?? props.kind ?? 'help')
const emit = defineEmits<{ close: [saved: StaffHelpCategory | false] }>()

const t = useModuleT('helpCenter')
const tr = useHelpCenterTranslate()
const { busy, run } = useAction()

const schema = computed(() => helpCategoryFormSchema(t, tr, kind.value))
const state = reactive<HelpCategoryFormState>(props.category ? categoryToForm(props.category) : emptyHelpCategoryForm(helpDisplaysForKind(kind.value)[0]))

// For a new category the URL name follows the name (in the current locale) until it is edited by hand.
const draftName = computed(() => tr(state.name))
watch(draftName, (name, previous) => {
  if (!props.category && state.slug === slugify(previous)) state.slug = slugify(name)
})

// Only the displays the kind offers: an FAQ shows as cards or questions, a help category as a list or questions. When
// the kind changes, a display it does not offer falls back to the kind's first.
const DISPLAY_LABELS: Record<HelpCategoryDisplay, [string, string]> = {
  list: ['admin.displays.list', 'Article list'],
  accordion: ['admin.displays.accordion', 'Questions (FAQ)'],
  cards: ['admin.displays.cards', 'Question cards (FAQ)'],
}
const displays = computed(() => helpDisplaysForKind(kind.value).map(value => ({ value, label: t(...DISPLAY_LABELS[value]) })))
watch(kind, (next) => {
  const allowed = helpDisplaysForKind(next)
  if (!allowed.includes(state.display)) state.display = allowed[0]!
}, { immediate: true })

const ownerTypes = computed(() => OWNER_TYPE_OPTIONS.map(value => ({ value, label: t(`admin.ownerTypes.${value}`, value) })))
// A category cannot be its own parent; the API also refuses a parent below it.
const parents = computed(() => [
  { value: '', label: t('admin.noParent', 'Top level') },
  ...props.categories.filter(entry => entry.id !== props.category?.id && entry.kind === kind.value).map(entry => ({ value: entry.id, label: tr(entry.name) })),
])

// A subcategory can only narrow its parent: an ancestor that hides it keeps it hidden whatever it says itself.
const hasParent = computed(() => !!state.parentId)

async function save(event: FormSubmitEvent<HelpCategoryFormState>) {
  const body = { ...formToCategoryBody(event.data), kind: kind.value }
  const query = { kind: kind.value }
  const saved = await run(
    () => props.category
      ? $fetch<StaffHelpCategory>(helpCenterApi.admin.category(props.category.id), { method: 'PATCH', query, body })
      : $fetch<StaffHelpCategory>(helpCenterApi.admin.categories, { method: 'POST', query, body }),
    { success: props.category
      ? t('admin.categorySaved', 'Saved {name}', { name: tr(event.data.name) })
      : t('admin.categoryCreated', 'Created {name}', { name: tr(event.data.name) }) },
  )
  if (saved) emit('close', saved)
}
</script>

<template>
  <FormSlideover
    form-id="help-category-form"
    :title="category ? t('admin.editCategoryTitle', 'Edit category') : t('admin.createCategory', 'Add category')"
    :description="category ? undefined : t('admin.createCategoryDescription', 'Create the category first, then file articles in it.')"
    :submit-label="category ? t('admin.saveCategory', 'Save category') : t('admin.createCategoryAction', 'Create category')"
    :loading="busy"
    @close="emit('close', false)"
  >
    <UForm
      id="help-category-form"
      :schema="schema"
      :state="state"
      class="flex flex-col gap-4"
      @submit="save"
    >
      <UFormField
        name="name"
        :label="t('admin.categoryName', 'Name')"
        required
      >
        <TranslatedInput v-model="state.name" />
      </UFormField>
      <UFormField
        name="slug"
        :label="t('admin.slug', 'URL name')"
        :description="t('admin.slugHelp', 'Lowercase letters, numbers and dashes. It is part of the address of the pages.')"
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
        name="parentId"
        :label="t('admin.parent', 'Parent category')"
      >
        <USelect
          v-model="state.parentId"
          :items="parents"
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="display"
        :label="t('admin.display', 'Shown as')"
        :description="t('admin.displayHelp', 'An article list links to each article. Questions open their answer in place, like an FAQ. Question cards show each article as a card of its own.')"
      >
        <USelect
          v-model="state.display"
          :items="displays"
          class="w-full"
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
        :description="t('admin.ownerHelp', 'The platform, or an operation or team the category belongs to.')"
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
        :description="t('admin.categoryGrantsHelp', 'Anyone who matches one of these. Applies to every article in the category; an article can narrow it further, never widen it.')"
      >
        <GrantsEditor v-model="state.grants" />
      </UFormField>
      <UAlert
        v-if="hasParent"
        color="neutral"
        variant="subtle"
        icon="i-lucide-info"
        :title="t('admin.categoryNarrows', 'People must also see the category above it')"
        :description="t('admin.categoryNarrowsHelp', 'A category is only visible to people who can see every category above it.')"
      />
    </UForm>
  </FormSlideover>
</template>
