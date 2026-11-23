<script setup lang="ts">
import { shiftsApi } from '../../utils/api'
import type { ShiftFeedStatusDto, ShiftFeedTokenDto } from '../../../types'
import { $fetch, ref, useAction, useConfirmDialog, useFetch, useModuleT, useShiftsFormat, useToast } from '#imports'

defineOptions({ name: 'ShiftFeedSlideover' })

// "Subscribe in calendar": mints the secret iCal link of my shifts and shows it once (the `webcal://` address opens a
// calendar app, the https one is for apps that ask for a URL), or revokes it. Opened by `useShiftsActions()`.
const emit = defineEmits<{ close: [value: false] }>()

const t = useModuleT('shifts')
const format = useShiftsFormat()
const confirm = useConfirmDialog()
const toast = useToast()
const { busy, run } = useAction()

const { data: status, refresh } = await useFetch<ShiftFeedStatusDto>(shiftsApi.me.feedToken, {
  key: 'shifts:feed-status',
  default: () => ({ active: false, prefix: null, createdAt: null, lastUsedAt: null }),
})
// The link is only known right after it was made: it is stored hashed and never shown again.
const minted = ref<ShiftFeedTokenDto | null>(null)

async function mint() {
  if (status.value.active) {
    const confirmed = await confirm({
      title: t('feed.replaceTitle', 'Replace the calendar link?'),
      description: t('feed.replaceDescription', 'The old link stops working: calendars subscribed to it stop updating until you subscribe with the new one.'),
      confirmText: t('feed.replace', 'Replace link'),
      destructive: true,
    })
    if (!confirmed) return
  }
  const result = await run(
    () => $fetch<ShiftFeedTokenDto>(shiftsApi.me.feedToken, { method: 'POST' }),
    { error: t('feed.mintFailed', 'Could not create the calendar link') },
  )
  if (result) {
    minted.value = result
    await refresh()
  }
}

async function revoke() {
  const confirmed = await confirm({
    title: t('feed.revokeTitle', 'Revoke the calendar link?'),
    description: t('feed.revokeDescription', 'Calendars subscribed to it stop updating. You can create a new link at any time.'),
    confirmText: t('feed.revoke', 'Revoke link'),
    destructive: true,
  })
  if (!confirmed) return
  const done = await run(
    () => $fetch(shiftsApi.me.feedToken, { method: 'DELETE' }).then(() => true),
    { success: t('feed.revoked', 'Revoked the calendar link'), error: t('feed.revokeFailed', 'Could not revoke the calendar link') },
  )
  if (done) {
    minted.value = null
    await refresh()
  }
}

async function copy(value: string) {
  try {
    await navigator.clipboard.writeText(value)
    toast.add({ title: t('feed.copied', 'Copied the link'), color: 'success' })
  }
  catch {
    toast.add({ title: t('feed.copyFailed', 'Could not copy: select the link and copy it by hand'), color: 'error' })
  }
}
</script>

<template>
  <FormSlideover
    form-id="shift-feed-form"
    :title="t('feed.title', 'Subscribe in calendar')"
    :description="t('feed.description', 'Your shifts as a calendar feed for Apple Calendar, Google Calendar or Outlook. The link is secret: anyone who has it can see your shifts.')"
    :submit-label="t('feed.close', 'Close')"
    @close="emit('close', false)"
  >
    <div class="flex flex-col gap-4">
      <template v-if="minted">
        <UAlert
          color="warning"
          variant="subtle"
          icon="i-lucide-eye-off"
          :title="t('feed.onceTitle', 'Copy the link now')"
          :description="t('feed.once', 'It is shown only once. If you lose it, create a new one.')"
        />
        <UFormField :label="t('feed.webcal', 'Calendar app link')">
          <UInput
            :model-value="minted.webcalUrl"
            readonly
            class="w-full"
            :ui="{ trailing: 'pe-1' }"
          >
            <template #trailing>
              <UButton
                color="neutral"
                variant="link"
                size="sm"
                icon="i-lucide-copy"
                :aria-label="t('feed.copy', 'Copy link')"
                @click="copy(minted.webcalUrl)"
              />
            </template>
          </UInput>
        </UFormField>
        <UFormField
          :label="t('feed.https', 'Web address')"
          :description="t('feed.httpsHelp', 'For calendars that ask for a URL.')"
        >
          <UInput
            :model-value="minted.url"
            readonly
            class="w-full"
            :ui="{ trailing: 'pe-1' }"
          >
            <template #trailing>
              <UButton
                color="neutral"
                variant="link"
                size="sm"
                icon="i-lucide-copy"
                :aria-label="t('feed.copy', 'Copy link')"
                @click="copy(minted.url)"
              />
            </template>
          </UInput>
        </UFormField>
        <UButton
          :to="minted.webcalUrl"
          external
          icon="i-lucide-calendar-plus"
          :label="t('feed.open', 'Open in my calendar app')"
          class="self-start"
        />
      </template>
      <UAlert
        v-else-if="status.active"
        color="neutral"
        variant="subtle"
        icon="i-lucide-calendar-check"
        :title="t('feed.active', 'Your calendar link is active')"
        :description="status.lastUsedAt
          ? t('feed.activeSince', 'Made {made}, last read {read}. It is not shown again: replace it to get a new one.', { made: status.createdAt ? format.dateTime(status.createdAt) : '', read: format.dateTime(status.lastUsedAt) })
          : t('feed.activeUnused', 'Made {made}, not read yet. It is not shown again: replace it to get a new one.', { made: status.createdAt ? format.dateTime(status.createdAt) : '' })"
      />
      <p
        v-else
        class="text-muted text-sm"
      >
        {{ t('feed.none', 'You have no calendar link yet.') }}
      </p>

      <div class="flex flex-wrap gap-2">
        <UButton
          :loading="busy"
          :color="minted ? 'neutral' : 'primary'"
          :variant="minted ? 'outline' : 'solid'"
          :icon="status.active ? 'i-lucide-refresh-cw' : 'i-lucide-link'"
          :label="status.active ? t('feed.replace', 'Replace link') : t('feed.create', 'Create calendar link')"
          @click="mint"
        />
        <UButton
          v-if="status.active"
          :disabled="busy"
          color="error"
          variant="outline"
          icon="i-lucide-trash-2"
          :label="t('feed.revoke', 'Revoke link')"
          @click="revoke"
        />
      </div>
    </div>
    <template #footer="{ cancel }">
      <UButton
        :label="t('feed.close', 'Close')"
        color="neutral"
        variant="outline"
        @click="cancel"
      />
    </template>
  </FormSlideover>
</template>
