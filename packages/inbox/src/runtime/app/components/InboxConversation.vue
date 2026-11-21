<script setup lang="ts">
import type { InboxMessageDto } from '../../../types'
import { useFormat, useModuleT } from '#imports'

defineOptions({ name: 'InboxConversation' })

// The messages of a thread, oldest first: the contact's on the left, replies on the right, internal notes in a
// highlighted box that says they were never sent.
defineProps<{ messages: InboxMessageDto[], contactName?: string | null }>()
const t = useModuleT('inbox')
const format = useFormat()
</script>

<template>
  <ol class="flex flex-col gap-3">
    <li
      v-for="message in messages"
      :key="message.id"
      class="flex"
      :class="message.direction === 'in' ? 'justify-start' : 'justify-end'"
    >
      <div
        class="max-w-[85%] rounded-lg px-3 py-2 text-sm"
        :class="{
          'bg-elevated': message.direction === 'in',
          'bg-primary/10': message.direction === 'out',
          'border border-dashed border-warning/60 bg-warning/10': message.direction === 'note',
        }"
        :data-direction="message.direction"
      >
        <div class="mb-1 flex flex-wrap items-center gap-x-2 text-xs text-muted">
          <UIcon
            v-if="message.direction === 'note'"
            name="i-lucide-sticky-note"
            class="size-3.5"
          />
          <span class="font-medium text-highlighted">
            {{ message.direction === 'in' ? (contactName || t('contact.anonymous', 'Unnamed contact')) : (message.author?.name ?? t('thread.staff', 'Staff')) }}
          </span>
          <span v-if="message.direction === 'note'">{{ t('thread.noteLabel', 'Internal note, not sent') }}</span>
          <time
            class="tabular-nums"
            :datetime="message.createdAt"
          >{{ format.dateTime(message.createdAt) }}</time>
        </div>
        <p
          v-if="message.cc?.length"
          class="mb-1 text-xs text-muted"
          data-cc
        >
          {{ t('thread.cc', 'Cc: {recipients}', { recipients: message.cc.join(', ') }) }}
        </p>
        <p
          v-if="message.body"
          class="whitespace-pre-wrap break-words"
        >
          {{ message.body }}
        </p>
        <p
          v-else
          class="italic text-muted"
        >
          {{ t('thread.removed', 'Removed under the retention policy or on request.') }}
        </p>
        <ul
          v-if="message.attachments.length"
          class="mt-2 flex flex-wrap gap-1.5"
        >
          <li
            v-for="(file, index) in message.attachments"
            :key="index"
          >
            <UBadge
              color="neutral"
              variant="subtle"
              icon="i-lucide-paperclip"
              :label="file.filename"
            />
          </li>
        </ul>
      </div>
    </li>
  </ol>
</template>
