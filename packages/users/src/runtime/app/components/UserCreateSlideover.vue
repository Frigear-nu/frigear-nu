<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { UserRow } from '../utils/admin-user'

defineOptions({ name: 'UsersUserCreateSlideover' })

// The "Add user" form, opened by `useUserActions().create()`: closes with the created user, or `false` when cancelled.
const props = defineProps<{ roles?: string[] }>()
const emit = defineEmits<{ close: [created: UserRow | false] }>()

const t = useModuleT('users')
const { busy, run } = useAction()

const schema = z.object({
  name: z.string().trim().min(1, t('admin.nameRequired', 'Enter a name.')).max(120),
  email: z.string().trim().email(t('admin.emailInvalid', 'Enter a valid email address.')),
  role: z.string().optional(),
  emailVerified: z.boolean(),
  sendWelcomeEmail: z.boolean(),
})
type Schema = z.output<typeof schema>

const state = reactive<Schema>({ name: '', email: '', role: undefined, emailVerified: false, sendWelcomeEmail: true })
const roleLabel = (value: string) => t(`admin.roleNames.${value}`, value.charAt(0).toUpperCase() + value.slice(1))
const roleItems = computed(() => (props.roles ?? []).map(value => ({ label: roleLabel(value), value })))

async function save(event: FormSubmitEvent<Schema>) {
  const created = await run(
    () => $fetch<UserRow>('/api/admin/users', {
      method: 'POST',
      body: { ...event.data, role: roleItems.value.length && event.data.role ? event.data.role : undefined },
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
      <UFormField
        v-if="roleItems.length"
        name="role"
        :label="t('admin.role', 'Role')"
      >
        <USelect
          v-model="state.role"
          :items="roleItems"
          class="w-full"
          :placeholder="t('admin.rolePlaceholder', 'Select a role')"
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
