<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { type FaqGroupFormState, type StaffFaqGroup, type StaffFaqItem, OWNER_TYPE_OPTIONS, emptyFaqGroupForm, faqGroupFormSchema, formToGroupBody, groupToForm } from '../utils/admin-faq'
import { faqApi } from '../../utils/api'
import { faqCardProps } from '../../utils/cards'
import type { FaqGroupDto } from '../../../types'
import { $fetch, computed, errorMessage, navigateTo, reactive, ref, useAction, useFaqFallbackLocale, useFaqGroupActions, useFaqItemActions, useFaqLinks, useFaqLocale, useFaqTranslate, useFetch, useModuleT, useRoute, watch } from '#imports'

defineOptions({ name: 'FaqAdminGroupPage' })

const t = useModuleT('faq')
const route = useRoute()
const tr = useFaqTranslate()
const locale = useFaqLocale()
const fallback = useFaqFallbackLocale()
const links = useFaqLinks()
const groupActions = useFaqGroupActions()
const itemActions = useFaqItemActions()
const { busy, run } = useAction()
const id = computed(() => String(route.params.id))

const { data: group, error, refresh: refreshGroup } = await useFetch<StaffFaqGroup>(() => faqApi.admin.group(id.value))
const { data: items, refresh: refreshItems } = await useFetch<StaffFaqItem[]>(() => faqApi.admin.items(id.value), { default: () => [] })
const refresh = () => Promise.all([refreshGroup(), refreshItems()])

const notFound = computed(() => error.value?.statusCode === 404)
const forbidden = computed(() => error.value?.statusCode === 401 || error.value?.statusCode === 403)

// The settings: one form, validated like the create slideover.
const schema = faqGroupFormSchema(t, tr)
const state = reactive<FaqGroupFormState>(group.value ? groupToForm(group.value) : emptyFaqGroupForm())
watch(group, value => value && Object.assign(state, groupToForm(value)))
const ownerTypes = computed(() => OWNER_TYPE_OPTIONS.map(value => ({ value, label: t(`admin.ownerTypes.${value}`, value) })))

async function save(event: FormSubmitEvent<FaqGroupFormState>) {
  const saved = await run(
    () => $fetch(faqApi.admin.group(id.value), { method: 'PATCH', body: formToGroupBody(event.data) }).then(() => true),
    { success: t('admin.saved', 'Saved {name}', { name: tr(event.data.title) }) },
  )
  if (saved) await refresh()
}

// What visitors see: the published items in the group's card, the same component the site renders. `items` is every
// status, so the preview keeps the published ones.
const preview = computed(() => {
  if (!group.value) return undefined
  const published = items.value.filter(item => item.status === 'published')
  const dto: FaqGroupDto = {
    id: group.value.id,
    slug: group.value.slug,
    title: group.value.title,
    description: group.value.description,
    icon: group.value.icon,
    owner: group.value.owner,
    sort: group.value.sort,
    public: group.value.public,
    items: published.map(item => ({ id: item.id, groupId: item.groupId, question: item.question, answer: item.answer, icon: item.icon, links: item.links, sort: item.sort, public: false })),
  }
  return faqCardProps(dto, locale.value, fallback.value)
})
const showPreview = ref(true)
</script>

