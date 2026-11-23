<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { type HelpArticleFormState, type StaffHelpArticle, type StaffHelpCategory, articleToForm, emptyHelpArticleForm, formToArticleBody, helpArticleFormSchema, isFaqDisplay, missingLocales, slugify } from '../utils/admin'
import { helpCenterApi } from '../../utils/api'
import { useHelpArticlePublish } from '../composables/useHelpArticlePublish'
import { $fetch, computed, reactive, ref, useAction, useHelpCenterTranslate, useModuleT, useRuntimeConfig, useUiT, watch } from '#imports'

defineOptions({ name: 'HelpArticleFormSlideover' })

// Create and edit form of an article, opened with `useOverlay()` by `useHelpArticleActions()`: it closes with the saved
// article, or `false` when cancelled. A new article is a draft. Editing a draft offers "Publish" too, enabled once every
// required language is filled in: it saves, then publishes. `highlightMissing` (opened from "Publish" on an incomplete
// article) marks the fields that still lack a language.
const props = defineProps<{ article?: StaffHelpArticle, categories: StaffHelpCategory[], categoryId?: string, highlightMissing?: boolean }>()
const emit = defineEmits<{ close: [saved: StaffHelpArticle | false] }>()

const t = useModuleT('helpCenter')
const tr = useHelpCenterTranslate()
const { busy, run } = useAction()
const actions = useUiT('actions')
const requiredLocales = useRuntimeConfig().public.helpCenter?.requiredLocales ?? ['da', 'en']

const schema = helpArticleFormSchema(t, tr)
const state = reactive<HelpArticleFormState>(props.article ? articleToForm(props.article) : emptyHelpArticleForm(props.categoryId ?? props.categories[0]?.id ?? ''))

// For a new article the URL name follows the title (in the current locale) until it is edited by hand.
const draftTitle = computed(() => tr(state.title))
watch(draftTitle, (title, previous) => {
  if (!props.article && state.slug === slugify(previous)) state.slug = slugify(title)
})

// The page's kind: an existing article keeps its own, a new one takes the kind of the categories it is offered. The
// picker offers categories of that kind only, and the API answers 404 / 400 for the other kind.
const kind = computed(() => props.article?.kind ?? props.categories[0]?.kind ?? 'help')
const categoryItems = computed(() => props.categories.filter(category => category.kind === kind.value).map(category => ({ value: category.id, label: tr(category.name) })))
// The icon and the buttons show in a questions (FAQ) category, where the text opens under the title or is a card.
const inAccordion = computed(() => isFaqDisplay(props.categories.find(category => category.id === state.categoryId)?.display))
// "Same as the category" is an article without a list of its own (`grants: null`). Turning it off starts an empty list,
// which admits nobody until a grant is added; the article can only narrow its category.
const inherit = computed({
  get: () => state.grants === null,
  set: (value: boolean) => {
    state.grants = value ? null : []
  },
})

// What the article still lacks to be published, shown while editing (marked as an error when opened from "Publish").
const missing = () => ({ title: missingLocales(state.title, requiredLocales), body: missingLocales(state.body, requiredLocales) })
const missingError = (locales: string[]) => props.highlightMissing && locales.length
  ? t('admin.missingToPublish', 'Needed to publish: {locales}', { locales: locales.join(', ') })
  : undefined

// "Publish" in the footer: a draft being edited, enabled once nothing is missing. It submits the form; `save` then
// publishes what it saved.
// Under the text: Markdown, and in an FAQ category the blocks of a question card (they render on their own elsewhere).
// The syntax goes in as parameters, so the translations need no escaped braces.
const FAQ_SYNTAX = {
  details: '::faq-details{label="..." icon="i-lucide-check-circle"}',
  link: '::faq-link{label="..." to="/..." icon="..." trailing-icon="i-lucide-arrow-right" variant="subtle" size="lg"}',
  end: '::',
}
const bodyHelp = computed(() => [
  t('admin.bodyHelp', 'Markdown is supported.'),
  inAccordion.value
    ? t('admin.faqBodyHelp', 'In question cards the text before the first block is the card\'s description. A question that opens in the card: {details}, a list, then {end} on a line of its own. A button: {link}, then {end}.', FAQ_SYNTAX)
    : undefined,
].filter(Boolean).join(' '))

const publisher = useHelpArticlePublish()
const canPublish = computed(() => !!props.article && props.article.status !== 'published')
const complete = computed(() => !missing().title.length && !missing().body.length)
const publishAfterSave = ref(false)

