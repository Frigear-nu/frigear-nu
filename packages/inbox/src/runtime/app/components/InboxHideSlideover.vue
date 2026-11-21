<script setup lang="ts">
import type { InboxThreadDto } from '../../../types'
import { inboxApi } from '../../utils/api'
import { $fetch, computed, reactive, useAction, useModuleT } from '#imports'

defineOptions({ name: 'InboxHideSlideover' })

// "Hide from lower roles": the thread is seen only by people holding the chosen role (one of the caller's own), or by
// everyone with access to the mailbox again. Closes with the saved thread, or `false`.
const props = defineProps<{ thread: InboxThreadDto, roles: string[] }>()
const emit = defineEmits<{ close: [saved: InboxThreadDto | false] }>()

const t = useModuleT('inbox')
const { busy, run } = useAction()
const NONE = '__none__'
const state = reactive({ role: props.thread.hiddenBelow ?? props.roles[0] ?? NONE })
const options = computed(() => [
  { label: t('hide.everyone', 'Everyone with access to the mailbox'), value: NONE },
  ...props.roles.map(role => ({ label: t('hide.role', '{role} and up', { role }), value: role })),
])

async function save() {
  const role = state.role === NONE ? null : state.role
  const saved = await run(
    () => $fetch<InboxThreadDto>(inboxApi.admin.hide(props.thread.id), { method: 'POST', body: { role } }),
    { success: role ? t('hide.hidden', 'Hidden below {role}', { role }) : t('hide.shown', 'Shown to everyone with access') },
  )
  if (saved) emit('close', saved)
}
</script>

<template>
  <FormSlideover
    form-id="inbox-hide-form"
    :title="t('hide.title', 'Hide from lower roles')"
    :description="t('hide.description', 'People without the role no longer see the thread, as if it did not exist. Its assignee is dropped when they lack the role.')"
    :submit-label="t('hide.save', 'Save who sees it')"
    :loading="busy"
    @close="emit('close', false)"
  >
    <UForm
      id="inbox-hide-form"
      :state="state"
      class="flex flex-col gap-4"
      @submit="save"
    >
      <UFormField
        name="role"
        :label="t('hide.label', 'Who sees the thread')"
      >
        <URadioGroup
          v-model="state.role"
          :items="options"
        />
      </UFormField>
    </UForm>
  </FormSlideover>
</template>
