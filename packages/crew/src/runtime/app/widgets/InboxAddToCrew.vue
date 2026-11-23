<script setup lang="ts">
import { useCrewActions, useModuleT } from '#imports'

defineOptions({ name: 'CrewInboxAddToCrew' })

// "Add to crew" on an inbox thread (the `inbox.thread.actions` slot of `@frigear-nu/inbox`, registered in `module.ts`;
// crew does not depend on inbox, the slot passes these props). It opens the "Add crew member" form with an operation to
// choose: the thread's person is preselected when they have an account (a verified contact's `userId`); otherwise the
// form offers "Create user" prefilled with the contact's name, email and phone. The addition is recorded on the thread's
// audit trail (`inbox:thread:linked`).
const props = defineProps<{
  threadId: string
  contact: { name: string | null, email?: string | null, phone?: string | null, userId?: number | null } | null
  onChanged?: () => unknown
}>()

const t = useModuleT('crew')
const actions = useCrewActions()

async function addToCrew() {
  const contact = props.contact
  const userId = contact?.userId ?? undefined
  const prefill = contact && !userId
    ? { ...(contact.name ? { name: contact.name } : {}), ...(contact.email ? { email: contact.email } : {}), ...(contact.phone ? { phone: contact.phone } : {}) }
    : undefined
  const added = await actions.add(undefined, {
    inboxThreadId: props.threadId,
    ...(userId ? { userId, selected: [{ id: userId, name: contact?.name ?? null, email: contact?.email ?? null }] } : {}),
    ...(prefill ? { prefill } : {}),
  })
  if (added) await props.onChanged?.()
}
</script>

<template>
  <UButton
    color="neutral"
    variant="outline"
    size="sm"
    icon="i-lucide-hand-heart"
    :label="t('admin.addToCrew', 'Add to crew')"
    data-crew-add-to-crew
    @click="addToCrew"
  />
</template>
