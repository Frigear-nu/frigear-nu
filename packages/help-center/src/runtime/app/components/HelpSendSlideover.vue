<script setup lang="ts">
import { helpCenterApi } from '../../utils/api'
import type { HelpSendResult, HelpSendSkipReason, Grant } from '../../../types'
import type { StaffHelpArticle, StaffHelpArticlesPage } from '../utils/admin'
import { $fetch, computed, reactive, ref, useAction, useFetch, useHelpCenterTranslate, useModuleT, useToast } from '#imports'
import { grantFields } from '#auth/grant-fields'

defineOptions({ name: 'HelpSendSlideover' })

// Sends links to articles by email and SMS (`POST /api/admin/help-center/send`), opened with `useOverlay()`. Each person
// gets only the articles they may read. The audience is people (the shared `UserPicker` of `@frigear-nu/users` on the
// help center's lookup, which matches emails with `help-center:pii` and offers "Create user" with `users:create`) and/or
// a grant list: each grant kind (a role, a team, an operation) lists its members. After the send the slideover shows who
// got a text, an email or nothing, and why; it closes with the result.
const props = defineProps<{ articleIds?: string[] }>()
const emit = defineEmits<{ close: [sent: HelpSendResult | false] }>()

const t = useModuleT('helpCenter')
const tr = useHelpCenterTranslate()
const toast = useToast()
const { busy, run } = useAction()

const { data: page } = useFetch<StaffHelpArticlesPage>(helpCenterApi.admin.articles, {
  // Help articles only: FAQ questions are not pages a link can point at.
  query: { status: 'published', kind: 'help', pageSize: 100, sort: 'title', order: 'asc' },
  key: 'help-center:send:articles',
})
const articles = computed<StaffHelpArticle[]>(() => page.value?.items ?? [])
const items = computed(() => articles.value.map(article => ({ value: article.id, label: tr(article.title) })))

const state = reactive({
  articleIds: [...(props.articleIds ?? [])],
  userIds: [] as number[],
  grants: [] as Grant[],
  email: true,
  sms: false,
  fallbackToEmail: true,
})
const error = ref<string | null>(null)
const result = ref<HelpSendResult | null>(null)
// `public` lists nobody, so a send cannot go to it.
const sendKinds = grantFields.map(field => field.kind).filter(kind => kind !== 'public')

const reasonLabels = computed<Record<HelpSendSkipReason, string>>(() => ({
  unknown_user: t('admin.skipUnknownUser', 'No such user'),
  no_access: t('admin.skipNoAccess', 'May read none of the articles'),
  no_phone: t('admin.skipNoPhone', 'No phone number'),
  no_sms_consent: t('admin.skipNoSmsConsent', 'Has not turned on texts'),
  no_email: t('admin.skipNoEmail', 'No email address'),
  opted_out: t('admin.skipOptedOut', 'Turned off emails for help articles'),
  failed: t('admin.skipFailed', 'Sending failed'),
}))

async function send() {
  error.value = null
  const audience = {
    ...(state.userIds.length ? { userIds: state.userIds.map(String) } : {}),
    ...(state.grants.length ? { grants: state.grants } : {}),
  }
  const channels = [...(state.email ? ['email'] : []), ...(state.sms ? ['sms'] : [])]
  if (!state.articleIds.length) error.value = t('admin.sendNeedsArticles', 'Pick at least one article.')
  else if (!Object.keys(audience).length) error.value = t('admin.sendNeedsAudience', 'Name at least one person or group.')
  else if (!channels.length) error.value = t('admin.sendNeedsChannel', 'Choose email, SMS or both.')
  if (error.value) return
  const sent = await run(
    () => $fetch<HelpSendResult>(helpCenterApi.admin.send, {
      method: 'POST',
      body: { articleIds: state.articleIds, audience, channels, fallbackToEmail: state.fallbackToEmail },
    }),
    { error: t('admin.sendFailed', 'Could not send the articles') },
  )
  if (!sent) return
  toast.add({
    title: t('admin.sentCounts', '{sms} by SMS, {email} by email', { sms: sent.counts.sms, email: sent.counts.email }),
    description: sent.counts.none ? t('admin.sentNone', '{count} got nothing.', { count: sent.counts.none }) : undefined,
    color: sent.counts.none ? 'warning' : 'success',
  })
  result.value = sent
}
</script>

