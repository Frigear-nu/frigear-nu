<script setup lang="ts">
import type { CampaignSubscriptionResultDto } from '../../../types'
import { campaignsApi } from '../../utils/api'
import { $fetch, computed, errorMessage, ref, useCampaignsLinks, useCampaignsTranslate, useModuleT, useRoute, useSeoMeta } from '#imports'

defineOptions({ name: 'CampaignsConfirmPage' })

// The page of the link in a confirmation message (`?token=…`). Opening it confirms nothing: link scanners and mail
// previews open links too, so the subscription is confirmed by the button, which posts the token. After a plain HTML
// form signup the subscribe route sends people here with `?subscribed=<list>` (and `confirm=1`): "check your inbox".
const t = useModuleT('campaigns')
const tr = useCampaignsTranslate()
const links = useCampaignsLinks()
const route = useRoute()
useSeoMeta({ robots: 'noindex, nofollow' })

const token = computed(() => typeof route.query.token === 'string' ? route.query.token : '')
const subscribed = computed(() => typeof route.query.subscribed === 'string' ? route.query.subscribed : '')
const mustConfirm = computed(() => route.query.confirm === '1')

const busy = ref(false)
const result = ref<CampaignSubscriptionResultDto>()
const failure = ref<unknown>()
const failureCode = computed(() => (failure.value as { data?: { data?: { code?: string } } } | undefined)?.data?.data?.code)

async function confirm() {
  busy.value = true
  failure.value = undefined
  try {
    result.value = await $fetch<CampaignSubscriptionResultDto>(campaignsApi.confirm(token.value), { method: 'POST' })
  }
  catch (error) {
    failure.value = error
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <!-- Centred on the screen like the sign-in pages: a page people land on from a link in a message. -->
  <UContainer class="flex min-h-[calc(100dvh-var(--ui-header-height,4rem))] flex-col items-center justify-center py-12 sm:py-16">
    <div class="flex w-full max-w-md flex-col gap-6">
      <div class="flex flex-col items-center gap-1.5 text-center">
        <h1 class="text-xl font-semibold text-highlighted">
          {{ t('confirm.title', 'Confirm your subscription') }}
        </h1>
        <p class="text-sm text-muted">
          {{ t('confirm.description', 'One click, and your subscription starts.') }}
        </p>
      </div>
      <UAlert
        v-if="result"
        icon="i-lucide-circle-check"
        color="success"
        variant="subtle"
        :title="t('confirm.done', 'You are subscribed to {list}', { list: tr(result.list.name) })"
        :description="t('confirm.doneDescription', 'Every message has a link to unsubscribe again.')"
        :actions="links.account() ? [{ label: t('confirm.manage', 'Manage your subscriptions'), to: links.account(), color: 'neutral', variant: 'outline' }] : []"
      />
      <UAlert
        v-else-if="!token && subscribed"
        icon="i-lucide-mail-check"
        color="success"
        variant="subtle"
        :title="mustConfirm ? t('confirm.checkInbox', 'Check your inbox') : t('confirm.signedUp', 'You are signed up')"
        :description="mustConfirm
          ? t('confirm.checkInboxDescription', 'We sent you a link. Open it and confirm, and your subscription starts.')
          : t('confirm.signedUpDescription', 'Thank you for signing up.')"
      />
      <UEmpty
        v-else-if="!token"
        icon="i-lucide-link-2-off"
        :title="t('confirm.noToken', 'This link is incomplete')"
        :description="t('confirm.noTokenDescription', 'Open the link from the confirmation message again, or copy all of it into the address bar.')"
      />
      <template v-else>
        <UAlert
          v-if="failure"
          icon="i-lucide-circle-alert"
          color="error"
          variant="subtle"
          class="mb-4"
          :title="failureCode === 'token_expired'
            ? t('confirm.expired', 'This link has expired')
            : failureCode === 'invalid_token' ? t('confirm.invalid', 'This link does not work any more') : t('confirm.failed', 'The subscription could not be confirmed')"
          :description="failureCode === 'invalid_token'
            ? t('confirm.invalidDescription', 'It may have been used already. Sign up again if you are not getting messages from the list.')
            : failureCode === 'token_expired' ? t('confirm.expiredDescription', 'Sign up again to get a new link.') : errorMessage(failure, '')"
        />
        <SectionCard :title="t('confirm.cardTitle', 'Confirm your subscription')">
          <p class="text-muted text-sm">
            {{ t('confirm.explanation', 'Confirm that you want messages from this list. You can unsubscribe from every message.') }}
          </p>
          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton
                :loading="busy"
                icon="i-lucide-check"
                :label="t('confirm.action', 'Confirm subscription')"
                @click="confirm"
              />
            </div>
          </template>
        </SectionCard>
      </template>
    </div>
  </UContainer>
</template>
