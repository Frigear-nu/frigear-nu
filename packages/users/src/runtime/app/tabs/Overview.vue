<script setup lang="ts">
import { usersApi } from '../../utils/api'
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { UserDetail } from '../utils/admin-user'
import { $fetch, computed, reactive, resolveComponent, useAction, useFormat, useModuleT, watch } from '#imports'

defineOptions({ name: 'UsersAdminOverviewTab' })

// The built-in "Overview" tab of the `admin.users` area: profile form and account facts (deleting lives in the heading's row menu),
// with an `admin.users.overview` widget area on top for modules' summary cards (e.g. subscription, last payment).
const props = defineProps<{ user: UserDetail }>()
const emit = defineEmits<{ refresh: [] }>()

const t = useModuleT('users')
const format = useFormat()
const { busy: saving, run } = useAction()

// `@frigear-nu/widget` is optional: without it there is no summary area.
const OverviewWidgets = resolveComponent('WidgetArea')
const overviewWidgets = typeof OverviewWidgets === 'string' ? undefined : OverviewWidgets

const schema = z.object({
  name: z.string().trim().min(1, t('admin.nameRequired', 'Enter a name.')).max(120),
  email: z.string().trim().email(t('admin.emailInvalid', 'Enter a valid email address.')),
  emailVerified: z.boolean(),
})
type Schema = z.output<typeof schema>

const form = reactive<Schema>({ name: '', email: '', emailVerified: false })
function fill(value: UserDetail) {
  Object.assign(form, { name: value.name, email: value.email, emailVerified: !!value.emailVerifiedAt })
}
fill(props.user)
watch(() => props.user, fill)

const accountFacts = computed(() => [
  { key: 'created', label: t('admin.created', 'Created'), value: format.dateTime(props.user.createdAt) },
  { key: 'lastLogin', label: t('admin.lastLogin', 'Last sign-in'), value: format.dateTime(props.user.lastLoginAt) || t('admin.detail.never', 'Never') },
  { key: 'password', label: t('admin.detail.password', 'Password'), value: props.user.hasPassword ? t('admin.detail.set', 'Set') : null },
  { key: 'passkeys', label: t('admin.detail.passkeys', 'Passkeys'), value: props.user.passkeys },
])
const dirty = computed(() => (
  form.name !== props.user.name
  || form.email !== props.user.email
  || form.emailVerified !== !!props.user.emailVerifiedAt
))

async function save(event: FormSubmitEvent<Schema>) {
  const { name, email, emailVerified } = event.data
  const emailChanged = email !== props.user.email
  const saved = await run(
    () => $fetch(usersApi.admin.user(props.user.id), {
      method: 'PATCH',
      body: {
        name,
        ...(emailChanged ? { email } : {}),
        // An unchanged address keeps its state unless staff toggled it; a changed one is verified by email. Both
        // need `users:manage`, so they are only sent when they change.
        ...(!emailChanged && emailVerified !== !!props.user.emailVerifiedAt ? { emailVerified } : {}),
      },
    }).then(() => true),
    { success: emailChanged ? t('admin.detail.savedEmail', 'Saved. A verification email was sent to the new address.') : t('admin.detail.saved', 'Saved.') },
  )
  if (saved) emit('refresh')
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <component
      :is="overviewWidgets"
      v-if="overviewWidgets"
      name="admin.users.overview"
      :context="{ user }"
    />

    <div class="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <SectionCard :title="t('admin.detail.profile', 'Profile')">
        <UForm
          id="user-profile-form"
          :schema="schema"
          :state="form"
          class="flex flex-col divide-y divide-default"
          @submit="save"
        >
          <FormRow
            name="name"
            :label="t('admin.name', 'Name')"
            required
          >
            <UInput
              v-model="form.name"
              class="w-full sm:max-w-sm"
              :disabled="!user.can.update"
            />
          </FormRow>
          <FormRow
            name="email"
            :label="t('admin.email', 'Email')"
            required
            :description="t('admin.detail.emailHelp', 'Changing the address marks it unverified and emails a verification link to the new one.')"
          >
            <UInput
              v-model="form.email"
              type="email"
              class="w-full sm:max-w-sm"
              :disabled="!user.can.manage"
            />
          </FormRow>
          <FormRow
            name="emailVerified"
            :label="t('admin.verified', 'Verified')"
          >
            <UCheckbox
              v-model="form.emailVerified"
              :label="t('admin.emailVerified', 'Mark the email address as verified')"
              :disabled="!user.can.manage || form.email !== user.email"
            />
          </FormRow>
        </UForm>
        <template #footer>
          <div class="flex justify-end">
            <UButton
              type="submit"
              form="user-profile-form"
              :loading="saving"
              :disabled="!dirty || !user.can.update"
              :label="t('admin.detail.saveProfile', 'Save profile')"
            />
          </div>
        </template>
      </SectionCard>

      <SectionCard :title="t('admin.detail.account', 'Account')">
        <DescriptionList :items="accountFacts" />
      </SectionCard>
    </div>
  </div>
</template>