<template>
  <FormSlideover
    form-id="help-send-form"
    :title="t('admin.sendTitle', 'Send articles')"
    :description="t('admin.sendDescription', 'People get a link to each article they are allowed to read.')"
    :submit-label="t('admin.sendAction', 'Send articles')"
    :loading="busy"
    @close="emit('close', result ?? false)"
  >
    <div
      v-if="result"
      class="flex flex-col gap-4"
      data-send-result
    >
      <div class="grid grid-cols-3 gap-3">
        <div
          v-for="stat in [
            { key: 'sms', label: t('admin.resultSms', 'By SMS'), value: result.counts.sms },
            { key: 'email', label: t('admin.resultEmail', 'By email'), value: result.counts.email },
            { key: 'none', label: t('admin.resultNone', 'Got nothing'), value: result.counts.none },
          ]"
          :key="stat.key"
          class="rounded-md border border-default p-3"
        >
          <div class="text-muted text-xs">
            {{ stat.label }}
          </div>
          <div class="text-highlighted text-2xl font-semibold">
            {{ stat.value }}
          </div>
        </div>
      </div>
      <p
        v-if="result.fallback"
        class="text-muted text-sm"
      >
        {{ t('admin.resultFallback', '{count} of the emails went instead of a text.', { count: result.fallback }) }}
      </p>
      <div
        v-if="result.skipped.length"
        class="flex flex-col gap-2"
      >
        <span class="text-highlighted text-sm font-medium">{{ t('admin.resultSkipped', 'Got nothing') }}</span>
        <ul class="divide-y divide-default rounded-md border border-default">
          <li
            v-for="skip in result.skipped"
            :key="skip.userId"
            class="flex items-center justify-between gap-3 px-3 py-2 text-sm"
          >
            <span class="text-highlighted truncate">{{ skip.name || `#${skip.userId}` }}</span>
            <UBadge
              color="neutral"
              variant="subtle"
              :label="reasonLabels[skip.reason]"
            />
          </li>
        </ul>
      </div>
    </div>
    <form
      v-else
      id="help-send-form"
      class="flex flex-col gap-4"
      @submit.prevent="send"
    >
      <UAlert
        v-if="error"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="error"
      />
      <UFormField
        :label="t('admin.sendArticles', 'Articles')"
        required
      >
        <USelectMenu
          v-model="state.articleIds"
          :items="items"
          value-key="value"
          multiple
          class="w-full"
          :placeholder="t('admin.sendArticlesPlaceholder', 'Pick published articles')"
        />
      </UFormField>
      <UFormField
        :label="t('admin.sendPeople', 'People')"
        :description="t('admin.sendPeopleHelp', 'Search by name, or create a person who is not here yet.')"
      >
        <UserPicker
          v-model="state.userIds"
          multiple
          :endpoint="helpCenterApi.admin.users"
          :placeholder="t('admin.sendPeoplePlaceholder', 'Search people')"
        />
      </UFormField>
      <UFormField
        :label="t('admin.sendGroups', 'Groups')"
        :description="t('admin.sendGroupsHelp', 'Everyone who matches one of these: a role, a team, the people who take part in an operation.')"
      >
        <GrantsEditor
          v-model="state.grants"
          :kinds="sendKinds"
          :empty-text="t('admin.sendGroupsEmpty', 'No groups yet: add the groups to send to, or pick people above.')"
        />
      </UFormField>
      <div class="flex flex-col gap-2">
        <span class="text-highlighted text-sm font-medium">{{ t('admin.sendChannels', 'Send by') }}</span>
        <UCheckbox
          v-model="state.email"
          :label="t('admin.channelEmail', 'Email')"
        />
        <UCheckbox
          v-model="state.sms"
          :label="t('admin.channelSms', 'SMS')"
          :description="t('admin.channelSmsHelp', 'Only people with a phone number who turned on texts for help articles get one.')"
        />
      </div>
      <USwitch
        v-model="state.fallbackToEmail"
        :label="t('admin.fallbackToEmail', 'Fall back to email')"
        :description="t('admin.fallbackToEmailHelp', 'People a text cannot reach (no phone number, texts turned off) get an email instead. Off: they get nothing.')"
        :disabled="!state.sms || state.email"
        data-fallback-to-email
      />
    </form>
    <template
      v-if="result"
      #footer
    >
      <UButton
        :label="t('admin.resultDone', 'Done')"
        @click="emit('close', result)"
      />
    </template>
  </FormSlideover>
</template>
