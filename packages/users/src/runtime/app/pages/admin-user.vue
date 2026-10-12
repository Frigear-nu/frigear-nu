<script setup lang="ts">
defineOptions({ name: 'UsersAdminUserPage' })

type Subscription = { planKey: string | null, status: string }
type AdminUserDetail = {
  id: number
  name: string
  email: string
  role?: string
  emailVerifiedAt: string | null
  lastLoginAt?: string | null
  createdAt: string
  hasPassword: boolean
  passkeys: number
  subscription: Subscription | null
  hasRoles: boolean
  roles: string[]
  can: { update: boolean, delete: boolean }
}

const t = useModuleT('users')
const route = useRoute()
const toast = useToast()
const id = computed(() => route.params.id as string)
// The list lives one level up from `<list>/<id>`.
const listPath = computed(() => route.path.replace(/\/[^/]+\/?$/, ''))

const { data: user, refresh, error } = await useFetch<AdminUserDetail>(() => `/api/admin/users/${id.value}`)

const form = reactive({ name: '', email: '', role: '', emailVerified: false })
function fill(value: AdminUserDetail | null | undefined) {
  if (!value) return
  Object.assign(form, { name: value.name, email: value.email, role: value.role ?? '', emailVerified: !!value.emailVerifiedAt })
}
fill(user.value)
watch(user, fill)

const roleLabel = (value: string) => t(`admin.roleNames.${value}`, value.charAt(0).toUpperCase() + value.slice(1))
// The user's current role stays selectable even when the acting user could not assign it.
const roleItems = computed(() => {
  const roles = new Set(user.value?.roles ?? [])
  if (user.value?.role) roles.add(user.value.role)
  return [...roles].map(value => ({ label: roleLabel(value), value }))
})
const dateFormat = (value?: string | null) => value ? new Date(value).toLocaleString() : '–'
const dirty = computed(() => !!user.value && (
  form.name !== user.value.name
  || form.email !== user.value.email
  || (user.value.hasRoles && form.role !== (user.value.role ?? ''))
  || form.emailVerified !== !!user.value.emailVerifiedAt
))

function fail(cause: unknown) {
  toast.add({ title: (cause as { statusMessage?: string }).statusMessage ?? t('admin.error', 'Something went wrong.'), color: 'error' })
}

const saving = ref(false)
async function save() {
  if (!user.value) return
  saving.value = true
  try {
    const emailChanged = form.email !== user.value.email
    await $fetch(`/api/admin/users/${id.value}`, {
      method: 'PATCH',
      body: {
        name: form.name,
        email: form.email,
        ...(user.value.hasRoles && form.role ? { role: form.role } : {}),
        // An unchanged address keeps its state unless staff toggled it; a changed one is verified by email.
        ...(emailChanged ? {} : { emailVerified: form.emailVerified }),
      },
    })
    toast.add({
      title: emailChanged ? t('admin.detail.savedEmail', 'Saved. A verification email was sent to the new address.') : t('admin.detail.saved', 'Saved.'),
      color: 'success',
    })
    await refresh()
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

// `@frigear-nu/subscriptions` (when installed) can register a `UsersAdminMembership` component to take this slot;
// it receives the user and a `refresh` callback. Without it, the panel only shows the current subscription.
const MembershipPanel = resolveComponent('UsersAdminMembership')
const membershipPanel = typeof MembershipPanel === 'string' ? undefined : MembershipPanel
</script>

<template>
  <div>
    <UButton
      :to="listPath"
      color="neutral"
      variant="link"
      icon="i-lucide-arrow-left"
      class="-ml-2.5 mb-2"
      :label="t('admin.title', 'Users')"
    />
    <UAlert
      v-if="error || !user"
      color="error"
      variant="subtle"
      :title="t('admin.detail.notFound', 'User not found.')"
    />
    <template v-else>
      <AdminPageHeader
        :title="user.name"
        :description="user.email"
        :back="{ label: t('admin.title', 'Users'), to: listPath }"
      >
        <template #links>
          <UBadge
            :color="user.emailVerifiedAt ? 'success' : 'warning'"
            variant="subtle"
            :label="user.emailVerifiedAt ? t('admin.filters.verified', 'Verified') : t('admin.filters.unverified', 'Unverified')"
          />
        </template>
      </AdminPageHeader>

      <div class="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <UPageCard
          variant="subtle"
          :title="t('admin.detail.profile', 'Profile')"
        >
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
              :help="t('admin.detail.emailHelp', 'Changing the address marks it unverified and emails a verification link to the new one.')"
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
        </UPageCard>

        <div class="flex flex-col gap-6">
          <UPageCard
            variant="subtle"
            :title="t('admin.detail.account', 'Account')"
          >
            <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt class="text-muted">
                {{ t('admin.created', 'Created') }}
              </dt>
              <dd>{{ dateFormat(user.createdAt) }}</dd>
              <dt class="text-muted">
                {{ t('admin.lastLogin', 'Last sign-in') }}
              </dt>
              <dd>{{ dateFormat(user.lastLoginAt) }}</dd>
              <dt class="text-muted">
                {{ t('admin.detail.password', 'Password') }}
              </dt>
              <dd>{{ user.hasPassword ? t('admin.detail.set', 'Set') : t('admin.detail.notSet', 'Not set') }}</dd>
              <dt class="text-muted">
                {{ t('admin.detail.passkeys', 'Passkeys') }}
              </dt>
              <dd>{{ user.passkeys }}</dd>
            </dl>
            <UButton
              v-if="user.can.update"
              variant="outline"
              color="neutral"
              icon="i-lucide-mail"
              :loading="resending"
              :label="user.emailVerifiedAt ? t('admin.detail.sendLink', 'Email a sign-in link') : t('admin.detail.sendVerification', 'Resend verification email')"
              @click="resend"
            />
          </UPageCard>

          <!-- Membership panel: a hook for @frigear-nu/subscriptions (see `UsersAdminMembership` above). -->
          <UPageCard
            id="membership"
            variant="subtle"
            :title="t('admin.detail.membership', 'Membership')"
          >
            <component
              :is="membershipPanel"
              v-if="membershipPanel"
              :user="user"
              @refresh="refresh"
            />
            <template v-else>
              <div
                v-if="user.subscription"
                class="flex items-center gap-2 text-sm"
              >
                <UBadge
                  variant="subtle"
                  :color="['active', 'trialing'].includes(user.subscription.status) ? 'success' : 'neutral'"
                  :label="user.subscription.planKey ?? user.subscription.status"
                />
                <span class="text-muted">{{ user.subscription.status }}</span>
              </div>
              <p
                v-else
                class="text-muted text-sm"
              >
                {{ t('admin.detail.noMembership', 'No membership.') }}
              </p>
            </template>
          </UPageCard>

          <UPageCard
            v-if="user.can.delete"
            variant="subtle"
            :title="t('admin.detail.danger', 'Danger zone')"
          >
            <UButton
              color="error"
              variant="soft"
              icon="i-lucide-trash-2"
              :label="t('admin.detail.delete', 'Delete user')"
              @click="confirmDelete = true"
            />
          </UPageCard>
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
    </template>
  </div>
</template>
