<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { PushDeviceDto, SendPushResult } from '../../../types'
import { pushApi } from '../../utils/api'
import { $fetch, computed, errorMessage, tableUi, useAction, useFormat, useLazyFetch, useModuleT, useToast } from '#imports'

defineOptions({ name: 'UsersAdminPushDevices' })

// The "Devices" tab of the `admin.users` area (`@frigear-nu/users`): every push device of the user, newest first, with
// a "Send test push" action. Read-only otherwise: devices are the user's own to add and remove.
const props = defineProps<{ user: { id: number } }>()

const t = useModuleT('push.admin')
const platforms = useModuleT('push.platforms')
const format = useFormat()
const toast = useToast()
const { busy, run } = useAction()

// Lazy, so the tab shell renders at once. `loading` is only the first load: a refresh keeps the rows on screen.
const { data: devices, status, error, refresh } = useLazyFetch<PushDeviceDto[]>(
  () => pushApi.admin.userDevices(props.user.id),
  { key: () => `admin-push-devices-${props.user.id}` },
)

const loading = computed(() => status.value === 'pending' && !devices.value)
const columns = computed<TableColumn<PushDeviceDto>[]>(() => [
  { accessorKey: 'platform', header: t('platform', 'Platform') },
  { accessorKey: 'appId', header: t('app', 'App') },
  { accessorKey: 'locale', header: t('locale', 'Language') },
  { accessorKey: 'lastSeenAt', header: t('lastSeen', 'Last seen') },
  { accessorKey: 'createdAt', header: t('registered', 'Registered') },
  { accessorKey: 'revokedAt', header: t('statusColumn', 'Status') },
])

async function sendTest() {
  const result = await run(
    () => $fetch<SendPushResult>(pushApi.admin.test, { method: 'POST', body: { userId: props.user.id } }),
    { error: t('testFailed', 'Could not send the test push') },
  )
  if (!result) return
  const reached = result.sent + result.failed + result.revoked
  toast.add({
    title: t('testSent', 'Test push sent'),
    description: reached
      ? t('testResult', '{sent} sent, {failed} failed, {revoked} revoked.', { ...result })
      : t('testNone', 'The user has no active devices.'),
    color: reached && !result.sent ? 'warning' : 'success',
    icon: 'i-lucide-send',
  })
  await refresh()
}
</script>

<template>
  <TableCard
    :title="t('title', 'Push devices')"
    :loading="loading"
    :refreshing="status === 'pending' && !loading"
  >
    <template #actions>
      <UButton
        icon="i-lucide-send"
        color="neutral"
        variant="outline"
        :loading="busy"
        @click="sendTest"
      >
        {{ t('sendTest', 'Send test push') }}
      </UButton>
    </template>
    <UTable
      :data="devices ?? []"
      :columns="columns"
      :ui="tableUi({ tr: '' })"
    >
      <template #platform-cell="{ row }">
        {{ platforms(row.original.platform, row.original.platform) }}
      </template>
      <template #appId-cell="{ row }">
        <span
          v-if="row.original.appId"
          class="text-muted"
        >{{ row.original.appId }}</span>
        <span
          v-else
          class="text-dimmed"
        >–</span>
      </template>
      <template #locale-cell="{ row }">
        <span
          v-if="row.original.locale"
          class="text-muted"
        >{{ row.original.locale }}</span>
        <span
          v-else
          class="text-dimmed"
        >–</span>
      </template>
      <template #lastSeenAt-cell="{ row }">
        <span class="whitespace-nowrap tabular-nums">{{ format.dateTime(row.original.lastSeenAt) }}</span>
      </template>
      <template #createdAt-cell="{ row }">
        <span class="whitespace-nowrap tabular-nums">{{ format.dateTime(row.original.createdAt) }}</span>
      </template>
      <template #revokedAt-cell="{ row }">
        <StatusBadge
          :status="row.original.revokedAt ? 'revoked' : 'active'"
          :label="row.original.revokedAt ? t('revoked', 'Revoked') : t('active', 'Active')"
        />
      </template>
      <template #empty>
        <UEmpty
          v-if="error"
          icon="i-lucide-circle-alert"
          variant="naked"
          :title="t('loadFailed', 'The devices could not be loaded')"
          :description="errorMessage(error, '')"
        />
        <UEmpty
          v-else
          icon="i-lucide-smartphone"
          variant="naked"
          :title="t('empty', 'No devices registered')"
          :description="t('emptyDescription', 'The user has not signed in to the app with notifications allowed.')"
        />
      </template>
    </UTable>
  </TableCard>
</template>
