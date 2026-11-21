<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { type HelpArticleFormState, type StaffHelpArticle, type StaffHelpCategory, articleToForm, emptyHelpArticleForm, formToArticleBody, helpArticleFormSchema, missingLocales, slugify } from '../utils/admin'
import { helpCenterApi } from '../../utils/api'
import { $fetch, computed, reactive, useAction, useHelpCenterTranslate, useModuleT, useRuntimeConfig, watch } from '#imports'

defineOptions({ name: 'HelpArticleFormSlideover' })

// Create and edit form of an article, opened with `useOverlay()` by `useHelpArticleActions()`: it closes with the saved
// article, or `false` when cancelled. A new article is a draft; publishing is its own action, which checks the required
// languages.
const props = defineProps<{ article?: StaffHelpArticle, categories: StaffHelpCategory[], categoryId?: string }>()
const emit = defineEmits<{ close: [saved: StaffHelpArticle | false] }>()

const t = useModuleT('helpCenter')
const tr = useHelpCenterTranslate()
const { busy, run } = useAction()
const requiredLocales = useRuntimeConfig().public.helpCenter?.requiredLocales ?? ['da', 'en']

const schema = helpArticleFormSchema(t, tr)
const state = reactive<HelpArticleFormState>(props.article ? articleToForm(props.article) : emptyHelpArticleForm(props.categoryId ?? props.categories[0]?.id ?? ''))

// For a new article the URL name follows the title (in the current locale) until it is edited by hand.
const draftTitle = computed(() => tr(state.title))
watch(draftTitle, (title, previous) => {
  if (!props.article && state.slug === slugify(previous)) state.slug = slugify(title)
})

const categoryItems = computed(() => props.categories.map(category => ({ value: category.id, label: tr(category.name) })))
// "Same as the category" is an article without a list of its own (`grants: null`). Turning it off starts an empty list,
// which admits nobody until a grant is added; the article can only narrow its category.
const inherit = computed({
  get: () => state.grants === null,
  set: (value: boolean) => {
    state.grants = value ? null : []
  },
})

// What the article still lacks to be published, shown while editing.
const missing = () => ({ title: missingLocales(state.title, requiredLocales), body: missingLocales(state.body, requiredLocales) })

async function save(event: FormSubmitEvent<HelpArticleFormState>) {
  const body = formToArticleBody(event.data)
  const saved = await run(
    () => props.article
      ? $fetch<StaffHelpArticle>(helpCenterApi.admin.article(props.article.id), { method: 'PATCH', body })
      : $fetch<StaffHelpArticle>(helpCenterApi.admin.articles, { method: 'POST', body }),
    { success: props.article
      ? t('admin.articleSaved', 'Saved {name}', { name: tr(event.data.title) })
      : t('admin.articleCreated', 'Added {name} as a draft', { name: tr(event.data.title) }) },
  )
  if (saved) emit('close', saved)
}
</script>

<template>
  <FormSlideover
    form-id="help-article-form"
    :title="article ? t('admin.editArticleTitle', 'Edit article') : t('admin.createArticle', 'Add article')"
    :description="article ? undefined : t('admin.createArticleDescription', 'It starts as a draft. Publish it when every language is filled in.')"
    :submit-label="article ? t('admin.saveArticle', 'Save article') : t('admin.createArticleAction', 'Add article')"
    :loading="busy"
    @close="emit('close', false)"
  >
    <UForm
      id="help-article-form"
      :schema="schema"
      :state="state"
      class="flex flex-col gap-4"
      @submit="save"
    >
      <UFormField
        name="categoryId"
        :label="t('admin.category', 'Category')"
        required
      >
        <USelect
          v-model="state.categoryId"
          :items="categoryItems"
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="title"
        :label="t('admin.articleTitle', 'Title')"
        :description="missing().title.length ? t('admin.missingLocales', 'Still missing: {locales}', { locales: missing().title.join(', ') }) : undefined"
        required
      >
        <TranslatedInput v-model="state.title" />
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
        name="body"
        :label="t('admin.body', 'Article')"
        :description="missing().body.length ? t('admin.missingLocales', 'Still missing: {locales}', { locales: missing().body.join(', ') }) : t('admin.bodyHelp', 'Markdown is supported.')"
        required
      >
        <TranslatedInput
          v-model="state.body"
          multiline
          mdc
          :rows="12"
        />
      </UFormField>
      <UFormField
        name="grants"
        :label="t('admin.grantsLabel', 'Who can see it')"
      >
        <div class="flex w-full flex-col gap-4">
          <USwitch
            v-model="inherit"
            :label="t('admin.grantsInherit', 'Same as the category')"
            :description="t('admin.grantsInheritHelp', 'The article is visible to the people who can see its category. Turn this off to narrow it further.')"
          />
          <GrantsEditor
            v-if="state.grants !== null"
            v-model="state.grants"
          />
        </div>
      </UFormField>
    </UForm>
  </FormSlideover>
</template>
