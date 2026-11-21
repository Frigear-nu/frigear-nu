<script setup lang="ts">
import { z } from 'zod'
import type { Grant, InboxMailboxDto, Translated } from '../../../types'
import { inboxApi } from '../../utils/api'
import { $fetch, reactive, useAction, useInboxTranslate, useModuleT } from '#imports'
import { grantFields } from '#grants/fields'

defineOptions({ name: 'InboxMailboxSlideover' })

// Create and edit form of a mailbox, opened with `useOverlay()` by `useInboxMailboxActions()`: it closes with the saved
// mailbox, or `false` when cancelled. The key and the owner are set once.
const props = defineProps<{ mailbox?: InboxMailboxDto }>()
const emit = defineEmits<{ close: [saved: InboxMailboxDto | false] }>()

const t = useModuleT('inbox')
const tr = useInboxTranslate()
const { busy, run } = useAction()

type State = { name: Translated | null, key: string, ownerType: 'platform' | 'team', ownerId: string, grants: Grant[], retentionDays: number | undefined }
const state = reactive<State>(props.mailbox
  ? { name: props.mailbox.name, key: props.mailbox.key, ownerType: props.mailbox.ownerType === 'team' ? 'team' : 'platform', ownerId: props.mailbox.ownerId ?? '', grants: props.mailbox.grants, retentionDays: props.mailbox.retentionDays ?? undefined }
  : { name: null, key: '', ownerType: 'platform', ownerId: '', grants: [{ kind: 'role', role: 'admin' }], retentionDays: undefined })

// A mailbox holds outsiders' messages: `public` is not offered.
const grantKinds = grantFields.map(field => field.kind).filter(kind => kind !== 'public')

const ownerOptions = [
  { label: t('settings.ownerPlatform', 'Platform'), value: 'platform' },
  { label: t('settings.ownerTeam', 'A team'), value: 'team' },
]

const schema = z.object({
  name: z.union([z.string().trim().min(1), z.record(z.string(), z.string())]).nullable()
    .refine(value => !!tr(value), t('settings.nameRequired', 'Give the mailbox a name.')),
  key: z.string().trim().regex(/^[a-z0-9][\w.-]{0,63}$/i, t('settings.keyHelp', 'Letters, digits, ".", "_" and "-".')),
  ownerId: z.string().trim(),
  retentionDays: z.number().int().min(1).max(36_500).optional(),
})

async function save() {
  const name = tr(state.name)
  const shared = { name: state.name, grants: state.grants, retentionDays: state.retentionDays ?? null }
  const saved = await run(
    () => props.mailbox
      ? $fetch<InboxMailboxDto>(inboxApi.admin.mailbox(props.mailbox.id), { method: 'PATCH', body: shared })
      : $fetch<InboxMailboxDto>(inboxApi.admin.mailboxes, {
          method: 'POST',
          body: { ...shared, key: state.key.trim(), ownerType: state.ownerType, ownerId: state.ownerType === 'team' ? state.ownerId.trim() : null },
        }),
    { success: props.mailbox ? t('settings.mailboxSaved', 'Saved {name}', { name }) : t('settings.mailboxCreated', 'Created {name}', { name }) },
  )
  if (saved) emit('close', saved)
}
</script>

<template>
  <FormSlideover
    form-id="inbox-mailbox-form"
    :title="mailbox ? t('settings.editMailbox', 'Edit mailbox') : t('settings.addMailbox', 'Add mailbox')"
    :description="mailbox ? undefined : t('settings.addMailboxDescription', 'A shared inbox. Connect channels to it once it is created.')"
    :submit-label="mailbox ? t('settings.saveMailbox', 'Save mailbox') : t('settings.createMailbox', 'Create mailbox')"
    :loading="busy"
    @close="emit('close', false)"
  >
    <UForm
      id="inbox-mailbox-form"
      :schema="schema"
      :state="state"
      class="flex flex-col gap-4"
      @submit="save"
    >
      <UFormField
        name="name"
        :label="t('settings.name', 'Name')"
        required
      >
        <TranslatedInput v-model="state.name" />
      </UFormField>
      <UFormField
        v-if="!mailbox"
        name="key"
        :label="t('settings.key', 'Key')"
        :description="t('settings.keyDescription', 'A stable name for code and seeds, such as support.')"
        required
      >
        <UInput
          v-model="state.key"
          class="w-full"
        />
      </UFormField>
      <template v-if="!mailbox">
        <UFormField
          name="ownerType"
          :label="t('settings.owner', 'Owner')"
          :description="t('settings.ownerHelp', 'A team mailbox is read by the team\'s leads.')"
        >
          <USelect
            v-model="state.ownerType"
            :items="ownerOptions"
            class="w-full"
          />
        </UFormField>
        <UFormField
          v-if="state.ownerType === 'team'"
          name="ownerId"
          :label="t('settings.team', 'Team id')"
          required
        >
          <UInput
            v-model="state.ownerId"
            placeholder="tem_…"
            class="w-full"
          />
        </UFormField>
      </template>
      <UFormField
        name="grants"
        :label="t('settings.readers', 'Who reads it')"
        :description="t('settings.readersHelp', 'Staff who manage inboxes always do. A platform mailbox needs at least one rule.')"
      >
        <GrantsEditor
          v-model="state.grants"
          :kinds="grantKinds"
        />
      </UFormField>
      <UFormField
        name="retentionDays"
        :label="t('settings.retention', 'Keep closed threads for')"
        :description="t('settings.retentionHelp', 'Days after the last message. Leave empty for the default.')"
      >
        <UInputNumber
          v-model="state.retentionDays"
          :min="1"
          :max="36500"
          class="w-40"
        />
      </UFormField>
    </UForm>
  </FormSlideover>
</template>
