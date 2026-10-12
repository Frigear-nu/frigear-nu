<script setup lang="ts">
import type { MeResponse } from '../../../types'

defineOptions({ name: 'UsersAdminMembershipTab' })

// The "Subscription" tab of the `admin.users` area (`@frigear-nu/users`): grant/revoke/payment link plus the
// user's whole subscription history.
const props = defineProps<{ user: { id: number, name: string, email: string } }>()
const emit = defineEmits<{ refresh: [] }>()

const t = useModuleT('subscriptions.admin')

// Lazy: both requests of this tab (this one and the membership panel's) start immediately and in parallel.
const { data: history, refresh: refreshHistory, status } = useLazyFetch<MeResponse>(
  () => `/api/admin/users/${props.user.id}/subscriptions`,
  { key: () => `admin-subscriptions-${props.user.id}` },
)

const date = (value: string | null) => value ? new Date(value).toLocaleDateString() : '–'
const columns = computed(() => [
  { accessorKey: 'planKey', header: t('history.plan', 'Plan'), cell: ({ row }: { row: { original: { planKey: string | null, priceId: string } } }) => row.original.planKey ?? row.original.priceId },
  { accessorKey: 'status', header: t('history.status', 'Status') },
  { accessorKey: 'source', header: t('history.source', 'Source'), cell: ({ row }: { row: { original: { source?: string } } }) => row.original.source === 'manual' ? t('free', 'Free of charge') : t('paid', 'Paid (Stripe)') },
  { accessorKey: 'currentPeriodStart', header: t('history.started', 'Started'), cell: ({ row }: { row: { original: { currentPeriodStart: string | null } } }) => date(row.original.currentPeriodStart) },
  { accessorKey: 'currentPeriodEnd', header: t('history.periodEnd', 'Period end'), cell: ({ row }: { row: { original: { currentPeriodEnd: string | null } } }) => date(row.original.currentPeriodEnd) },
  { accessorKey: 'endedAt', header: t('history.ended', 'Ended'), cell: ({ row }: { row: { original: { endedAt: string | null } } }) => date(row.original.endedAt) },
])

async function changed() {
  await refreshHistory()
  emit('refresh')
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <AdminSection :title="t('membership', 'Membership')">
      <UsersAdminMembership
        :user="user"
        @refresh="changed"
      />
    </AdminSection>

    <AdminSection :title="t('history.title', 'Subscription history')">
      <template #flush>
        <UTable
          :data="history?.subscriptions ?? []"
          :columns="columns"
          :loading="status === 'pending'"
        >
          <template #empty>
            <AdminEmpty
              icon="i-lucide-badge-check"
              :title="t('history.empty', 'No subscriptions yet.')"
            />
          </template>
        </UTable>
      </template>
    </AdminSection>
  </div>
</template>
