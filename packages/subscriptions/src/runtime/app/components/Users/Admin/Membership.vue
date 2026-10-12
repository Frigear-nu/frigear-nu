<script setup lang="ts">
import type { AdminMembershipResponse, AdminPaymentLinkResponse } from '../../../../../types'

defineOptions({ name: 'UsersAdminMembership' })

// Rendered by the users admin detail page (`@frigear-nu/users`) in its membership panel.
const props = defineProps<{ user: { id: number, name: string, email: string } }>()
const emit = defineEmits<{ refresh: [] }>()

const t = useModuleT('subscriptions.admin')
const toast = useToast()
const base = computed(() => `/api/admin/users/${props.user.id}/subscription`)

// Lazy so the tab renders (with skeletons) immediately and this request runs in parallel with the history request.
const { data, refresh, status } = useLazyFetch<AdminMembershipResponse>(() => base.value, { key: () => `admin-membership-${props.user.id}` })
const loading = computed(() => status.value === 'pending' && !data.value)

const planKey = ref<string | undefined>(undefined)
const endsAt = ref('')
const emailUser = ref(true)
const link = ref<string | null>(null)
const busy = ref<'grant' | 'link' | 'revoke' | null>(null)

const planItems = computed(() => (data.value?.plans ?? []).map(plan => ({ label: plan.label, value: plan.key })))
watchEffect(() => {
  if (!planKey.value && planItems.value.length) planKey.value = planItems.value[0]!.value
})

const current = computed(() => data.value?.current ?? null)
const planLabel = (key: string | null) => planItems.value.find(item => item.value === key)?.label ?? key ?? '–'
const formatDate = (value: string) => new Date(value).toLocaleDateString()

function fail(cause: unknown) {
  toast.add({ title: (cause as { statusMessage?: string }).statusMessage ?? t('error', 'Something went wrong.'), color: 'error' })
}

async function changed() {
  await refresh()
  emit('refresh')
}

async function run(kind: 'grant' | 'link' | 'revoke', action: () => Promise<void>) {
  busy.value = kind
  try {
    await action()
  }
  catch (cause) {
    fail(cause)
  }
  finally {
    busy.value = null
  }
}

const grant = () => run('grant', async () => {
  await $fetch(base.value, {
    method: 'POST',
    body: { planKey: planKey.value, endsAt: endsAt.value ? new Date(`${endsAt.value}T23:59:59`).toISOString() : null },
  })
  link.value = null
  toast.add({ title: t('granted', 'Membership granted.'), color: 'success' })
  await changed()
})

const revoke = () => run('revoke', async () => {
  await $fetch(base.value, { method: 'DELETE' })
  toast.add({ title: t('revoked', 'Membership revoked.'), color: 'success' })
  await changed()
})

const sendLink = () => run('link', async () => {
  const result = await $fetch<AdminPaymentLinkResponse>(`${base.value}/payment-link`, {
    method: 'POST',
    body: { planKey: planKey.value, email: emailUser.value },
  })
  link.value = result.url
  toast.add({ title: result.emailed ? t('linkEmailed', 'Payment link created and emailed.') : t('linkCreated', 'Payment link created.'), color: 'success' })
})

async function copy() {
  if (!link.value) return
  try {
    await navigator.clipboard.writeText(link.value)
    toast.add({ title: t('copied', 'Link copied.'), color: 'success' })
  }
  catch (cause) {
    fail(cause)
  }
}
</script>

<template>
  <div class="space-y-4">
    <div
      v-if="loading"
      class="space-y-2"
    >
      <USkeleton class="h-6 w-1/2" />
      <USkeleton class="h-9 w-2/3" />
    </div>
    <div
      v-else
      class="flex flex-wrap items-center gap-2 text-sm"
    >
      <template v-if="current">
        <UBadge
          variant="subtle"
          :color="current.source === 'manual' ? 'info' : 'success'"
          :label="planLabel(current.planKey)"
        />
        <span class="text-muted">
          {{ current.source === 'manual' ? t('free', 'Free of charge') : t('paid', 'Paid (Stripe)') }}
          ·
          {{ current.currentPeriodEnd ? t('until', 'until {date}', { date: formatDate(current.currentPeriodEnd) }) : t('openEnded', 'No end date') }}
        </span>
        <UButton
          v-if="current.source === 'manual'"
          color="error"
          variant="soft"
          size="sm"
          icon="i-lucide-user-x"
          :loading="busy === 'revoke'"
          :label="t('revoke', 'Revoke free membership')"
          @click="revoke"
        />
      </template>
      <p
        v-else
        class="text-muted"
      >
        {{ t('none', 'No active membership.') }}
      </p>
    </div>

    <p
      v-if="!loading && current && current.source !== 'manual'"
      class="text-muted text-sm"
    >
      {{ t('paidHint', 'Paid subscriptions are managed in Stripe.') }}
    </p>
    <div
      v-else-if="!loading && planItems.length"
      class="space-y-3"
    >
      <div class="flex flex-wrap items-end gap-3">
        <UFormField :label="t('plan', 'Plan')">
          <USelect
            v-model="planKey"
            :items="planItems"
            :placeholder="t('planPlaceholder', 'Choose a plan')"
            class="min-w-48"
          />
        </UFormField>
        <UFormField :label="t('endsAt', 'Ends on (optional)')">
          <UInput
            v-model="endsAt"
            type="date"
          />
        </UFormField>
        <UButton
          icon="i-lucide-gift"
          :disabled="!planKey"
          :loading="busy === 'grant'"
          :label="t('grant', 'Grant free')"
          @click="grant"
        />
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-link"
          :disabled="!planKey"
          :loading="busy === 'link'"
          :label="t('sendLink', 'Send payment link')"
          @click="sendLink"
        />
        <UCheckbox
          v-model="emailUser"
          :label="t('emailUser', 'Email the link to the user')"
        />
      </div>

      <div
        v-if="link"
        class="flex items-center gap-2"
      >
        <UInput
          :model-value="link"
          readonly
          class="flex-1"
        />
        <UButton
          color="neutral"
          variant="soft"
          icon="i-lucide-copy"
          :label="t('copy', 'Copy link')"
          @click="copy"
        />
      </div>
      <p
        v-if="link"
        class="text-muted text-xs"
      >
        {{ t('linkHint', 'The link is valid for 24 hours.') }}
      </p>
    </div>
  </div>
</template>
