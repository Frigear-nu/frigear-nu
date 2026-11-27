<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { campaignListFormBody, campaignListFormSchema, campaignListToForm, campaignSlugify, emptyCampaignListForm } from '../utils/admin-list'
import type { CampaignListFormState } from '../utils/admin-list'
import { campaignsApi } from '../../utils/api'
import type { CampaignListDto } from '../../../types'
import { $fetch, computed, reactive, useAction, useCampaignsTranslate, useModuleT, watch } from '#imports'

defineOptions({ name: 'CampaignListFormSlideover' })

// Create and edit form of a list, opened with `useOverlay()` by `useCampaignListActions()`: it closes with
// the saved list, or `false` when cancelled.
const props = defineProps<{ list?: CampaignListDto }>()
const emit = defineEmits<{ close: [saved: CampaignListDto | false] }>()

const t = useModuleT('campaigns')
const tr = useCampaignsTranslate()
const { busy, run } = useAction()

const schema = campaignListFormSchema(t)
const state = reactive<CampaignListFormState>(props.list ? campaignListToForm(props.list) : emptyCampaignListForm())

// For a new list the URL name follows the name until it is edited by hand.
const draftName = computed(() => tr(state.name))
watch(draftName, (name, previous) => {
  if (!props.list && state.slug === campaignSlugify(previous ?? '')) state.slug = campaignSlugify(name)
})

const channels = computed(() => [
  { value: 'email', label: t('channels.email', 'Email') },
  { value: 'sms', label: t('channels.sms', 'SMS') },
])

async function save(event: FormSubmitEvent<CampaignListFormState>) {
  const body = campaignListFormBody(event.data)
  const name = tr(event.data.name)
  const saved = await run(
    () => props.list
      ? $fetch<CampaignListDto>(campaignsApi.admin.list(props.list.id), { method: 'PATCH', body })
      : $fetch<CampaignListDto>(campaignsApi.admin.lists, { method: 'POST', body }),
    {
      success: props.list ? t('admin.saved', 'Saved {name}', { name }) : t('admin.created', 'Created {name}', { name }),
      error: props.list ? t('admin.saveFailed', 'Could not save the list') : t('admin.createFailed', 'Could not create the list'),
    },
  )
  if (saved) emit('close', saved)
}
</script>

<template>
  <FormSlideover
    form-id="campaign-list-form"
    :title="list ? t('admin.editTitle', 'Edit list') : t('admin.create', 'Create list')"
    :description="list ? undefined : t('admin.createDescription', 'People sign up for it with the signup component or the HTML form on its page.')"
    :submit-label="list ? t('admin.saveAction', 'Save list') : t('admin.create', 'Create list')"
    :loading="busy"
    @close="emit('close', false)"
  >
    <UForm
      id="campaign-list-form"
      :schema="schema"
      :state="state"
      class="flex flex-col gap-4"
      @submit="save"
    >
      <UFormField
        name="name"
        :label="t('admin.fields.name', 'Name')"
        required
      >
        <TranslatedInput v-model="state.name" />
      </UFormField>
      <UFormField
        name="slug"
        :label="t('admin.fields.slug', 'URL name')"
        :description="t('admin.fields.slugHelp', 'Lowercase letters, digits and dashes. The signup names the list by it, so changing it breaks signups that use the old one.')"
        required
      >
        <UInput
          v-model="state.slug"
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="description"
        :label="t('admin.fields.description', 'Description')"
        :description="t('admin.fields.descriptionHelp', 'Shown with the signup and on the account page.')"
      >
        <TranslatedInput
          v-model="state.description"
          multiline
          :preview="false"
          :rows="3"
        />
      </UFormField>
      <UFormField
        name="channels"
        :label="t('admin.fields.channels', 'Channels')"
        :description="t('admin.fields.channelsHelp', 'How its messages can reach people. SMS goes through the SMS driver the app has set up.')"
        required
      >
        <UCheckboxGroup
          v-model="state.channels"
          :items="channels"
          orientation="horizontal"
        />
      </UFormField>
      <UFormField
        name="consentText"
        :label="t('admin.fields.consentText', 'Consent text')"
        :description="t('admin.fields.consentTextHelp', 'Shown next to the consent checkbox. Changing it starts a new version, and each subscription keeps the version it agreed to.')"
      >
        <TranslatedInput
          v-model="state.consentText"
          multiline
          :preview="false"
          :rows="3"
        />
      </UFormField>
      <UFormField
        name="doubleOptIn"
        :description="t('admin.fields.doubleOptInHelp', 'A new subscriber first confirms from a link in an email or SMS. Leave it on unless you collect consent elsewhere.')"
      >
        <USwitch
          v-model="state.doubleOptIn"
          :label="t('admin.fields.doubleOptIn', 'Ask new subscribers to confirm')"
        />
      </UFormField>
      <UFormField
        name="public"
        :description="t('admin.fields.publicHelp', 'Anyone can sign up through the public signup, and signed-in users see it on their account page.')"
      >
        <USwitch
          v-model="state.public"
          :label="t('admin.fields.public', 'Public signup')"
        />
      </UFormField>
    </UForm>
  </FormSlideover>
</template>
