<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { ShiftsLadder, ShiftsTeamOption } from '../utils/admin-shifts'
import { shiftsRoleLabel } from '../utils/admin-shifts'
import { shiftsApi } from '../../utils/api'
import type { ShiftBroadcastDto } from '../../../types'
import { computed, h, resolveComponent, tableUi, useFetch, useModuleT, useShiftsActions, useShiftsFormat, useShiftsTranslate } from '#imports'

defineOptions({ name: 'ShiftBroadcastsCard' })

// The messages sent to the people of an operation, newest first, and the button to send one. Only for staff with
// `shifts:broadcast`: others get a 403 from the history, and the card stays out of the way.
const props = defineProps<{ operationId: string, teams: ShiftsTeamOption[], ladders: ShiftsLadder[] }>()

const t = useModuleT('shifts')
const tr = useShiftsTranslate()
const format = useShiftsFormat()
const actions = useShiftsActions()

const { data: broadcasts, status, error, refresh } = await useFetch<ShiftBroadcastDto[]>(shiftsApi.admin.broadcasts, {
  query: computed(() => ({ operationId: props.operationId })),
  key: computed(() => `shifts:broadcasts:${props.operationId}`),
  default: () => [],
})
const allowed = computed(() => error.value?.statusCode !== 403)

async function send() {
  if (await actions.broadcast(props.operationId, { teams: props.teams, ladders: props.ladders })) await refresh()
}

const StatusBadge = resolveComponent('StatusBadge')
const audience = (item: ShiftBroadcastDto) => {
  if (item.shiftId) return t('broadcast.audienceShift', 'People on a shift')
  const team = item.teamId ? props.teams.find(candidate => candidate.id === item.teamId) : undefined
  const base = team ? tr(team.name) : t('admin.allTeams', 'All teams')
  return item.teamRole ? `${base} · ${shiftsRoleLabel(props.ladders, team?.kind, item.teamRole, tr)}+` : base
}
const columns = computed<TableColumn<ShiftBroadcastDto>[]>(() => [
  { accessorKey: 'createdAt', header: t('broadcast.when', 'Sent'), cell: ({ row }) => h('span', { class: 'tabular-nums' }, format.dateTime(row.original.createdAt)) },
  { accessorKey: 'subject', header: t('broadcast.subject', 'Subject'), cell: ({ row }) => h('span', { class: 'text-highlighted font-medium' }, tr(row.original.subject)) },
  { id: 'audience', header: t('broadcast.audience', 'To'), cell: ({ row }) => audience(row.original) },
  { accessorKey: 'recipientCount', header: t('broadcast.recipients', 'People'), cell: ({ row }) => String(row.original.recipientCount) },
  {
    id: 'channels',
    header: t('broadcast.channels', 'Sent by'),
    cell: ({ row }) => h('div', { class: 'flex gap-1' }, row.original.channels.map(channel => h(StatusBadge, { key: channel, status: channel, label: channel === 'sms' ? t('broadcast.channelSms', 'Text') : t('broadcast.channelEmail', 'Email'), colors: { email: 'neutral', sms: 'warning' } }))),
  },
])
</script>

<template>
  <TableCard
    v-if="allowed"
    :title="t('broadcast.cardTitle', 'Messages')"
    :description="t('broadcast.cardDescription', 'Emails to the people on the operation\'s teams. A text message is sent only when you ask for it.')"
    :loading="status === 'pending' && !broadcasts.length"
  >
    <template #actions>
      <UButton
        icon="i-lucide-send"
        :label="t('broadcast.title', 'Message teams')"
        :disabled="!teams.length"
        @click="send"
      />
    </template>
    <UTable
      :data="broadcasts"
      :columns="columns"
      :ui="tableUi()"
    >
      <template #empty>
        <UEmpty
          icon="i-lucide-megaphone"
          :title="t('broadcast.empty', 'No messages sent yet')"
          :description="t('broadcast.emptyDescription', 'Message a team, or the people with a role and up on it.')"
          :actions="[{ label: t('broadcast.title', 'Message teams'), icon: 'i-lucide-send', onClick: send }]"
        />
      </template>
    </UTable>
  </TableCard>
</template>
