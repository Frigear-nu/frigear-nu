<script setup lang="ts">
import { subscriptionsApi } from '../../../../utils/api'
import type { AdminMembershipResponse as MembershipResponse, AdminPaymentLinkResponse as PaymentLinkResponse } from '../../../../../types'

defineOptions({ name: 'UsersAdminMembership' })

// Rendered by the users admin detail page (`@frigear-nu/users`) in its membership panel.
const props = defineProps<{ user: { id: number, name: string, email: string } }>()
const emit = defineEmits<{ refresh: [] }>()

const t = useModuleT('subscriptions.admin')
const format = useFormat()
const confirm = useConfirmDialog()
const { copy } = useCopyToClipboard()
const toast = useToast()
const grantAction = useAction()
const linkAction = useAction()
const revokeAction = useAction()
const base = computed(() => subscriptionsApi.admin.membership(props.user.id))

// Lazy so the tab renders (with skeletons) immediately and this request runs in parallel with the history request.
const { data, refresh, status } = useLazyFetch<MembershipResponse>(() => base.value, { key: () => `admin-membership-${props.user.id}` })
const loading = computed(() => status.value === 'pending' && !data.value)

const planKey = ref<string | undefined>(undefined)
const endsAt = ref('')
const emailUser = ref(true)
const link = ref<string | null>(null)

const planItems = computed(() => (data.value?.plans ?? []).map(plan => ({ label: plan.label, value: plan.key })))
watchEffect(() => {
  if (!planKey.value && planItems.value.length) planKey.value = planItems.value[0]!.value
})

const current = computed(() => data.value?.current ?? null)
const planLabel = (key: string | null) => planItems.value.find(item => item.value === key)?.label ?? key ?? '–'

const details = computed(() => [
  { key: 'plan', label: t('plan', 'Plan') },
  { key: 'type', label: t('type', 'Type'), value: current.value?.source === 'manual' ? t('free', 'Free of charge') : t('paid', 'Paid (Stripe)') },
  {
    key: 'validUntil',
    label: t('validUntil', 'Valid until'),
    value: current.value?.currentPeriodEnd ? format.date(current.value.currentPeriodEnd) : t('openEnded', 'No end date'),
  },
])

async function changed() {
  await refresh()
  emit('refresh')
}

const grant = () => grantAction.run(async () => {
  await $fetch(base.value, {
    method: 'POST',
    body: { planKey: planKey.value, endsAt: endsAt.value ? new Date(`${endsAt.value}T23:59:59`).toISOString() : null },
  })
  link.value = null
  await changed()
}, { success: t('granted', 'Membership granted.'), error: t('error', 'Something went wrong.') })

async function revoke() {
  const confirmed = await confirm({
    title: t('revokeTitle', 'Revoke the free membership of {name}?', { name: props.user.name }),
    description: t('revokeBody', 'They lose the membership benefits right away. A paid subscription is not affected.'),
    confirmText: t('revokeConfirm', 'Revoke free membership'),
    destructive: true,
  })
  if (!confirmed) return
  await revokeAction.run(async () => {
    await $fetch(base.value, { method: 'DELETE' })
    await changed()
  }, { success: t('revoked', 'Membership revoked.'), error: t('error', 'Something went wrong.') })
}

async function sendLink() {
  const result = await linkAction.run(() => $fetch<PaymentLinkResponse>(subscriptionsApi.admin.paymentLink(props.user.id), {
    method: 'POST',
    body: { planKey: planKey.value, email: emailUser.value },
  }), { error: t('error', 'Something went wrong.') })
  if (!result) return
  link.value = result.url
  toast.add({
    title: result.emailed ? t('linkEmailed', 'Payment link created and emailed.') : t('linkCreated', 'Payment link created.'),
    color: 'success',
    icon: 'i-lucide-check',
  })
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <template v-if="current">
      <DescriptionList
        :items="details"
      >
        <template #plan>
          <UBadge
            variant="subtle"
            :color="current.source === 'manual' ? 'info' : statusColor('active')"
            :label="planLabel(current.planKey)"
          />
        </template>
      </DescriptionList>
      <div v-if="current.source === 'manual'">
        <UButton
          color="error"
          variant="soft"
          size="sm"
          icon="i-lucide-user-x"
          :loading="revokeAction.busy.value"
          :label="t('revoke', 'Revoke free membership')"
          @click="revoke"
        />
      </div>
    </template>
    <div
      v-else-if="loading"
      class="space-y-2"
    >
      <USkeleton class="h-6 w-1/2" />
      <USkeleton class="h-9 w-2/3" />
    </div>
    <p
      v-else
      class="text-muted text-sm"
    >
      {{ t('none', 'No active membership.') }}
    </p>

    <p
      v-if="!loading && current && current.source !== 'manual'"
      class="text-muted text-sm"
    >
      {{ t('paidHint', 'Paid subscriptions are managed in Stripe.') }}
    </p>
    <div
      v-else-if="!loading && planItems.length"
      class="flex flex-col gap-3"
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
          :loading="grantAction.busy.value"
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
          :loading="linkAction.busy.value"
          :label="t('sendLink', 'Send payment link')"
          @click="sendLink"
        />
        <UCheckbox
          v-model="emailUser"
          :label="t('emailUser', 'Email the link to the user')"
        />
      </div>

      <template v-if="link">
        <div class="flex items-center gap-2">
          <UInput
            :model-value="link"
            readonly
            class="flex-1"
          />
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-copy"
            :label="t('copy', 'Copy link')"
            @click="copy(link, t('copied', 'Link copied.'))"
          />
        </div>
        <p class="text-muted text-xs">
          {{ t('linkHint', 'The link is valid for 24 hours.') }}
        </p>
      </template>
    </div>
  </div>
</template>
