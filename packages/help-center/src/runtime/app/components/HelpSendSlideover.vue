<script setup lang="ts">
import { helpCenterApi } from '../../utils/api'
import type { HelpSendResult, Grant } from '../../../types'
import type { StaffHelpArticle, StaffHelpArticlesPage } from '../utils/admin'
import { $fetch, computed, reactive, ref, useAction, useFetch, useHelpCenterTranslate, useModuleT, useToast } from '#imports'
import { grantFields } from '#auth/grant-fields'

defineOptions({ name: 'HelpSendSlideover' })

// Sends links to articles by email and SMS (`POST /api/admin/help-center/send`), opened with `useOverlay()`. Each person
// gets only the articles they may read. The audience is explicit people and/or a grant list: each grant kind (a role,
// a team, an operation) lists its members.
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
  userIds: [] as string[],
  grants: [] as Grant[],
  email: true,
  sms: false,
})
const error = ref<string | null>(null)
// `public` lists nobody, so a send cannot go to it.
const sendKinds = grantFields.map(field => field.kind).filter(kind => kind !== 'public')

async function send() {
  error.value = null
  const audience = {
    ...(state.userIds.length ? { userIds: state.userIds } : {}),
    ...(state.grants.length ? { grants: state.grants } : {}),
  }
  const channels = [...(state.email ? ['email'] : []), ...(state.sms ? ['sms'] : [])]
  if (!state.articleIds.length) error.value = t('admin.sendNeedsArticles', 'Pick at least one article.')
  else if (!Object.keys(audience).length) error.value = t('admin.sendNeedsAudience', 'Name at least one person or group.')
  else if (!channels.length) error.value = t('admin.sendNeedsChannel', 'Choose email, SMS or both.')
  if (error.value) return
  const result = await run(
    () => $fetch<HelpSendResult>(helpCenterApi.admin.send, { method: 'POST', body: { articleIds: state.articleIds, audience, channels } }),
    { error: t('admin.sendFailed', 'Could not send the articles') },
  )
  if (!result) return
  toast.add({
    title: t('admin.sent', 'Sent to {count} people', { count: result.emailed + result.texted }),
    description: result.skipped ? t('admin.sentSkipped', '{count} people got nothing: no readable article or no address.', { count: result.skipped }) : undefined,
    color: 'success',
  })
  emit('close', result)
}
</script>

<template>
  <FormSlideover
    form-id="help-send-form"
    :title="t('admin.sendTitle', 'Send articles')"
    :description="t('admin.sendDescription', 'People get a link to each article they are allowed to read.')"
    :submit-label="t('admin.sendAction', 'Send articles')"
    :loading="busy"
    @close="emit('close', false)"
  >
    <form
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
        :description="t('admin.sendPeopleHelp', 'User ids, one after the other.')"
      >
        <TagInput
          v-model="state.userIds"
          :placeholder="t('admin.sendPeoplePlaceholder', 'Type an id and press Enter')"
        />
      </UFormField>
      <UFormField
        :label="t('admin.sendGroups', 'Groups')"
        :description="t('admin.sendGroupsHelp', 'Everyone who matches one of these: a role, a team, the people who take part in an operation.')"
      >
        <GrantsEditor
          v-model="state.grants"
          :kinds="sendKinds"
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
    </form>
  </FormSlideover>
</template>
