<script setup lang="ts">
import type { FormSubmitEvent, TableColumn } from '@nuxt/ui'
import type { Page } from '@frigear-nu/module-kit/server'
import type { CampaignListDto, CampaignSubscriberDto } from '../../../types'
import { campaignsApi } from '../../utils/api'
import { campaignEmbedSnippet } from '../../utils/links'
import { campaignListFormBody, campaignListFormSchema, campaignListToForm } from '../utils/admin-list'
import type { CampaignListFormState } from '../utils/admin-list'
import { $fetch, computed, emptyCell, errorMessage, h, navigateTo, reactive, ref, resolveComponent, tableUi, useAction, useCampaignListActions, useCampaignsLinks, useCampaignsLocale, useCampaignsTranslate, useCopyToClipboard, useFetch, useFormat, useModuleT, useRequestURL, useRoute, watch } from '#imports'

defineOptions({ name: 'CampaignsAdminListPage' })

const t = useModuleT('campaigns')
const tr = useCampaignsTranslate()
const locale = useCampaignsLocale()
const route = useRoute()
const links = useCampaignsLinks()
const actions = useCampaignListActions()
const format = useFormat()
const { copy } = useCopyToClipboard()
const { busy, run } = useAction()
const id = computed(() => String(route.params.id))

const { data: list, error, refresh } = await useFetch<CampaignListDto>(() => campaignsApi.admin.list(id.value))
const notFound = computed(() => error.value?.statusCode === 404)
const forbidden = computed(() => error.value?.statusCode === 401 || error.value?.statusCode === 403)
const name = computed(() => tr(list.value?.name))

// --- Settings: one inline form, like the edit slideover -------------------------------------------------------------
const schema = campaignListFormSchema(t)
const state = reactive<CampaignListFormState>({ name: undefined, slug: '', description: undefined, channels: ['email'], doubleOptIn: true, public: true, consentText: undefined })
watch(list, (value) => {
  if (value) Object.assign(state, campaignListToForm(value))
}, { immediate: true })
const channels = computed(() => [
  { value: 'email', label: t('channels.email', 'Email') },
  { value: 'sms', label: t('channels.sms', 'SMS') },
])

async function save(event: FormSubmitEvent<CampaignListFormState>) {
  if (!list.value) return
  const saved = await run(
    () => $fetch<CampaignListDto>(campaignsApi.admin.list(list.value!.id), { method: 'PATCH', body: campaignListFormBody(event.data) }),
    { success: t('admin.saved', 'Saved {name}', { name: tr(event.data.name) }), error: t('admin.saveFailed', 'Could not save the newsletter') },
  )
  if (saved) list.value = saved
}

// --- Subscribers ----------------------------------------------------------------------------------------------------
const page = ref(1)
const pageSize = ref(20)
const statusFilter = ref<'all' | 'pending' | 'active' | 'unsubscribed'>('all')
const search = ref('')
watch([statusFilter, search], () => {
  page.value = 1
})
const subscribersQuery = computed(() => ({ page: page.value, pageSize: pageSize.value, status: statusFilter.value, q: search.value || undefined }))
const { data: subscribers, status: subscribersStatus, error: subscribersError } = await useFetch<Page<CampaignSubscriberDto>>(
  () => campaignsApi.admin.subscribers(id.value),
  { query: subscribersQuery, watch: [subscribersQuery] },
)
const subscribersLoading = computed(() => subscribersStatus.value === 'pending' && !subscribers.value)
const subscribersRefreshing = computed(() => subscribersStatus.value === 'pending' && !!subscribers.value)
const filtered = computed(() => statusFilter.value !== 'all' || !!search.value)

const statusLabel = (status: string) => t(`statuses.${status}`, { pending: 'Waiting to confirm', active: 'Subscribed', unsubscribed: 'Unsubscribed' }[status] ?? status)
const statusOptions = computed(() => [
  { value: 'all', label: t('admin.allStatuses', 'All statuses') },
  ...(['active', 'pending', 'unsubscribed'] as const).map(value => ({ value, label: statusLabel(value) })),
])
const channelLabel = (channel: string) => t(`channels.${channel}`, channel === 'sms' ? 'SMS' : 'Email')
const sourceLabel = (source: string) => t(`sources.${source}`, { form: 'Signup', api: 'API', admin: 'Staff', forms: 'Form', account: 'Account page' }[source] ?? source)

const TableIdentity = resolveComponent('TableIdentity')
const StatusBadge = resolveComponent('StatusBadge')

