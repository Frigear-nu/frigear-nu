<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { NotificationChannel, NotificationChannelsDto, NotificationChannelsRow } from '@frigear-nu/notify/types'
import { NOTIFICATION_CHANNELS, readTranslated } from '@frigear-nu/notify/utils'
import { preferencesApi } from '../../utils/api'
import { $fetch, computed, errorMessage, reactive, tableUi, useCachedFetch, useErrorToast, useModuleT, useNuxtApp, useToast } from '#imports'

defineOptions({ name: 'PreferencesNotificationsPage' })

// No container: under `/account/**` the `account` layout provides it. The page renders its own heading, from the
// same keys as its account menu item, so title and navigation label cannot drift.
const t = useModuleT('preferences.notifications')
const tm = useModuleT('preferences.menu.notifications')
const toast = useToast()
const showError = useErrorToast()
const { $i18n } = useNuxtApp() as unknown as { $i18n?: { locale: { value: string }, te?: (key: string) => boolean, t: (key: string) => string } }

const { data: matrix, error, loading, refresh } = await useCachedFetch<NotificationChannelsDto>(preferencesApi.notifications, { key: 'preferences-notification-channels' })

const CHANNELS = NOTIFICATION_CHANNELS
const topics = computed(() => matrix.value?.topics ?? [])
const offersSms = computed(() => topics.value.some(row => row.channels.includes('sms')))
const offersPush = computed(() => topics.value.some(row => row.channels.includes('push')))

// A topic names its text with a plain/translated value or an i18n key of the module that registered it.
const locale = computed(() => $i18n?.locale.value ?? 'en')
const topicText = (key: string | undefined, value: NotificationChannelsRow['label'] | undefined) =>
  key && $i18n?.te?.(key) ? $i18n.t(key) : readTranslated(value, locale.value)

const offered = (row: NotificationChannelsRow, channel: NotificationChannel) => row.channels.includes(channel)
// SMS needs a phone number; a channel the topic does not use cannot be switched. Push is never blocked: the choice also
// applies to a device registered later.
// A row's switches wait while a change to it is saved, so its changes reach the server one at a time.
const saving = reactive(new Set<string>())
const disabled = (row: NotificationChannelsRow, channel: NotificationChannel) =>
  saving.has(row.id) || !offered(row, channel) || (channel === 'sms' && matrix.value?.hasPhone === false)

const columns = computed<TableColumn<NotificationChannelsRow>[]>(() => [
  { id: 'topic', header: t('topic', 'Message') },
  ...CHANNELS.map(channel => ({ id: channel, header: t(`channels.${channel}`, { email: 'Email', sms: 'SMS', push: 'Push' }[channel]), meta: { class: { th: 'w-24 text-center', td: 'w-24 text-center' } } })),
])

async function change(row: NotificationChannelsRow, channel: NotificationChannel, value: boolean) {
  if (saving.has(row.id)) return
  saving.add(row.id)
  const previous = row.settings[channel]
  row.settings[channel] = value
  try {
    matrix.value = await $fetch<NotificationChannelsDto>(preferencesApi.notifications, { method: 'PATCH', body: { topics: { [row.id]: { [channel]: value } } } })
    toast.add({ title: t('updated', 'Notifications updated'), description: topicText(row.labelKey, row.label), color: 'success', icon: 'i-lucide-check' })
  }
  catch (e) {
    row.settings[channel] = previous
    showError(e, t('saveFailed', 'Could not update your notifications'))
  }
  finally {
    saving.delete(row.id)
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

      <p
        v-if="offersPush"
        class="text-muted text-sm"
      >
        {{ t('pushHint', 'Push notifications arrive in the app once you sign in there and allow notifications.') }}
      </p>
    </template>
  </div>
</template>
