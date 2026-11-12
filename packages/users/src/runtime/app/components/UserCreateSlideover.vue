<script setup lang="ts">
import { usersApi } from '../../utils/api'
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { UserRow } from '../utils/admin-user'
import { $fetch, reactive, useAction, useModuleT } from '#imports'

defineOptions({ name: 'UsersUserCreateSlideover' })

// The "Add user" form, opened by `useUserActions().create()`: closes with the created user, or `false` when cancelled.
// Roles are given afterwards, on the user's "Roles and permissions" tab (`@frigear-nu/authorization`).
const emit = defineEmits<{ close: [created: UserRow | false] }>()

const t = useModuleT('users')
const { busy, run } = useAction()

const schema = z.object({
  name: z.string().trim().min(1, t('admin.nameRequired', 'Enter a name.')).max(120),
  email: z.string().trim().email(t('admin.emailInvalid', 'Enter a valid email address.')),
  emailVerified: z.boolean(),
  sendWelcomeEmail: z.boolean(),
})
type Schema = z.output<typeof schema>

const state = reactive<Schema>({ name: '', email: '', emailVerified: false, sendWelcomeEmail: true })

async function save(event: FormSubmitEvent<Schema>) {
  const created = await run(
    () => $fetch<UserRow>(usersApi.admin.users, {
      method: 'POST',
      body: event.data,
    }),
    { success: t('admin.createdOk', 'User created.') },
  )
  if (created) emit('close', created)
}
</script>

<template>
  <FormSlideover
    form-id="user-create-form"
    :title="t('admin.create', 'Add user')"
    :description="t('admin.createHint', 'They can sign in with the link we email them.')"
    :submit-label="t('admin.createSubmit', 'Add user')"
    :loading="busy"
    @close="emit('close', false)"
  >
    <UForm
      id="user-create-form"
      :schema="schema"
      :state="state"
      class="flex flex-col gap-4"
      @submit="save"
    >
      <UFormField
        name="name"
        :label="t('admin.name', 'Name')"
        required
      >
        <UInput
          v-model="state.name"
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="email"
        :label="t('admin.email', 'Email')"
        required
      >
        <UInput
          v-model="state.email"
          type="email"
          class="w-full"
        />
      </UFormField>
      <UCheckbox
        v-model="state.emailVerified"
        :label="t('admin.emailVerified', 'Mark the email address as verified')"
      />
      <UCheckbox
        v-model="state.sendWelcomeEmail"
        :label="t('admin.sendWelcome', 'Email a sign-in link')"
      />
    </UForm>
  </FormSlideover>
</template>
