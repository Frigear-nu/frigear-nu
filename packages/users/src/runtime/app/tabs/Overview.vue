<script setup lang="ts">
import type { UserDetail } from '../utils/admin-user'
import { useUserActions } from '../composables/useUserActions'

defineOptions({ name: 'UsersAdminOverviewTab' })

// The built-in "Overview" tab of the `admin.users` area: profile form, account facts and the danger zone,
// with an `admin.users.overview` widget area on top for modules' summary cards (e.g. subscription, last payment).
const props = defineProps<{ user: UserDetail }>()
const emit = defineEmits<{ refresh: [] }>()

const t = useModuleT('users')
const format = useFormat()
const actions = useUserActions()
const { busy: saving, run } = useAction()

// `@frigear-nu/widget` is optional: without it there is no summary area.
const OverviewWidgets = resolveComponent('WidgetArea')
const overviewWidgets = typeof OverviewWidgets === 'string' ? undefined : OverviewWidgets

const form = reactive({ name: '', email: '', role: '', emailVerified: false })
function fill(value: UserDetail) {
  Object.assign(form, { name: value.name, email: value.email, role: value.role ?? '', emailVerified: !!value.emailVerifiedAt })
}
fill(props.user)
watch(() => props.user, fill)

const roleLabel = (value: string) => t(`admin.roleNames.${value}`, value.charAt(0).toUpperCase() + value.slice(1))
// The user's current role stays selectable even when the acting user could not assign it.
const roleItems = computed(() => {
  const roles = new Set(props.user.roles ?? [])
  if (props.user.role) roles.add(props.user.role)
  return [...roles].map(value => ({ label: roleLabel(value), value }))
})
const accountFacts = computed(() => [
  { key: 'created', label: t('admin.created', 'Created'), value: format.dateTime(props.user.createdAt) },
  { key: 'lastLogin', label: t('admin.lastLogin', 'Last sign-in'), value: format.dateTime(props.user.lastLoginAt) || t('admin.detail.never', 'Never') },
  { key: 'password', label: t('admin.detail.password', 'Password'), value: props.user.hasPassword ? t('admin.detail.set', 'Set') : null },
  { key: 'passkeys', label: t('admin.detail.passkeys', 'Passkeys'), value: props.user.passkeys },
])
const dirty = computed(() => (
  form.name !== props.user.name
  || form.email !== props.user.email
  || (props.user.hasRoles && form.role !== (props.user.role ?? ''))
  || form.emailVerified !== !!props.user.emailVerifiedAt
))

async function save() {
  const emailChanged = form.email !== props.user.email
  const saved = await run(
    () => $fetch(`/api/admin/users/${props.user.id}`, {
      method: 'PATCH',
      body: {
        name: form.name,
        email: form.email,
        ...(props.user.hasRoles && form.role ? { role: form.role } : {}),
        // An unchanged address keeps its state unless staff toggled it; a changed one is verified by email.
        ...(emailChanged ? {} : { emailVerified: form.emailVerified }),
      },
    }).then(() => true),
    { success: emailChanged ? t('admin.detail.savedEmail', 'Saved. A verification email was sent to the new address.') : t('admin.detail.saved', 'Saved.') },
  )
  if (saved) emit('refresh')
}

const remove = () => actions.remove(props.user, {
  onRemoved: async () => {
    await navigateTo(actions.listPath.value)
  },
})
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
        <form
          id="user-profile-form"
          class="flex flex-col gap-4"
          @submit.prevent="save"
        >
          <UFormField :label="t('admin.name', 'Name')">
            <UInput
              v-model="form.name"
              class="w-full"
              required
              :disabled="!user.can.update"
            />
          </UFormField>
          <UFormField
            :label="t('admin.email', 'Email')"
            :description="t('admin.detail.emailHelp', 'Changing the address marks it unverified and emails a verification link to the new one.')"
          >
            <UInput
              v-model="form.email"
              type="email"
              class="w-full"
              required
              :disabled="!user.can.update"
            />
          </UFormField>
          <UFormField
            v-if="user.hasRoles"
            :label="t('admin.role', 'Role')"
          >
            <USelect
              v-model="form.role"
              :items="roleItems"
              class="w-full"
              :placeholder="t('admin.rolePlaceholder', 'Select a role')"
              :disabled="!user.can.update"
            />
          </UFormField>
          <UCheckbox
            v-model="form.emailVerified"
            :label="t('admin.emailVerified', 'Mark the email address as verified')"
            :disabled="!user.can.update || form.email !== user.email"
          />
        </form>
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

      <div class="flex flex-col gap-4">
        <SectionCard :title="t('admin.detail.account', 'Account')">
          <DescriptionList :items="accountFacts" />
        </SectionCard>

        <SectionCard
          v-if="user.can.delete"
          :title="t('admin.detail.danger', 'Danger zone')"
          :description="t('admin.detail.dangerHint', 'Removes the account and its sign-in methods for good.')"
        >
          <UButton
            color="error"
            variant="soft"
            icon="i-lucide-trash-2"
            :label="t('admin.deleteUser', 'Delete user')"
            @click="remove"
          />
        </SectionCard>
      </div>
    </div>
  </div>
</template>
