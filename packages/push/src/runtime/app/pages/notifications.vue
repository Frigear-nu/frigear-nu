<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { pushApi } from '../../utils/api'
import { readTranslated } from '../../utils/topics'
import type { ChannelMatrixDto, ChannelMatrixRow, NotificationChannel } from '../../../types'
import { $fetch, computed, errorMessage, tableUi, useCachedFetch, useErrorToast, useModuleT, useNuxtApp, useToast } from '#imports'

defineOptions({ name: 'PushNotificationsPage' })

// No container: under `/account/**` the `account` layout provides it. The page renders its own heading, from the
// same keys as its account menu item, so title and navigation label cannot drift.
const t = useModuleT('push.notifications')
const tm = useModuleT('push.menu.notifications')
const toast = useToast()
const showError = useErrorToast()
const { $i18n } = useNuxtApp() as unknown as { $i18n?: { locale: { value: string }, te?: (key: string) => boolean, t: (key: string) => string } }

const { data: matrix, error, loading, refresh } = await useCachedFetch<ChannelMatrixDto>(pushApi.me.channels, { key: 'push-channel-matrix' })

const CHANNELS: NotificationChannel[] = ['email', 'sms', 'push']
const topics = computed(() => matrix.value?.topics ?? [])
const offersSms = computed(() => topics.value.some(row => row.channels.includes('sms')))

// A topic names its text with a plain/translated value or an i18n key of the app that registered it.
const locale = computed(() => $i18n?.locale.value ?? 'en')
const topicText = (key: string | undefined, value: ChannelMatrixRow['label'] | undefined) =>
  key && $i18n?.te?.(key) ? $i18n.t(key) : readTranslated(value, locale.value)

const offered = (row: ChannelMatrixRow, channel: NotificationChannel) => row.channels.includes(channel)
// SMS needs a phone number; a channel the topic does not use cannot be switched. Push is never blocked: the choice also
// applies to a device registered later.
const disabled = (row: ChannelMatrixRow, channel: NotificationChannel) =>
  !offered(row, channel) || (channel === 'sms' && matrix.value?.hasPhone === false)

const columns = computed<TableColumn<ChannelMatrixRow>[]>(() => [
  { id: 'topic', header: t('topic', 'Message') },
  ...CHANNELS.map(channel => ({ id: channel, header: t(`channels.${channel}`, { email: 'Email', sms: 'SMS', push: 'Push' }[channel]), meta: { class: { th: 'w-24 text-center', td: 'w-24 text-center' } } })),
])

async function change(row: ChannelMatrixRow, channel: NotificationChannel, value: boolean) {
  const previous = row.settings[channel]
  row.settings[channel] = value
  try {
    matrix.value = await $fetch<ChannelMatrixDto>(pushApi.me.channels, { method: 'PATCH', body: { topics: { [row.id]: { [channel]: value } } } })
    toast.add({ title: t('updated', 'Notifications updated'), description: topicText(row.labelKey, row.label), color: 'success', icon: 'i-lucide-check' })
  }
  catch (e) {
    row.settings[channel] = previous
    showError(e, t('saveFailed', 'Could not update your notifications'))
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <PageHeading
      :title="tm('label', 'Notifications')"
      :description="tm('description', 'Choose how we reach you: email, SMS or push.')"
    />

    <UEmpty
      v-if="error"
      icon="i-lucide-circle-alert"
      :title="t('loadFailed', 'Your notification settings could not be loaded')"
      :description="errorMessage(error, '')"
      :actions="[{ label: t('tryAgain', 'Try again'), icon: 'i-lucide-rotate-ccw', color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
    />

    <template v-else>
      <UAlert
        v-if="matrix && !matrix.hasDevice"
        color="neutral"
        variant="subtle"
        icon="i-lucide-smartphone"
        :description="t('noDevice', 'Push notifications arrive in the app: sign in there and allow notifications to turn them on.')"
      />
      <UAlert
        v-if="matrix && !matrix.hasPhone && offersSms"
        color="neutral"
        variant="subtle"
        icon="i-lucide-phone"
        :description="t('noPhone', 'Add a phone number to your profile to receive SMS.')"
      />

      <TableCard
        :title="t('title', 'Channels')"
        :description="t('description', 'For each kind of message, choose which channels may reach you.')"
        :loading="loading"
      >
        <UTable
          :data="topics"
          :columns="columns"
          :ui="tableUi({ tr: '' })"
        >
          <template #topic-cell="{ row }">
            <p class="text-highlighted font-medium">
              {{ topicText(row.original.labelKey, row.original.label) }}
            </p>
            <p
              v-if="topicText(row.original.descriptionKey, row.original.description)"
              class="text-muted text-sm"
            >
              {{ topicText(row.original.descriptionKey, row.original.description) }}
            </p>
          </template>
          <template
            v-for="channel in CHANNELS"
            :key="channel"
            #[`${channel}-cell`]="{ row }"
          >
            <SwitchToggle
              :model-value="row.original.settings[channel]"
              :disabled="disabled(row.original, channel)"
              :aria-label="`${topicText(row.original.labelKey, row.original.label)}: ${t(`channels.${channel}`, channel)}`"
              :title="offered(row.original, channel) ? undefined : t('notOffered', 'This message does not use this channel.')"
              @update:model-value="(value: boolean) => change(row.original, channel, value)"
            />
          </template>
          <template #empty>
            <UEmpty
              variant="naked"
              icon="i-lucide-bell"
              :title="t('empty', 'Nothing to choose yet')"
              :description="t('emptyDescription', 'Messages you can choose channels for will show up here.')"
            />
          </template>
        </UTable>
      </TableCard>
    </template>
  </div>
</template>
