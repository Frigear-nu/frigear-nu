<script setup lang="ts">
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
import type { PushDeviceDto, PushProvider } from '../../../types'
import { pushApi } from '../../utils/api'
import { pushDeviceProvider } from '../../utils/provider'
import { $fetch, computed, errorMessage, tableUi, useCachedFetch, useConfirmDialog, useErrorToast, useFormat, useModuleT, useToast } from '#imports'

defineOptions({ name: 'PushAccountDevicesPage' })

// The caller's own push devices, with a remove action. No container: under `/account/**` the `account` layout
// provides it. The heading comes from the same keys as the account menu item, so title and navigation cannot drift.
const t = useModuleT('push.account')
const tm = useModuleT('push.menu.devices')
const platforms = useModuleT('push.platforms')
const providers = useModuleT('push.providers')
const format = useFormat()
const toast = useToast()
const showError = useErrorToast()
const confirm = useConfirmDialog()

const { data: devices, error, loading, refresh } = await useCachedFetch<PushDeviceDto[]>(pushApi.me.devices, { key: 'push-my-devices' })

// FCM or APNs; an iOS device registered before providers were stored follows the server default.
const providerLabel = (provider: PushProvider | null) => {
  if (provider === 'apns') return providers('apns', 'APNs')
  if (provider === 'fcm') return providers('fcm', 'FCM')
  return providers('default', 'Server default')
}
const deviceName = (device: PushDeviceDto) => platforms(device.platform, device.platform)

async function remove(device: PushDeviceDto) {
  const confirmed = await confirm({
    title: t('removeConfirm.title', 'Remove this {platform} device?', { platform: deviceName(device) }),
    description: t('removeConfirm.description', 'It stops getting push notifications. Signing in to the app again with notifications allowed adds it back.'),
    confirmText: t('remove', 'Remove device'),
    destructive: true,
  })
  if (!confirmed) return
  try {
    await $fetch(pushApi.me.device(device.id), { method: 'DELETE' })
    toast.add({ title: t('removed', 'Device removed'), description: deviceName(device), color: 'success', icon: 'i-lucide-check' })
    await refresh()
  }
  catch (e) {
    showError(e, t('removeFailed', 'Could not remove the device'))
  }
}

const menu = (device: PushDeviceDto): DropdownMenuItem[][] => [
  [{ label: t('remove', 'Remove device'), icon: 'i-lucide-trash-2', color: 'error', onSelect: () => remove(device) }],
]

const columns = computed<TableColumn<PushDeviceDto>[]>(() => [
  { accessorKey: 'platform', header: t('device', 'Device') },
  { accessorKey: 'provider', header: t('provider', 'Provider') },
  { accessorKey: 'lastSeenAt', header: t('lastSeen', 'Last seen') },
  { accessorKey: 'createdAt', header: t('registered', 'Registered') },
  { id: 'actions', meta: { class: { td: 'w-px text-right' } } },
])
</script>

<template>
  <div class="flex flex-col gap-4">
    <PageHeading
      :title="tm('label', 'Devices')"
      :description="tm('description', 'The phones that get your push notifications.')"
    />

    <UEmpty
      v-if="error"
      icon="i-lucide-circle-alert"
      :title="t('loadFailed', 'Your devices could not be loaded')"
      :description="errorMessage(error, '')"
      :actions="[{ label: t('tryAgain', 'Try again'), icon: 'i-lucide-rotate-ccw', color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
    />

    <TableCard
      v-else
      :title="t('title', 'Your devices')"
      :description="t('description', 'Remove a device you no longer use, or one you do not recognise.')"
      :loading="loading"
    >
      <UTable
        :data="devices ?? []"
        :columns="columns"
        :ui="tableUi({ tr: '' })"
      >
        <template #platform-cell="{ row }">
          <span class="text-highlighted font-medium">{{ deviceName(row.original) }}</span>
        </template>
        <template #provider-cell="{ row }">
          <span class="text-muted">{{ providerLabel(pushDeviceProvider(row.original)) }}</span>
        </template>
        <template #lastSeenAt-cell="{ row }">
          <span class="whitespace-nowrap tabular-nums">{{ format.dateTime(row.original.lastSeenAt) }}</span>
        </template>
        <template #createdAt-cell="{ row }">
          <span class="whitespace-nowrap tabular-nums">{{ format.date(row.original.createdAt) }}</span>
        </template>
        <template #actions-cell="{ row }">
          <RowMenu
            :items="menu(row.original)"
            :subject="deviceName(row.original)"
          />
        </template>
        <template #empty>
          <UEmpty
            variant="naked"
            icon="i-lucide-smartphone"
            :title="t('empty', 'No devices yet')"
            :description="t('emptyDescription', 'Sign in to the app and allow notifications to get push notifications on your phone.')"
          />
        </template>
      </UTable>
    </TableCard>
  </div>
</template>
