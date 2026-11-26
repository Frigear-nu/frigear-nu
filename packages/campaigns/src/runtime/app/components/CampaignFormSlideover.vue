<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { grantFields } from '#auth/grant-fields'
import { campaignFormBody, campaignFormSchema, campaignToForm, CAMPAIGN_EXCLUDED_GRANT_KINDS, emptyCampaignForm } from '../utils/admin-campaign'
import type { CampaignFormState } from '../utils/admin-campaign'
import { campaignKindChannels } from '../../utils/delivery'
import { campaignsApi } from '../../utils/api'
import type { CampaignDto, CampaignKind, CampaignListDto, CampaignUserLookupDto } from '../../../types'
import { useCampaignsAccessState } from '../composables/useCampaignsAccess'
import { $fetch, computed, reactive, useAction, useCampaignsTranslate, useConfirmDialog, useLazyFetch, useModuleT, watch } from '#imports'

defineOptions({ name: 'CampaignFormSlideover' })

// Create and edit form of a campaign draft, opened with `useOverlay()` by `useCampaignActions()`: it closes with the
// saved campaign, or `false` when cancelled. The kind is chosen once, on create. A newsletter goes to lists; a message
// goes to people and groups (roles, teams, operations). Sending is a separate step on the campaign's page.
const props = defineProps<{ campaign?: CampaignDto, kind?: CampaignKind }>()
const emit = defineEmits<{ close: [saved: CampaignDto | false] }>()

const t = useModuleT('campaigns')
const tr = useCampaignsTranslate()
const confirm = useConfirmDialog()
const can = useCampaignsAccessState()
const { busy, run } = useAction()

const schema = campaignFormSchema(t)
const state = reactive<CampaignFormState>(props.campaign ? campaignToForm(props.campaign) : emptyCampaignForm(props.kind))

const { data: lists, status: listsStatus } = useLazyFetch<CampaignListDto[]>(campaignsApi.admin.lists, { key: 'campaigns:form:lists', default: () => [] })
const listItems = computed(() => (lists.value ?? []).map(list => ({ value: list.id, label: tr(list.name), description: list.slug })))

// The names of the people a draft already lists, so the picker shows them.
const { data: selectedUsers } = useLazyFetch<CampaignUserLookupDto[]>(campaignsApi.admin.users, {
  key: `campaigns:form:users:${props.campaign?.id ?? 'new'}`,
  query: { ids: state.userIds.join(',') },
  immediate: state.userIds.length > 0,
  default: () => [],
})

const kinds = computed(() => [
  { value: 'newsletter', label: t('campaign.kinds.newsletter', 'Newsletter'), description: t('campaign.kinds.newsletterHelp', 'To the subscribers of newsletter lists, by email or SMS.') },
  { value: 'message', label: t('campaign.kinds.message', 'Message'), description: t('campaign.kinds.messageHelp', 'To users picked by name, role, team or operation, by email, SMS or push.') },
])
const channelLabel = (channel: string) => t(`campaign.channels.${channel}`, { email: 'Email', sms: 'SMS', push: 'Push' }[channel] ?? channel)
const channelItems = computed(() => campaignKindChannels(state.kind).map(value => ({ value, label: channelLabel(value) })))
watch(() => state.kind, (kind) => {
  const allowed = campaignKindChannels(kind)
  state.channels = state.channels.filter(channel => allowed.includes(channel))
  if (!state.channels.length) state.channels = ['email']
  if (kind === 'newsletter') state.important = false
})

const sendKinds = grantFields.map(field => field.kind).filter(kind => !(CAMPAIGN_EXCLUDED_GRANT_KINDS as readonly string[]).includes(kind))
// In the script, not the template: vue-tsc misreads the markdown sample inside an attribute.
const emailBodyHelp = computed(() => t('campaign.fields.emailBodyHelp', 'Markdown: **bold**, _italics_, [links](https://…) and blank lines between paragraphs. An unsubscribe link is added at the end.'))
const showImportant = computed(() => state.kind === 'message' && (can.value.sendImportant || state.important))

