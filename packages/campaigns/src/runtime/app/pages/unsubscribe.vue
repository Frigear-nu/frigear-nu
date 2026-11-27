<script setup lang="ts">
import type { CampaignUnsubscribeResultDto } from '../../../types'
import { campaignsApi } from '../../utils/api'
import { $fetch, computed, errorMessage, ref, useCampaignsLinks, useCampaignsTranslate, useModuleT, useRoute, useSeoMeta } from '#imports'

defineOptions({ name: 'CampaignsUnsubscribePage' })

// The page of the unsubscribe link in a message (`?token=…`). Opening it changes nothing, since link scanners open
// links too: the button posts the token. Mail apps that support one-click unsubscribe post to the API themselves.
const t = useModuleT('campaigns')
const tr = useCampaignsTranslate()
const links = useCampaignsLinks()
const route = useRoute()
useSeoMeta({ robots: 'noindex, nofollow' })

const token = computed(() => typeof route.query.token === 'string' ? route.query.token : '')
const busy = ref(false)
const result = ref<CampaignUnsubscribeResultDto>()
// The token of a message to a user turns a channel of their `campaigns.message` notifications off instead of a list.
const topicResult = computed(() => result.value && 'topic' in result.value ? result.value : undefined)
const listResult = computed(() => result.value && 'list' in result.value ? result.value : undefined)
const failure = ref<unknown>()
const failureCode = computed(() => (failure.value as { data?: { data?: { code?: string } } } | undefined)?.data?.data?.code)

async function unsubscribe() {
  busy.value = true
  failure.value = undefined
  try {
    result.value = await $fetch<CampaignUnsubscribeResultDto>(campaignsApi.unsubscribe(token.value), { method: 'POST' })
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
          {{ t('unsubscribe.title', 'Unsubscribe') }}
        </h1>
        <p class="text-sm text-muted">
          {{ t('unsubscribe.description', 'Stop getting messages from a list.') }}
        </p>
      </div>
      <UAlert
        v-if="topicResult"
        icon="i-lucide-circle-check"
        color="success"
        variant="subtle"
        :title="t('unsubscribe.doneTopic', 'You will not get these messages by {channel} any more', { channel: t(`unsubscribe.channels.${topicResult.channel}`, topicResult.channel) })"
        :description="t('unsubscribe.doneTopicDescription', 'Turn them on again in your notification settings.')"
      />
      <UAlert
        v-else-if="listResult"
        icon="i-lucide-circle-check"
        color="success"
        variant="subtle"
        :title="t('unsubscribe.done', 'You are unsubscribed from {list}', { list: tr(listResult.list.name) })"
        :description="t('unsubscribe.doneDescription', 'You will not get its messages any more. You can sign up again at any time.')"
        :actions="links.account() ? [{ label: t('confirm.manage', 'Manage your subscriptions'), to: links.account(), color: 'neutral', variant: 'outline' }] : []"
      />
      <UEmpty
        v-else-if="!token"
        icon="i-lucide-link-2-off"
        :title="t('unsubscribe.noToken', 'This link is incomplete')"
        :description="t('unsubscribe.noTokenDescription', 'Open the unsubscribe link from the message again, or copy all of it into the address bar.')"
      />
      <template v-else>
        <UAlert
          v-if="failure"
          icon="i-lucide-circle-alert"
          color="error"
          variant="subtle"
          class="mb-4"
          :title="failureCode === 'invalid_token' ? t('unsubscribe.invalid', 'This link does not work') : t('unsubscribe.failed', 'You could not be unsubscribed')"
          :description="failureCode === 'invalid_token' ? t('unsubscribe.invalidDescription', 'Open the link from the message again, or copy all of it into the address bar.') : errorMessage(failure, '')"
        />
        <SectionCard :title="t('unsubscribe.cardTitle', 'Unsubscribe from this list')">
          <p class="text-muted text-sm">
            {{ t('unsubscribe.explanation', 'You will stop getting its messages at this address or phone number.') }}
          </p>
          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton
                :loading="busy"
                color="error"
                icon="i-lucide-bell-off"
                :label="t('unsubscribe.action', 'Unsubscribe')"
                @click="unsubscribe"
              />
            </div>
          </template>
        </SectionCard>
      </template>
    </div>
  </UContainer>
</template>
