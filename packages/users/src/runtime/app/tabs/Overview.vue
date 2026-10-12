<script setup lang="ts">
import type { AdminUserDetail } from '../utils/admin-user'

defineOptions({ name: 'UsersAdminOverviewTab' })

// The built-in "Overview" tab of the `admin.users` area: profile form, account facts and the danger zone,
// with an `admin.users.overview` widget area on top for modules' summary cards (e.g. subscription, last payment).
const props = defineProps<{ user: AdminUserDetail }>()
const emit = defineEmits<{ refresh: [] }>()

const t = useModuleT('users')
const route = useRoute()
const toast = useToast()
const id = computed(() => props.user.id)
// The list lives one level up from `<list>/<id>`.
const listPath = computed(() => route.path.replace(/\/[^/]+\/?$/, ''))

// `@frigear-nu/widget` is optional: without it there is no summary area.
const OverviewWidgets = resolveComponent('WidgetArea')
const overviewWidgets = typeof OverviewWidgets === 'string' ? undefined : OverviewWidgets

const form = reactive({ name: '', email: '', role: '', emailVerified: false })
function fill(value: AdminUserDetail) {
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
  { key: 'created', label: t('admin.created', 'Created'), value: dateFormat(props.user.createdAt) },
  { key: 'lastLogin', label: t('admin.lastLogin', 'Last sign-in'), value: dateFormat(props.user.lastLoginAt) },
  { key: 'password', label: t('admin.detail.password', 'Password'), value: props.user.hasPassword ? t('admin.detail.set', 'Set') : t('admin.detail.notSet', 'Not set') },
  { key: 'passkeys', label: t('admin.detail.passkeys', 'Passkeys'), value: props.user.passkeys },
])
const dateFormat = (value?: string | null) => value ? new Date(value).toLocaleString() : '–'
const dirty = computed(() => (
  form.name !== props.user.name
  || form.email !== props.user.email
  || (props.user.hasRoles && form.role !== (props.user.role ?? ''))
  || form.emailVerified !== !!props.user.emailVerifiedAt
))

function fail(cause: unknown) {
  toast.add({ title: (cause as { statusMessage?: string }).statusMessage ?? t('admin.error', 'Something went wrong.'), color: 'error' })
}

const saving = ref(false)
async function save() {
  saving.value = true
  try {
    const emailChanged = form.email !== props.user.email
    await $fetch(`/api/admin/users/${id.value}`, {
      method: 'PATCH',
      body: {
        name: form.name,
        email: form.email,
        ...(props.user.hasRoles && form.role ? { role: form.role } : {}),
        // An unchanged address keeps its state unless staff toggled it; a changed one is verified by email.
        ...(emailChanged ? {} : { emailVerified: form.emailVerified }),
      },
    })
    toast.add({
      title: emailChanged ? t('admin.detail.savedEmail', 'Saved. A verification email was sent to the new address.') : t('admin.detail.saved', 'Saved.'),
      color: 'success',
    })
    emit('refresh')
  }
  catch (cause) {
    fail(cause)
  }
  finally {
    saving.value = false
  }
}

const resending = ref(false)
async function resend() {
  resending.value = true
  try {
    await $fetch(`/api/admin/users/${id.value}/resend`, { method: 'POST' })
    toast.add({ title: t('admin.detail.resent', 'Sign-in link sent.'), color: 'success' })
  }
  catch (cause) {
    fail(cause)
  }
  finally {
    resending.value = false
  }
}

const confirmDelete = ref(false)
const deleting = ref(false)
async function remove() {
  deleting.value = true
  try {
    await $fetch(`/api/admin/users/${id.value}`, { method: 'DELETE' })
    toast.add({ title: t('admin.detail.deleted', 'User deleted.'), color: 'success' })
    await navigateTo(listPath.value)
  }
  catch (cause) {
    fail(cause)
  }
  finally {
    deleting.value = false
    confirmDelete.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <component
      :is="overviewWidgets"
      v-if="overviewWidgets"
      name="admin.users.overview"
      :context="{ user }"
    />

    <div class="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <AdminSection :title="t('admin.detail.profile', 'Profile')">
        <form
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
          <div class="flex justify-end">
            <UButton
              type="submit"
              :loading="saving"
              :disabled="!dirty || !user.can.update"
              :label="t('admin.save', 'Save')"
            />
          </div>
        </form>
      </AdminSection>

      <div class="flex flex-col gap-6">
        <AdminSection :title="t('admin.detail.account', 'Account')">
          <AdminKeyValue :items="accountFacts" />
          <UButton
            v-if="user.can.update"
            variant="outline"
            color="neutral"
            icon="i-lucide-mail"
            :loading="resending"
            :label="user.emailVerifiedAt ? t('admin.detail.sendLink', 'Email a sign-in link') : t('admin.detail.sendVerification', 'Resend verification email')"
            @click="resend"
          />
        </AdminSection>

        <AdminSection
          v-if="user.can.delete"
          :title="t('admin.detail.danger', 'Danger zone')"
        >
          <UButton
            color="error"
            variant="soft"
            icon="i-lucide-trash-2"
            :label="t('admin.detail.delete', 'Delete user')"
            @click="confirmDelete = true"
          />
        </AdminSection>
      </div>
    </div>

    <UModal
      v-model:open="confirmDelete"
      :title="t('admin.detail.deleteTitle', 'Delete this user?')"
      :description="t('admin.detail.deleteBody', 'This permanently removes the account and its sign-in methods. It cannot be undone.')"
    >
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            variant="subtle"
            :label="t('admin.cancel', 'Cancel')"
            @click="confirmDelete = false"
          />
          <UButton
            color="error"
            :loading="deleting"
            :label="t('admin.detail.delete', 'Delete user')"
            @click="remove"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