async function save(event: FormSubmitEvent<HelpArticleFormState>) {
  const publishing = publishAfterSave.value
  publishAfterSave.value = false
  const body = formToArticleBody(event.data)
  const saved = await run(
    () => props.article
      ? $fetch<StaffHelpArticle>(helpCenterApi.admin.article(props.article.id), { method: 'PATCH', query: { kind: kind.value }, body })
      : $fetch<StaffHelpArticle>(helpCenterApi.admin.articles, { method: 'POST', query: { kind: kind.value }, body }),
    // Publishing says so itself.
    { success: publishing
      ? undefined
      : props.article
        ? t('admin.articleSaved', 'Saved {name}', { name: tr(event.data.title) })
        : t('admin.articleCreated', 'Added {name} as a draft', { name: tr(event.data.title) }) },
  )
  if (!saved) return
  if (!publishing) return emit('close', saved)
  // A refused publish keeps the slideover open with the saved changes (the toast says what is missing).
  const published = await publisher.publish(saved)
  if (published) emit('close', published)
}
</script>

<template>
  <FormSlideover
    form-id="help-article-form"
    :title="article ? t('admin.editArticleTitle', 'Edit article') : t('admin.createArticle', 'Add article')"
    :description="article ? undefined : t('admin.createArticleDescription', 'It starts as a draft. Publish it when every language is filled in.')"
    :submit-label="article ? t('admin.saveArticle', 'Save article') : t('admin.createArticleAction', 'Add article')"
    :loading="busy || publisher.busy.value"
    @close="emit('close', false)"
  >
    <template #footer="{ cancel }">
      <UButton
        :label="actions('cancel', 'Cancel')"
        color="neutral"
        variant="outline"
        :disabled="busy || publisher.busy.value"
        @click="cancel"
      />
      <UButton
        v-if="canPublish"
        type="submit"
        form="help-article-form"
        color="neutral"
        variant="subtle"
        icon="i-lucide-send"
        :label="t('admin.saveAndPublish', 'Publish article')"
        :disabled="!complete || busy || publisher.busy.value"
        :loading="publisher.busy.value"
        @click="publishAfterSave = true"
      />
      <UButton
        type="submit"
        form="help-article-form"
        :label="article ? t('admin.saveArticle', 'Save article') : t('admin.createArticleAction', 'Add article')"
        :loading="busy"
        :disabled="publisher.busy.value"
        @click="publishAfterSave = false"
      />
    </template>
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
        :error="missingError(missing().title)"
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
        :description="missing().body.length ? t('admin.missingLocales', 'Still missing: {locales}', { locales: missing().body.join(', ') }) : bodyHelp"
        :error="missingError(missing().body)"
        required
      >
        <TranslatedInput
          v-model="state.body"
          multiline
          mdc
          :rows="12"
        />
      </UFormField>
      <template v-if="inAccordion || state.icon || state.links.length">
        <UFormField
          name="icon"
          :label="t('admin.icon', 'Icon')"
          :description="t('admin.articleIconHelp', 'An icon name such as i-lucide-info, shown next to the question.')"
        >
          <UInput
            v-model="state.icon"
            class="w-full"
          />
        </UFormField>
        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <span class="text-highlighted text-sm font-medium">{{ t('admin.links', 'Buttons under the answer') }}</span>
            <UButton
              size="xs"
              variant="outline"
              color="neutral"
              icon="i-lucide-plus"
              :label="t('admin.addLink', 'Add button')"
              @click="state.links.push({ label: '', to: '', icon: '' })"
            />
          </div>
          <div
            v-for="(link, index) in state.links"
            :key="index"
            class="flex items-start gap-2"
          >
            <UFormField
              :name="`links.${index}.label`"
              class="flex-1"
            >
              <UInput
                v-model="link.label"
                class="w-full"
                :placeholder="t('admin.linkLabel', 'Label')"
              />
            </UFormField>
            <UFormField
              :name="`links.${index}.to`"
              class="flex-1"
            >
              <UInput
                v-model="link.to"
                class="w-full"
                :placeholder="t('admin.linkTo', 'Where it goes')"
              />
            </UFormField>
            <UButton
              variant="ghost"
              color="neutral"
              icon="i-lucide-trash-2"
              :aria-label="t('admin.removeLink', 'Remove button')"
              @click="state.links.splice(index, 1)"
            />
          </div>
        </div>
      </template>
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