// Important overrides people's choices: ask before turning it on.
async function toggleImportant(value: boolean) {
  if (!value) {
    state.important = false
    return
  }
  const confirmed = await confirm({
    title: t('campaign.importantTitle', 'Send as an important message?'),
    description: t('campaign.importantDescription', 'An important message reaches people on every channel you pick, also on the channels they turned off for messages. Use it only for what they must know, such as safety information or a changed time.'),
    confirmText: t('campaign.importantConfirm', 'Make it important'),
  })
  state.important = confirmed
}

async function save(event: FormSubmitEvent<CampaignFormState>) {
  const body = campaignFormBody(event.data)
  const saved = await run(
    () => props.campaign
      ? $fetch<CampaignDto>(campaignsApi.admin.campaign(props.campaign.id), { method: 'PATCH', body })
      : $fetch<CampaignDto>(campaignsApi.admin.campaigns, { method: 'POST', body: { kind: event.data.kind, ...body } }),
    {
      success: props.campaign ? t('campaign.saved', 'Saved {name}', { name: body.name }) : t('campaign.created', 'Created {name}', { name: body.name }),
      error: props.campaign ? t('campaign.saveFailed', 'Could not save the campaign') : t('campaign.createFailed', 'Could not create the campaign'),
    },
  )
  if (saved) emit('close', saved)
}
</script>