const subscriberColumns = computed<TableColumn<CampaignSubscriberDto>[]>(() => [
  {
    id: 'contact',
    header: t('admin.subscriber', 'Subscriber'),
    cell: ({ row }) => {
      const contact = row.original.contact
      const address = row.original.channel === 'email' ? contact.email : contact.phone
      return h(TableIdentity, { title: contact.name || address || t('admin.noName', 'No name'), description: contact.name ? address ?? undefined : undefined })
    },
  },
  { id: 'channel', header: t('admin.channel', 'Channel'), cell: ({ row }) => channelLabel(row.original.channel) },
  {
    id: 'status',
    header: t('admin.status', 'Status'),
    cell: ({ row }) => h(StatusBadge, { status: row.original.status, label: statusLabel(row.original.status), colors: { unsubscribed: 'neutral' } }),
  },
  { id: 'source', header: t('admin.source', 'Source'), cell: ({ row }) => sourceLabel(row.original.source) },
  {
    id: 'requestedAt',
    header: t('admin.requestedAt', 'Signed up'),
    cell: ({ row }) => h('span', { class: 'tabular-nums' }, format.dateTime(row.original.requestedAt)),
  },
  {
    id: 'confirmedAt',
    header: t('admin.confirmedAt', 'Confirmed'),
    cell: ({ row }) => row.original.confirmedAt ? h('span', { class: 'tabular-nums' }, format.dateTime(row.original.confirmedAt)) : emptyCell(),
  },
])

// --- Embed ----------------------------------------------------------------------------------------------------------
const origin = useRequestURL().origin
const snippet = computed(() => list.value
  ? campaignEmbedSnippet({
      action: `${origin}${campaignsApi.subscribe(list.value.slug)}`,
      channels: list.value.channels,
      locale: locale.value,
      texts: {
        name: t('signup.name', 'Name'),
        email: t('signup.email', 'Email'),
        phone: t('signup.phone', 'Phone number'),
        consent: tr(list.value.consentText) || t('signup.consentDefault', 'Yes, send me this newsletter.'),
        submit: t('signup.submit', 'Sign up'),
      },
    })
  : '')
const componentSnippet = computed(() => list.value ? `<NewsletterSignup list="${list.value.slug}" />` : '')
const contentSnippet = computed(() => list.value ? `::newsletter-signup{list="${list.value.slug}"}\n::` : '')
</script>

