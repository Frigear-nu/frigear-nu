<script setup lang="ts">
import type { PaymentDto } from '../../../types'
import { formatMinorAmount } from '../utils/format'

defineOptions({ name: 'UsersAdminLastPayment' })

// Summary card for the `admin.users.overview` widget area of the admin user page (`@frigear-nu/users`).
const props = defineProps<{ user: { id: number } }>()

const t = useModuleT('payments.admin')
const status = useModuleT('payments.status')

const { data: payments } = await useFetch<PaymentDto[]>(
  () => `/api/admin/users/${props.user.id}/payments`,
  { key: () => `admin-last-payment-${props.user.id}`, query: { limit: 1 } },
)
const last = computed(() => payments.value?.[0])
const date = (value: string | null) => value ? new Date(value).toLocaleDateString() : '–'
</script>

<template>
  <div class="border-default flex flex-col gap-2 rounded-lg border p-4">
    <p class="text-muted text-xs font-medium uppercase">
      {{ t('lastPayment', 'Last payment') }}
    </p>
    <div
      v-if="last"
      class="flex flex-wrap items-center gap-2 text-sm"
    >
      <span class="text-highlighted font-medium">{{ formatMinorAmount(last.amount, last.currency) }}</span>
      <UBadge
        variant="subtle"
        :color="last.status === 'paid' ? 'success' : 'neutral'"
        :label="status(last.status, last.status)"
      />
      <span class="text-muted">{{ date(last.paidAt ?? last.createdAt) }}</span>
    </div>
    <p
      v-else
      class="text-muted text-sm"
    >
      {{ t('empty', 'No payments yet.') }}
    </p>
  </div>
</template>
