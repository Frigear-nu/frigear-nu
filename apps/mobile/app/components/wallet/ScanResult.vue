<script setup lang="ts">
import type { ScanOutcome, ScanTone } from '~/composables/useScanCheck'

// The result of one scan: a big verdict in green, amber or red that reads at arm's length, then what the website said
// about the code. For a Frigear ID: photo, name, ID number, roles, membership and current crew teams.
const props = defineProps<{ outcome: ScanOutcome }>()

const { t } = useI18n()
const format = useFormat()
const host = useMobileHost()

const tones: Record<ScanTone, { class: string, icon: string }> = {
  success: { class: 'bg-success text-inverted', icon: 'i-lucide-circle-check' },
  warning: { class: 'bg-warning text-inverted', icon: 'i-lucide-triangle-alert' },
  error: { class: 'bg-error text-inverted', icon: 'i-lucide-circle-x' },
}
const tone = computed(() => tones[props.outcome.tone])

const identity = computed(() => props.outcome.identity)
const avatar = computed(() => {
  const value = identity.value?.user.avatar
  return value ? host.url(value) : undefined
})
const membership = computed(() => {
  const value = identity.value?.membership
  if (!value) return null
  if (!value.active) return { title: t('app.wallet.scan.id.noMembershipShort'), description: value.status ? t(`app.wallet.scan.id.subscription.${value.status}`, value.status) : undefined }
  return {
    title: value.planLabel ?? value.planKey ?? t('app.wallet.scan.id.memberShort'),
    description: value.validUntil ? t('app.wallet.scan.id.validUntil', { date: format.date(value.validUntil) }) : undefined,
  }
})
</script>

<template>
  <section
    class="overflow-hidden rounded-xl border border-default bg-default"
    :data-scan-result="outcome.tone"
  >
    <div
      class="flex items-center gap-3 p-4"
      :class="tone.class"
    >
      <UIcon
        :name="tone.icon"
        class="size-10 shrink-0"
      />
      <div class="min-w-0">
        <p class="text-xl font-bold leading-tight">
          {{ outcome.title }}
        </p>
        <p
          v-if="outcome.description"
          class="text-sm opacity-90"
        >
          {{ outcome.description }}
        </p>
      </div>
    </div>

    <div
      v-if="identity"
      class="flex flex-col gap-4 p-4"
    >
      <div class="flex items-center gap-4">
        <UAvatar
          :src="avatar"
          :alt="identity.user.name ?? ''"
          icon="i-lucide-user"
          class="size-20 text-3xl"
        />
        <div class="min-w-0">
          <p class="truncate text-lg font-semibold text-highlighted">
            {{ identity.user.name ?? t('app.wallet.scan.id.noName') }}
          </p>
          <p class="text-sm text-muted tabular-nums">
            {{ t('app.wallet.id.number', { id: identity.user.id }) }}
          </p>
          <div
            v-if="identity.roles.length"
            class="mt-1 flex flex-wrap gap-1"
          >
            <UBadge
              v-for="role in identity.roles"
              :key="role.key"
              :label="t(`app.wallet.scan.id.roles.${role.key}`, role.label)"
              color="neutral"
              variant="subtle"
            />
          </div>
        </div>
      </div>

      <dl class="flex flex-col gap-3 text-sm">
        <div v-if="membership">
          <dt class="text-muted">
            {{ t('app.wallet.scan.id.membership') }}
          </dt>
          <dd class="font-medium text-highlighted">
            {{ membership.title }}
          </dd>
          <dd
            v-if="membership.description"
            class="text-muted"
          >
            {{ membership.description }}
          </dd>
        </div>
        <div>
          <dt class="text-muted">
            {{ t('app.wallet.scan.id.crew') }}
          </dt>
          <dd
            v-if="!identity.crew.length"
            class="text-muted"
          >
            {{ t('app.wallet.scan.id.noCrew') }}
          </dd>
          <dd
            v-for="place in identity.crew"
            :key="`${place.operation.id}-${place.team.id}`"
          >
            <span class="font-medium text-highlighted">{{ place.team.name }}</span>
            <span class="text-muted"> · {{ place.role.label }} · {{ place.operation.name }}</span>
          </dd>
        </div>
      </dl>
    </div>

    <dl
      v-else-if="outcome.details?.length"
      class="flex flex-col gap-3 p-4 text-sm"
    >
      <div
        v-for="detail in outcome.details"
        :key="detail.label"
      >
        <dt class="text-muted">
          {{ detail.label }}
        </dt>
        <dd class="font-medium text-highlighted">
          {{ detail.value }}
        </dd>
      </div>
    </dl>
  </section>
</template>