<template>
  <div class="flex flex-col gap-4">
    <template v-if="list">
      <PageHeading
        :title="name"
        :description="tr(list.description) || undefined"
        :breadcrumb="[{ label: t('admin.title', 'Newsletters'), to: links.adminLists() }, { label: name }]"
      >
        <template #badge>
          <StatusBadge
            :status="list.public ? 'active' : 'inactive'"
            :label="list.public ? t('admin.public', 'Public') : t('admin.private', 'Not public')"
          />
        </template>
        <template #actions>
          <RowMenu
            variant="outline"
            :subject="name"
            :items="actions.menu(list, { open: false, onChanged: refresh, onRemoved: () => navigateTo(links.adminLists() ?? '/') })"
          />
        </template>
      </PageHeading>

      <SectionCard
        :title="t('admin.settings', 'Settings')"
        :description="t('admin.settingsDescription', 'What the newsletter is called, how people get it and what they agree to.')"
      >
        <UForm
          id="campaign-list-settings"
          :schema="schema"
          :state="state"
          class="flex flex-col divide-y divide-default"
          @submit="save"
        >
          <FormRow
            name="name"
            :label="t('admin.fields.name', 'Name')"
            required
          >
            <TranslatedInput
              v-model="state.name"
              class="sm:max-w-sm"
            />
          </FormRow>
          <FormRow
            name="slug"
            :label="t('admin.fields.slug', 'URL name')"
            :description="t('admin.fields.slugHelp', 'Lowercase letters, digits and dashes. The signup names the newsletter by it, so changing it breaks signups that use the old one.')"
            required
          >
            <UInput
              v-model="state.slug"
              class="w-full sm:max-w-sm"
            />
          </FormRow>
          <FormRow
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
          </FormRow>
          <FormRow
            name="channels"
            :label="t('admin.fields.channels', 'Channels')"
            :description="t('admin.fields.channelsHelp', 'How people can get it. SMS goes through the SMS driver the app has set up.')"
            required
          >
            <UCheckboxGroup
              v-model="state.channels"
              :items="channels"
              orientation="horizontal"
            />
          </FormRow>
          <FormRow
            name="consentText"
            :label="t('admin.fields.consentText', 'Consent text')"
            :description="t('admin.consentVersion', 'Version {version}. Changing the text starts a new version; each subscription keeps the version it agreed to.', { version: list.consentVersion })"
          >
            <TranslatedInput
              v-model="state.consentText"
              multiline
              :preview="false"
              :rows="3"
            />
          </FormRow>
          <FormRow
            name="doubleOptIn"
            :label="t('admin.fields.doubleOptIn', 'Ask new subscribers to confirm')"
            :description="t('admin.fields.doubleOptInHelp', 'A new subscriber first confirms from a link in an email or SMS. Leave it on unless you collect consent elsewhere.')"
          >
            <USwitch v-model="state.doubleOptIn" />
          </FormRow>
          <FormRow
            name="public"
            :label="t('admin.fields.public', 'Public signup')"
            :description="t('admin.fields.publicHelp', 'Anyone can sign up through the public signup, and signed-in users see it on their account page.')"
          >
            <USwitch v-model="state.public" />
          </FormRow>
        </UForm>
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton
              type="submit"
              form="campaign-list-settings"
              :loading="busy"
              :label="t('admin.saveAction', 'Save newsletter')"
            />
          </div>
        </template>
      </SectionCard>

      <TableCard
        :title="t('admin.subscribersTitle', 'Subscribers')"
        :description="t('admin.subscribersDescription', '{active} subscribed, {pending} waiting to confirm.', { active: list.counts.email.active + list.counts.sms.active, pending: list.counts.email.pending + list.counts.sms.pending })"
        :loading="subscribersLoading"
        :refreshing="subscribersRefreshing"
      >
        <template #actions>
          <UInput
            v-model="search"
            icon="i-lucide-search"
            :placeholder="t('admin.searchSubscribers', 'Search subscribers')"
            :aria-label="t('admin.searchSubscribers', 'Search subscribers')"
            class="w-full sm:w-56"
          />
          <USelect
            v-model="statusFilter"
            :items="statusOptions"
            :aria-label="t('admin.status', 'Status')"
            class="w-44"
          />
        </template>
        <UAlert
          v-if="subscribersError"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :title="t('admin.subscribersFailed', 'Subscribers could not be loaded')"
          :description="errorMessage(subscribersError, '')"
          class="m-4"
        />
        <UTable
          v-else
          :data="subscribers?.items ?? []"
          :columns="subscriberColumns"
          :ui="tableUi()"
        >
          <template #empty>
            <UEmpty
              v-if="filtered"
              variant="naked"
              icon="i-lucide-search"
              :title="t('admin.noMatches', 'No subscribers match')"
              :actions="[{ label: t('admin.clearFilters', 'Clear filters'), color: 'neutral', variant: 'outline', onClick: () => { statusFilter = 'all'; search = '' } }]"
            />
            <UEmpty
              v-else
              variant="naked"
              icon="i-lucide-users"
              :title="t('admin.noSubscribers', 'Nobody has signed up yet')"
              :description="t('admin.noSubscribersDescription', 'Add the signup below to a page, and subscribers show up here.')"
            />
          </template>
        </UTable>
        <template #footer>
          <TablePagination
            v-model:page="page"
            v-model:page-size="pageSize"
            :total="subscribers?.total ?? 0"
          />
        </template>
      </TableCard>

      <SectionCard
        :title="t('admin.embed', 'Signup')"
        :description="t('admin.embedDescription', 'Put the signup on a page of this site with the component, or paste the HTML form into another site.')"
      >
        <div class="flex flex-col gap-4">
          <div
            v-for="entry in [
              { key: 'component', label: t('admin.embedComponent', 'Vue component'), code: componentSnippet },
              { key: 'content', label: t('admin.embedContent', 'Nuxt Content page'), code: contentSnippet },
              { key: 'html', label: t('admin.embedHtml', 'HTML form for another site'), code: snippet },
            ]"
            :key="entry.key"
            class="flex flex-col gap-2"
          >
            <div class="flex items-center justify-between gap-2">
              <p class="text-sm font-medium text-highlighted">
                {{ entry.label }}
              </p>
              <UButton
                size="xs"
                color="neutral"
                variant="outline"
                icon="i-lucide-copy"
                :label="t('admin.copySnippet', 'Copy code')"
                @click="copy(entry.code)"
              />
            </div>
            <pre class="overflow-x-auto rounded-md bg-elevated p-3 text-xs"><code>{{ entry.code }}</code></pre>
          </div>
        </div>
      </SectionCard>
    </template>

    <UEmpty
      v-else
      :icon="notFound ? 'i-lucide-search-x' : forbidden ? 'i-lucide-lock' : 'i-lucide-circle-alert'"
      :title="notFound ? t('admin.notFound', 'Newsletter not found') : forbidden ? t('admin.forbidden', 'You do not have access to newsletters') : t('admin.loadFailed', 'Newsletters could not be loaded')"
      :description="errorMessage(error, '')"
      :actions="[{ label: t('admin.backToList', 'Back to newsletters'), icon: 'i-lucide-arrow-left', color: 'neutral', variant: 'outline', to: links.adminLists() }]"
    />
  </div>
</template>