<template>
  <FormSlideover
    form-id="campaign-form"
    :title="campaign ? t('campaign.editTitle', 'Edit campaign') : t('campaign.create', 'Create campaign')"
    :description="campaign ? undefined : t('campaign.createDescription', 'It is saved as a draft. Check who it reaches, then send it now or schedule it from its page.')"
    :submit-label="campaign ? t('campaign.saveAction', 'Save campaign') : t('campaign.create', 'Create campaign')"
    :loading="busy"
    @close="emit('close', false)"
  >
    <UForm
      id="campaign-form"
      :schema="schema"
      :state="state"
      class="flex flex-col gap-4"
      @submit="save"
    >
      <UFormField
        v-if="!campaign"
        name="kind"
        :label="t('campaign.fields.kind', 'Kind')"
        required
      >
        <URadioGroup
          v-model="state.kind"
          :items="kinds"
          variant="card"
        />
      </UFormField>
      <UFormField
        name="name"
        :label="t('campaign.fields.name', 'Name')"
        :description="t('campaign.fields.nameHelp', 'For staff only: recipients see the subject or text, never this name.')"
        required
      >
        <UInput
          v-model="state.name"
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="channels"
        :label="t('campaign.fields.channels', 'Channels')"
        :description="state.kind === 'newsletter'
          ? t('campaign.fields.channelsNewsletterHelp', 'Each subscriber gets it on the channels they subscribed with.')
          : t('campaign.fields.channelsMessageHelp', 'People get it on the channels they keep on for messages; SMS is off until they turn it on.')"
        required
      >
        <UCheckboxGroup
          v-model="state.channels"
          :items="channelItems"
          orientation="horizontal"
        />
      </UFormField>

      <UFormField
        v-if="state.kind === 'newsletter'"
        name="listIds"
        :label="t('campaign.fields.lists', 'Newsletters')"
        :description="t('campaign.fields.listsHelp', 'Everyone subscribed to one of these gets it once per channel, even when they are on several.')"
      >
        <USelectMenu
          v-model="state.listIds"
          :items="listItems"
          value-key="value"
          multiple
          :loading="listsStatus === 'pending'"
          :placeholder="t('campaign.fields.listsPlaceholder', 'Pick newsletters')"
          class="w-full"
        />
      </UFormField>
      <template v-else>
        <UFormField
          name="userIds"
          :label="t('campaign.fields.people', 'People')"
          :description="t('campaign.fields.peopleHelp', 'Search by name.')"
        >
          <UserPicker
            v-model="state.userIds"
            multiple
            :create="false"
            :endpoint="campaignsApi.admin.users"
            :selected="selectedUsers"
            :placeholder="t('campaign.fields.peoplePlaceholder', 'Search people')"
          />
        </UFormField>
        <UFormField
          name="grants"
          :label="t('campaign.fields.groups', 'Groups')"
          :description="t('campaign.fields.groupsHelp', 'Everyone who matches one of these: a role, a team, the people who take part in an operation.')"
        >
          <GrantsEditor
            v-model="state.grants"
            :kinds="sendKinds"
            :empty-text="t('campaign.fields.groupsEmpty', 'No groups yet: add the groups to send to, or pick people above.')"
          />
        </UFormField>
      </template>

      <template v-if="state.channels.includes('email')">
        <USeparator :label="t('campaign.channels.email', 'Email')" />
        <UFormField
          name="emailSubject"
          :label="t('campaign.fields.subject', 'Subject')"
        >
          <TranslatedInput v-model="state.emailSubject" />
        </UFormField>
        <UFormField
          name="emailBody"
          :label="t('campaign.fields.body', 'Text')"
          :description="emailBodyHelp"
        >
          <TranslatedInput
            v-model="state.emailBody"
            multiline
            :rows="8"
          />
        </UFormField>
      </template>

      <template v-if="state.channels.includes('sms')">
        <USeparator :label="t('campaign.channels.sms', 'SMS')" />
        <UFormField
          name="smsBody"
          :label="t('campaign.fields.body', 'Text')"
          :description="t('campaign.fields.smsBodyHelp', 'Plain text. A line with an unsubscribe link is added at the end.')"
        >
          <TranslatedInput
            v-model="state.smsBody"
            multiline
            :preview="false"
            :rows="3"
          />
        </UFormField>
      </template>

      <template v-if="state.channels.includes('push')">
        <USeparator :label="t('campaign.channels.push', 'Push')" />
        <UFormField
          name="pushTitle"
          :label="t('campaign.fields.pushTitle', 'Title')"
        >
          <TranslatedInput v-model="state.pushTitle" />
        </UFormField>
        <UFormField
          name="pushBody"
          :label="t('campaign.fields.body', 'Text')"
        >
          <TranslatedInput
            v-model="state.pushBody"
            multiline
            :preview="false"
            :rows="2"
          />
        </UFormField>
        <UFormField
          name="pushUrl"
          :label="t('campaign.fields.pushUrl', 'Link')"
          :description="t('campaign.fields.pushUrlHelp', 'Where tapping the notification leads: a page on this site (/news) or a full URL.')"
        >
          <UInput
            v-model="state.pushUrl"
            class="w-full"
          />
        </UFormField>
      </template>

      <USeparator :label="t('campaign.fields.tracking', 'Tracking')" />
      <UFormField
        name="trackClicks"
        :description="t('campaign.fields.trackClicksHelp', 'Links become short links that count each recipient\'s clicks.')"
      >
        <USwitch
          v-model="state.trackClicks"
          :label="t('campaign.fields.trackClicks', 'Count clicks')"
        />
      </UFormField>
      <UFormField
        v-if="state.channels.includes('email')"
        name="trackOpens"
        :description="t('campaign.fields.trackOpensHelp', 'Adds an invisible image to the email. Mail apps that load images by themselves count as opens too, so the number is a rough one.')"
      >
        <USwitch
          v-model="state.trackOpens"
          :label="t('campaign.fields.trackOpens', 'Count opens')"
        />
      </UFormField>
      <UFormField
        v-if="showImportant"
        name="important"
        :description="t('campaign.fields.importantHelp', 'Reaches people also on the channels they turned off for messages.')"
      >
        <USwitch
          :model-value="state.important"
          :disabled="!can.sendImportant"
          :label="t('campaign.fields.important', 'Important message')"
          @update:model-value="toggleImportant"
        />
      </UFormField>
    </UForm>
  </FormSlideover>
</template>