<template>
  <div class="flex flex-col gap-4">
    <template v-if="group">
      <PageHeading
        :title="tr(group.title)"
        :breadcrumb="[{ label: t('admin.title', 'FAQ'), to: links.admin() }, { label: tr(group.title) }]"
      >
        <template #badge>
          <StatusBadge
            :status="group.public ? 'published' : 'draft'"
            :label="group.public ? t('admin.grantsPublic', 'Public') : t('admin.grantsNotPublic', 'Not public')"
          />
        </template>
        <template #actions>
          <UButton
            icon="i-lucide-plus"
            :label="t('admin.createItem', 'Add question')"
            @click="async () => { if (await itemActions.create(group!)) await refresh() }"
          />
          <RowMenu
            variant="outline"
            :subject="tr(group.title)"
            :items="groupActions.menu(group, { open: false, onChanged: refresh, onRemoved: () => navigateTo(links.admin()) })"
          />
        </template>
      </PageHeading>

      <SectionCard
        :title="t('admin.items', 'Questions')"
        :description="t('admin.itemsDescription', 'Drag to reorder. Only published questions show on the site.')"
        flush
      >
        <FaqItemList
          v-if="items.length"
          :group="group"
          :items="items"
          @changed="refresh"
        />
        <UEmpty
          v-else
          variant="naked"
          icon="i-lucide-message-circle-question-mark"
          :title="t('admin.itemsEmpty', 'No questions yet')"
          :description="t('admin.itemsEmptyDescription', 'Add the first question. It starts as a draft.')"
          :actions="[{ label: t('admin.createItem', 'Add question'), icon: 'i-lucide-plus', onClick: async () => { if (await itemActions.create(group!)) await refresh() } }]"
        />
      </SectionCard>

      <SectionCard :title="t('admin.settings', 'Settings')">
        <UForm
          id="faq-group-settings"
          :schema="schema"
          :state="state"
          class="flex flex-col divide-y divide-default"
          @submit="save"
        >
          <FormRow
            name="title"
            :label="t('admin.groupTitle', 'Title')"
            required
          >
            <TranslatedInput
              v-model="state.title"
              class="sm:max-w-sm"
            />
          </FormRow>
          <FormRow
            name="slug"
            :label="t('admin.slug', 'URL name')"
            :description="t('admin.slugHelp', 'Lowercase letters, numbers and dashes. Pages refer to the group by it.')"
            required
          >
            <UInput
              v-model="state.slug"
              class="w-full sm:max-w-sm"
            />
          </FormRow>
          <FormRow
            name="description"
            :label="t('admin.description', 'Description')"
          >
            <TranslatedInput
              v-model="state.description"
              multiline
              :rows="3"
              class="sm:max-w-sm"
            />
          </FormRow>
          <FormRow
            name="icon"
            :label="t('admin.icon', 'Icon')"
            :description="t('admin.iconHelp', 'An icon name such as i-lucide-info.')"
          >
            <UInput
              v-model="state.icon"
              class="w-full sm:max-w-sm"
            />
          </FormRow>
          <FormRow
            name="ownerType"
            :label="t('admin.owner', 'Owner')"
            :description="t('admin.ownerHelp', 'The platform, or an operation or team the group belongs to.')"
          >
            <div class="flex w-full flex-col gap-2 sm:max-w-sm">
              <USelect
                v-model="state.ownerType"
                :items="ownerTypes"
                class="w-full"
              />
              <UFormField
                v-if="state.ownerType !== 'platform'"
                name="ownerId"
              >
                <UInput
                  v-model="state.ownerId"
                  class="w-full"
                  :placeholder="t('admin.ownerId', 'Owner id')"
                />
              </UFormField>
            </div>
          </FormRow>
          <FormRow
            name="grants"
            :label="t('admin.grantsLabel', 'Who can see it')"
            :description="t('admin.grantsHelp', 'Anyone who matches one of these. Questions can narrow this further, never widen it.')"
          >
            <div class="w-full sm:max-w-sm">
              <GrantsEditor v-model="state.grants" />
            </div>
          </FormRow>
        </UForm>
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton
              type="submit"
              form="faq-group-settings"
              :loading="busy"
              :label="t('admin.saveGroup', 'Save FAQ group')"
            />
          </div>
        </template>
      </SectionCard>

      <SectionCard
        :title="t('admin.preview', 'Preview')"
        :description="t('admin.previewDescription', 'What visitors see: the published questions, in the card the site uses.')"
      >
        <template #actions>
          <UButton
            variant="ghost"
            color="neutral"
            size="xs"
            :icon="showPreview ? 'i-lucide-eye-off' : 'i-lucide-eye'"
            :label="showPreview ? t('admin.hidePreview', 'Hide preview') : t('admin.showPreview', 'Show preview')"
            @click="showPreview = !showPreview"
          />
        </template>
        <div
          v-if="showPreview && preview"
          class="max-w-xl"
          data-test="faq-preview"
        >
          <FaqCard v-bind="preview" />
        </div>
      </SectionCard>
    </template>

    <UEmpty
      v-else-if="forbidden"
      icon="i-lucide-lock"
      :title="t('admin.forbidden', 'You do not have access to the FAQ')"
      :actions="[{ label: t('admin.allGroups', 'All FAQ groups'), to: links.admin(), color: 'neutral', variant: 'outline' }]"
    />
    <UEmpty
      v-else-if="notFound || !error"
      icon="i-lucide-message-circle-question-mark"
      :title="t('groupNotFound', 'FAQ group not found')"
      :actions="[{ label: t('admin.allGroups', 'All FAQ groups'), to: links.admin(), color: 'neutral', variant: 'outline' }]"
    />
    <UEmpty
      v-else
      icon="i-lucide-circle-alert"
      :title="t('admin.groupLoadFailed', 'The FAQ group could not be loaded')"
      :description="errorMessage(error, '')"
      :actions="[{ label: t('tryAgain', 'Try again'), icon: 'i-lucide-rotate-ccw', color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
    />
  </div>
</template>
