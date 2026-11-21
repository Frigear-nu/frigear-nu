<script setup lang="ts">
import { z } from 'zod'
import { channels } from '#inbox/registry'
import type { InboxChannelAccountDto, InboxMailboxDto } from '../../../types'
import { inboxApi } from '../../utils/api'
import { $fetch, computed, reactive, useAction, useInboxTranslate, useModuleT } from '#imports'

defineOptions({ name: 'InboxChannelSlideover' })

// Connects a channel identity to a mailbox, or edits one, opened by `useInboxChannelActions()`: it closes with the saved
// account, or `false`. Secrets are never typed here: `secretRef` names one the server reads from its runtime config.
const props = defineProps<{ account?: InboxChannelAccountDto, mailboxes: InboxMailboxDto[] }>()
const emit = defineEmits<{ close: [saved: InboxChannelAccountDto | false] }>()

const t = useModuleT('inbox')
const tr = useInboxTranslate()
const { busy, run } = useAction()

const config = props.account?.config ?? {}
const fields = (config.fields ?? {}) as Record<string, string>
const state = reactive({
  mailboxId: props.account?.mailboxId ?? props.mailboxes[0]?.id ?? '',
  channel: props.account?.channel ?? 'email',
  address: props.account?.address ?? '',
  secretRef: props.account?.secretRef ?? '',
  enabled: props.account?.enabled ?? true,
  replyTo: typeof config.replyTo === 'string' ? config.replyTo : '',
  nameField: fields.name ?? '',
  emailField: fields.email ?? '',
  messageField: fields.message ?? '',
})

const channelOptions = computed(() => Object.values(channels).map(channel => ({ label: tr(channel.label) || channel.id, value: channel.id, icon: channel.icon })))
const mailboxOptions = computed(() => props.mailboxes.map(mailbox => ({ label: tr(mailbox.name) || mailbox.key, value: mailbox.id })))
const needsSecret = computed(() => ['whatsapp', 'messenger', 'instagram'].includes(state.channel))
const addressHelp = computed(() => ({
  email: t('channels.addressEmail', 'The address people write to, such as info@frigear.nu.'),
  form: t('channels.addressForm', 'The slug of the form, such as contact.'),
  whatsapp: t('channels.addressWhatsapp', 'The phone number id of the WhatsApp Business number (not the phone number).'),
  messenger: t('channels.addressMessenger', 'The id of the Facebook page.'),
  instagram: t('channels.addressInstagram', 'The id of the Instagram professional account.'),
} as Record<string, string>)[state.channel] ?? t('channels.addressOther', 'The identity of the mailbox on this channel.'))

const schema = z.object({
  mailboxId: z.string().min(1, t('channels.mailboxRequired', 'Choose a mailbox.')),
  channel: z.string().min(1),
  address: z.string().trim().min(1, t('channels.addressRequired', 'Fill in the address.')),
  secretRef: z.string().trim().regex(/^$|^[A-Z][A-Z0-9_]{0,63}$/, t('channels.secretRefHelp', 'Upper case letters, digits and "_", such as WHATSAPP_TOKEN.')),
})

function buildConfig(): Record<string, unknown> {
  const next: Record<string, unknown> = { ...config }
  delete next.replyTo
  delete next.fields
  if (state.replyTo.trim()) next.replyTo = state.replyTo.trim()
  if (state.channel === 'form') {
    const mapped = Object.fromEntries(Object.entries({ name: state.nameField, email: state.emailField, message: state.messageField }).filter(([, value]) => value.trim()).map(([key, value]) => [key, value.trim()]))
    if (Object.keys(mapped).length) next.fields = mapped
  }
  return next
}

async function save() {
  const body = { address: state.address.trim(), secretRef: state.secretRef.trim() || null, enabled: state.enabled, config: buildConfig() }
  const saved = await run(
    () => props.account
      ? $fetch<InboxChannelAccountDto>(inboxApi.admin.channel(props.account.id), { method: 'PATCH', body })
      : $fetch<InboxChannelAccountDto>(inboxApi.admin.channels, { method: 'POST', body: { ...body, mailboxId: state.mailboxId, channel: state.channel } }),
    { success: props.account ? t('channels.saved', 'Saved {address}', { address: body.address }) : t('channels.connected', 'Connected {address}', { address: body.address }) },
  )
  if (saved) emit('close', saved)
}
</script>

<template>
  <FormSlideover
    form-id="inbox-channel-form"
    :title="account ? t('settings.editChannel', 'Edit channel') : t('settings.addChannel', 'Connect channel')"
    :description="account ? undefined : t('channels.description', 'Messages to this address land in the mailbox, and replies go out the same way.')"
    :submit-label="account ? t('channels.save', 'Save channel') : t('channels.connect', 'Connect channel')"
    :loading="busy"
    @close="emit('close', false)"
  >
    <UForm
      id="inbox-channel-form"
      :schema="schema"
      :state="state"
      class="flex flex-col gap-4"
      @submit="save"
    >
      <UFormField
        v-if="!account"
        name="mailboxId"
        :label="t('channels.mailbox', 'Mailbox')"
        required
      >
        <USelect
          v-model="state.mailboxId"
          :items="mailboxOptions"
          class="w-full"
        />
      </UFormField>
      <UFormField
        v-if="!account"
        name="channel"
        :label="t('channels.channel', 'Channel')"
        required
      >
        <USelect
          v-model="state.channel"
          :items="channelOptions"
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="address"
        :label="t('channels.address', 'Address')"
        :description="addressHelp"
        required
      >
        <UInput
          v-model="state.address"
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="secretRef"
        :label="t('channels.secretRef', 'Secret name')"
        :description="needsSecret
          ? t('channels.secretRefMeta', 'The name of the access token in the server config: inbox.secrets.<NAME> or NUXT_INBOX_SECRET_<NAME>.')
          : t('channels.secretRefOptional', 'Only for channels that need a token of their own.')"
        :required="needsSecret"
      >
        <UInput
          v-model="state.secretRef"
          placeholder="WHATSAPP_TOKEN"
          class="w-full font-mono"
        />
      </UFormField>
      <UFormField
        v-if="state.channel === 'email' || state.channel === 'form'"
        name="replyTo"
        :label="t('channels.replyTo', 'Reply-To address')"
        :description="t('channels.replyToHelp', 'Where answers to replies go. Defaults to the address above, or the mailbox\'s email address.')"
      >
        <UInput
          v-model="state.replyTo"
          type="email"
          class="w-full"
        />
      </UFormField>
      <template v-if="state.channel === 'form'">
        <UFormField
          name="fields"
          :label="t('channels.fields', 'Form fields')"
          :description="t('channels.fieldsHelp', 'The field keys of the name, email and message. Defaults: name, email, message.')"
        >
          <div class="grid grid-cols-3 gap-2">
            <UInput
              v-model="state.nameField"
              placeholder="name"
            />
            <UInput
              v-model="state.emailField"
              placeholder="email"
            />
            <UInput
              v-model="state.messageField"
              placeholder="message"
            />
          </div>
        </UFormField>
      </template>
      <UFormField
        name="enabled"
        :label="t('channels.enabled', 'On')"
        :description="t('channels.enabledHelp', 'A channel that is off drops new messages and sends no replies.')"
      >
        <USwitch v-model="state.enabled" />
      </UFormField>
    </UForm>
  </FormSlideover>
</template>
