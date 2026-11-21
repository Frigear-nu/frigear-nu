<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { type FaqItemFormState, type StaffFaqGroup, type StaffFaqItem, emptyFaqItemForm, faqItemFormSchema, formToItemBody, itemToForm, missingLocales } from '../utils/admin-faq'
import { faqApi } from '../../utils/api'
import { $fetch, computed, reactive, useAction, useFaqTranslate, useModuleT, useRuntimeConfig } from '#imports'

defineOptions({ name: 'FaqItemFormSlideover' })

// Create and edit form of an item, opened with `useOverlay()` by `useFaqItemActions()`: it closes with the saved item, or
// `false` when cancelled. A new item is a draft; publishing is its own action, which checks the required languages.
const props = defineProps<{ group: StaffFaqGroup, item?: StaffFaqItem }>()
const emit = defineEmits<{ close: [saved: StaffFaqItem | false] }>()

const t = useModuleT('faq')
const tr = useFaqTranslate()
const { busy, run } = useAction()
const requiredLocales = useRuntimeConfig().public.faq?.requiredLocales ?? ['da', 'en']

const schema = faqItemFormSchema(t, tr)
const state = reactive<FaqItemFormState>(props.item ? itemToForm(props.item) : emptyFaqItemForm())

// "Same as the group" is an item without a list of its own (`grants: null`). Turning it off starts an empty list, which
// admits nobody until a grant is added; the item can only narrow its group.
const inherit = computed({
  get: () => state.grants === null,
  set: (value: boolean) => {
    state.grants = value ? null : []
  },
})

// What the item still lacks to be published, shown while editing.
const missing = () => ({ question: missingLocales(state.question, requiredLocales), answer: missingLocales(state.answer, requiredLocales) })

async function save(event: FormSubmitEvent<FaqItemFormState>) {
  const body = formToItemBody(event.data)
  const saved = await run(
    () => props.item
      ? $fetch<StaffFaqItem>(faqApi.admin.item(props.item.id), { method: 'PATCH', body })
      : $fetch<StaffFaqItem>(faqApi.admin.items(props.group.id), { method: 'POST', body }),
    { success: props.item
      ? t('admin.itemSaved', 'Saved the question')
      : t('admin.itemCreated', 'Added the question as a draft') },
  )
  if (saved) emit('close', saved)
}
</script>

<template>
  <FormSlideover
    form-id="faq-item-form"
    :title="item ? t('admin.editItemTitle', 'Edit question') : t('admin.createItem', 'Add question')"
    :description="item ? undefined : t('admin.createItemDescription', 'It starts as a draft. Publish it when every language is filled in.')"
    :submit-label="item ? t('admin.saveItem', 'Save question') : t('admin.createItemAction', 'Add question')"
    :loading="busy"
    @close="emit('close', false)"
  >
    <UForm
      id="faq-item-form"
      :schema="schema"
      :state="state"
      class="flex flex-col gap-4"
      @submit="save"
    >
      <UFormField
        name="question"
        :label="t('admin.question', 'Question')"
        :description="missing().question.length ? t('admin.missingLocales', 'Still missing: {locales}', { locales: missing().question.join(', ') }) : undefined"
        required
      >
        <TranslatedInput v-model="state.question" />
      </UFormField>
      <UFormField
        name="answer"
        :label="t('admin.answer', 'Answer')"
        :description="missing().answer.length ? t('admin.missingLocales', 'Still missing: {locales}', { locales: missing().answer.join(', ') }) : t('admin.answerHelp', 'Markdown is supported.')"
        required
      >
        <TranslatedInput
          v-model="state.answer"
          multiline
          mdc
          :rows="6"
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

      <UFormField
        name="grants"
        :label="t('admin.grantsLabel', 'Who can see it')"
      >
        <div class="flex w-full flex-col gap-4">
          <USwitch
            v-model="inherit"
            :label="t('admin.grantsInherit', 'Same as the group')"
            :description="t('admin.grantsInheritHelp', 'The question is visible to the people who can see its group. Turn this off to narrow it further.')"
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
