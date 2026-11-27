<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { CampaignChannel, CampaignMyListDto, CampaignMySubscriptionsDto } from '../../../types'
import { campaignsApi } from '../../utils/api'
import { $fetch, computed, errorMessage, reactive, tableUi, useCachedFetch, useCampaignsTranslate, useErrorToast, useModuleT, useToast } from '#imports'

defineOptions({ name: 'CampaignsAccountPage' })

// The signed-in user's subscriptions. No container: under `/account/**` the `account` layout provides it. The heading
// comes from the same keys as the account menu item. Email can be turned on here (at once with a verified address,
// after the confirmation email otherwise); SMS only off, since an SMS signup confirms the phone number.
const t = useModuleT('campaigns.account')
const tc = useModuleT('campaigns')
const tm = useModuleT('campaigns.menu.account')
const tr = useCampaignsTranslate()
const toast = useToast()
const showError = useErrorToast()

const { data, error, loading, refresh } = await useCachedFetch<CampaignMySubscriptionsDto>(campaignsApi.me.subscriptions, { key: 'campaigns-my-subscriptions' })
const lists = computed(() => data.value?.lists ?? [])
const offersSms = computed(() => lists.value.some(list => list.channels.includes('sms')))

const on = (list: CampaignMyListDto, channel: CampaignChannel) => {
  const status = list.subscriptions[channel]
  return status === 'active' || status === 'pending'
}
const saving = reactive(new Set<string>())
const disabled = (list: CampaignMyListDto, channel: CampaignChannel) =>
  saving.has(list.id) || !list.channels.includes(channel) || (channel === 'sms' && !on(list, 'sms'))

const columns = computed<TableColumn<CampaignMyListDto>[]>(() => [
  { id: 'list', header: t('list', 'List') },
  { id: 'email', header: tc('channels.email', 'Email'), meta: { class: { th: 'w-40', td: 'w-40' } } },
  ...(offersSms.value ? [{ id: 'sms', header: tc('channels.sms', 'SMS'), meta: { class: { th: 'w-40', td: 'w-40' } } }] : []),
])

async function change(list: CampaignMyListDto, channel: CampaignChannel, value: boolean) {
  if (saving.has(list.id)) return
  saving.add(list.id)
  try {
    data.value = await $fetch<CampaignMySubscriptionsDto>(campaignsApi.me.subscriptions, { method: 'PATCH', body: { lists: { [list.id]: { [channel]: value } } } })
    const updated = data.value.lists.find(entry => entry.id === list.id)
    const pending = value && updated?.subscriptions[channel] === 'pending'
    toast.add({
      title: value
        ? (pending ? t('checkInbox', 'Check your inbox to confirm {list}', { list: tr(list.name) }) : t('subscribed', 'Subscribed to {list}', { list: tr(list.name) }))
        : t('unsubscribed', 'Unsubscribed from {list}', { list: tr(list.name) }),
      color: 'success',
      icon: 'i-lucide-check',
    })
  }
  catch (e) {
    showError(e, t('saveFailed', 'Could not change your subscriptions'))
  }
  finally {
    saving.delete(list.id)
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <PageHeading
      :title="tm('label', 'Subscriptions')"
      :description="tm('description', 'Choose the lists you are subscribed to.')"
    />

    <UEmpty
      v-if="error"
      icon="i-lucide-circle-alert"
      :title="t('loadFailed', 'Your subscriptions could not be loaded')"
      :description="errorMessage(error, '')"
      :actions="[{ label: tc('tryAgain', 'Try again'), icon: 'i-lucide-rotate-ccw', color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
    />

    <template v-else>
      <UAlert
        v-if="data && !data.emailVerified"
        color="neutral"
        variant="subtle"
        icon="i-lucide-mail"
        :description="t('unverified', 'Your email address is not verified yet, so we send a confirmation link before the first message.')"
      />

      <TableCard
        :title="t('title', 'Your subscriptions')"
        :description="t('description', 'Turn a list on to get its messages, or off to stop them.')"
        :loading="loading"
      >
        <UTable
          :data="lists"
          :columns="columns"
          :ui="tableUi({ tr: '' })"
        >
          <template #list-cell="{ row }">
            <p class="text-highlighted font-medium">
              {{ tr(row.original.name) }}
            </p>
            <p
              v-if="tr(row.original.description)"
              class="text-muted text-sm"
            >
              {{ tr(row.original.description) }}
            </p>
          </template>
          <template
            v-for="channel in (['email', 'sms'] as const)"
            :key="channel"
            #[`${channel}-cell`]="{ row }"
          >
            <div
              v-if="row.original.channels.includes(channel)"
              class="flex items-center gap-2"
            >
              <SwitchToggle
                :model-value="on(row.original, channel)"
                :disabled="disabled(row.original, channel)"
                :aria-label="`${tr(row.original.name)}: ${tc(`channels.${channel}`, channel)}`"
                :title="channel === 'sms' && !on(row.original, 'sms') ? t('smsHint', 'Sign up for SMS with the list\'s signup form.') : undefined"
                @update:model-value="(value: boolean) => change(row.original, channel, value)"
              />
              <UBadge
                v-if="row.original.subscriptions[channel] === 'pending'"
                color="warning"
                variant="subtle"
                :label="tc('statuses.pending', 'Waiting to confirm')"
              />
            </div>
          </template>
          <template #empty>
            <UEmpty
              variant="naked"
              icon="i-lucide-newspaper"
              :title="t('empty', 'No lists yet')"
              :description="t('emptyDescription', 'Lists you can sign up for will show up here.')"
            />
          </template>
        </UTable>
      </TableCard>
    </template>
  </div>
</template>
