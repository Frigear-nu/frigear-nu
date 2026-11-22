<script setup lang="ts">
import { channels } from '#inbox/registry'
import type { InboxThreadDto } from '../../../types'
import { inboxApi } from '../../utils/api'
import { $fetch, computed, ref, useAction, useInboxTranslate, useModuleT } from '#imports'

defineOptions({ name: 'InboxComposer' })

// The reply box of a thread: a reply goes out through the thread's channel; a note stays with staff. Emits `sent`
// after either was saved.
const props = defineProps<{ thread: InboxThreadDto, disabled?: boolean }>()
const emit = defineEmits<{ sent: [] }>()

const t = useModuleT('inbox')
const tr = useInboxTranslate()
const { busy, run } = useAction()
const mode = ref<'reply' | 'note'>('reply')
const body = ref('')
const channelLabel = computed(() => tr(channels[props.thread.channel]?.label) || props.thread.channel)
const modes = computed(() => [
  { label: t('composer.reply', 'Reply'), value: 'reply', icon: 'i-lucide-reply' },
  { label: t('composer.note', 'Internal note'), value: 'note', icon: 'i-lucide-sticky-note' },
])

async function send(status?: 'pending' | 'closed') {
  const text = body.value.trim()
  if (!text) return
  const done = await run(
    () => mode.value === 'reply'
      ? $fetch(inboxApi.admin.messages(props.thread.id), { method: 'POST', body: { body: text, ...(status ? { status } : {}) } })
      : $fetch(inboxApi.admin.notes(props.thread.id), { method: 'POST', body: { body: text } }),
    { success: mode.value === 'reply' ? t('composer.sent', 'Reply sent by {channel}', { channel: channelLabel.value }) : t('composer.noted', 'Note added') },
  )
  if (!done) return
  body.value = ''
  emit('sent')
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <UTabs
      v-model="mode"
      :items="modes"
      :content="false"
      size="sm"
      class="w-fit"
    />
    <UTextarea
      v-model="body"
      :rows="4"
      autoresize
      :disabled="disabled"
      :placeholder="mode === 'reply' ? t('composer.replyPlaceholder', 'Write a reply. It goes out by {channel}.', { channel: channelLabel }) : t('composer.notePlaceholder', 'Write a note for the team. It is never sent.')"
      :aria-label="mode === 'reply' ? t('composer.reply', 'Reply') : t('composer.note', 'Internal note')"
      class="w-full"
    />
    <div class="flex flex-wrap justify-end gap-2">
      <UButton
        v-if="mode === 'reply'"
        color="neutral"
        variant="outline"
        :disabled="disabled || !body.trim()"
        :loading="busy"
        :label="t('composer.sendAndClose', 'Send and close')"
        @click="send('closed')"
      />
      <UButton
        :icon="mode === 'reply' ? 'i-lucide-send' : 'i-lucide-sticky-note'"
        :disabled="disabled || !body.trim()"
        :loading="busy"
        :label="mode === 'reply' ? t('composer.send', 'Send reply') : t('composer.addNote', 'Add note')"
        @click="send()"
      />
    </div>
  </div>
</template>
