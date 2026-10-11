<script setup lang="ts">
defineOptions({ name: 'UsersAdminPage' })

type AdminUser = { id: number, name: string, email: string, role?: string, emailVerifiedAt: string | null, createdAt: string }

const t = useModuleT('users')
const toast = useToast()
const { data: users, refresh } = await useFetch<AdminUser[]>('/api/users/admin', { default: () => [] })
const hasRoles = computed(() => users.value.some(user => user.role !== undefined))
const filter = ref('')

const filtered = computed(() => {
  const needle = filter.value.trim().toLowerCase()
  return needle
    ? users.value.filter(user => `${user.name} ${user.email} ${user.role ?? ''}`.toLowerCase().includes(needle))
    : users.value
})

const columns = computed(() => [
  { accessorKey: 'id', header: 'ID' },
  { accessorKey: 'name', header: t('admin.name', 'Name') },
  { accessorKey: 'email', header: t('admin.email', 'Email') },
  ...(hasRoles.value ? [{ accessorKey: 'role', header: t('admin.role', 'Role') }] : []),
  { id: 'verified', header: t('admin.verified', 'Verified'), cell: ({ row }: { row: { original: AdminUser } }) => row.original.emailVerifiedAt ? '✓' : '–' },
])

// One modal for both creating and editing.
const editing = ref<AdminUser | null>(null)
const creating = ref(false)
const open = computed({
  get: () => creating.value || !!editing.value,
  set: (value) => {
    if (!value) {
      creating.value = false
      editing.value = null
    }
  },
})
const form = reactive({ name: '', email: '', role: '', emailVerified: false, sendWelcomeEmail: true })
const saving = ref(false)

function startCreate() {
  Object.assign(form, { name: '', email: '', role: '', emailVerified: false, sendWelcomeEmail: true })
  creating.value = true
}

function startEdit(_event: Event, row: { original: AdminUser }) {
  Object.assign(form, { name: row.original.name, email: row.original.email, role: row.original.role ?? '' })
  editing.value = row.original
}

async function save() {
  saving.value = true
  try {
    if (editing.value) {
      await $fetch(`/api/users/admin/${editing.value.id}`, {
        method: 'PATCH',
        body: { name: form.name, email: form.email, ...(hasRoles.value && form.role ? { role: form.role } : {}) },
      })
    }
    else {
      await $fetch('/api/users/admin', {
        method: 'POST',
        body: { ...form, role: hasRoles.value && form.role ? form.role : undefined },
      })
    }
    open.value = false
    await refresh()
  }
  catch (cause) {
    toast.add({ title: (cause as { statusMessage?: string }).statusMessage ?? t('admin.error', 'Something went wrong.'), color: 'error' })
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <div class="mb-6 flex flex-wrap items-center justify-between gap-4">
      <h1 class="text-2xl font-semibold">
        {{ t('admin.title', 'Users') }}
      </h1>
      <UButton
        icon="i-lucide-user-plus"
        :label="t('admin.create', 'Create user')"
        @click="startCreate"
      />
    </div>
    <UInput
      v-model="filter"
      class="mb-4 max-w-sm"
      icon="i-lucide-search"
      :placeholder="t('admin.filter', 'Filter...')"
    />
    <UTable
      :data="filtered"
      :columns="columns"
      @select="startEdit"
    />
    <UModal
      v-model:open="open"
      :title="editing ? t('admin.edit', 'Edit user') : t('admin.create', 'Create user')"
    >
      <template #body>
        <form
          class="flex flex-col gap-4"
          @submit.prevent="save"
        >
          <UFormField :label="t('admin.name', 'Name')">
            <UInput
              v-model="form.name"
              class="w-full"
              required
            />
          </UFormField>
          <UFormField :label="t('admin.email', 'Email')">
            <UInput
              v-model="form.email"
              type="email"
              class="w-full"
              required
            />
          </UFormField>
          <UFormField
            v-if="hasRoles"
            :label="t('admin.role', 'Role')"
          >
            <UInput
              v-model="form.role"
              class="w-full"
              placeholder="user"
            />
          </UFormField>
          <template v-if="creating">
            <UCheckbox
              v-model="form.emailVerified"
              :label="t('admin.emailVerified', 'Mark the email address as verified')"
            />
            <UCheckbox
              v-model="form.sendWelcomeEmail"
              :label="t('admin.sendWelcome', 'Email a sign-in link')"
            />
          </template>
          <div class="flex justify-end gap-2">
            <UButton
              variant="subtle"
              :label="t('admin.cancel', 'Cancel')"
              @click="open = false"
            />
            <UButton
              type="submit"
              :loading="saving"
              :label="t('admin.save', 'Save')"
            />
          </div>
        </form>
      </template>
    </UModal>
  </div>
</template>
