<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { MeResponse } from '../../../types'

defineOptions({ name: 'UsersAdminMembershipTab' })

// The "Membership" tab of the `admin.users` area (`@frigear-nu/users`): grant/revoke/payment link plus the
// user's whole subscription history.
const props = defineProps<{ user: { id: number, name: string, email: string } }>()
const emit = defineEmits<{ refresh: [] }>()

type Row = MeResponse['subscriptions'][number]

const t = useModuleT('subscriptions.admin')
const format = useFormat()
const StatusBadge = resolveComponent('StatusBadge')

// Lazy: both requests of this tab (this one and the membership panel's) start immediately and in parallel.
const { data: history, refresh: refreshHistory, status, error } = useLazyFetch<MeResponse>(
  () => `/api/admin/users/${props.user.id}/subscriptions`,
  { key: () => `admin-subscriptions-${props.user.id}` },
)

// Only the first load blanks the table; a refresh keeps the rows on screen.
const loading = computed(() => status.value === 'pending' && !history.value)
const date = (value: string | null) => format.date(value) || emptyCell()
const columns = computed<TableColumn<Row>[]>(() => [
  { accessorKey: 'planKey', header: t('history.plan', 'Plan'), cell: ({ row }) => row.original.planKey ?? row.original.priceId },
  { accessorKey: 'status', header: t('history.status', 'Status'), cell: ({ row }) => h(StatusBadge, { status: row.original.status }) },
  { accessorKey: 'source', header: t('history.source', 'Source'), cell: ({ row }) => row.original.source === 'manual' ? t('free', 'Free of charge') : t('paid', 'Paid (Stripe)') },
  { accessorKey: 'currentPeriodStart', header: t('history.started', 'Started'), cell: ({ row }) => date(row.original.currentPeriodStart) },
  { accessorKey: 'currentPeriodEnd', header: t('history.periodEnd', 'Period end'), cell: ({ row }) => date(row.original.currentPeriodEnd) },
  { accessorKey: 'endedAt', header: t('history.ended', 'Ended'), cell: ({ row }) => date(row.original.endedAt) },
])

async function changed() {
  await refreshHistory()
  emit('refresh')
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <SectionCard :title="t('membership', 'Membership')">
      <UsersAdminMembership
        :user="user"
        @refresh="changed"
      />
    </SectionCard>

    <TableCard
      :title="t('history.title', 'Subscription history')"
      :loading="loading"
      :refreshing="status === 'pending' && !loading"
    >
      <UTable
        :data="history?.subscriptions ?? []"
        :columns="columns"
        :ui="tableUi({ tr: '' })"
      >
        <template #empty>
          <UEmpty
            v-if="error"
            variant="naked"
            icon="i-lucide-circle-alert"
            :title="t('history.loadFailed', 'The subscription history could not be loaded')"
            :description="errorMessage(error, '')"
          />
          <UEmpty
            v-else
            variant="naked"
            icon="i-lucide-badge-check"
            :title="t('history.empty', 'No subscriptions yet.')"
          />
        </template>
      </UTable>
    </TableCard>
  </div>
</template>
