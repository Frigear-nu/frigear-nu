<script setup lang="ts">
import type { AdminApplicationDto } from '../../../types'

defineOptions({ name: 'OAuthAdminPage' })

const t = useModuleT('oauthServer')
const confirmAction = useConfirmDialog()
const { applications, status, error, create, update, remove, rotateSecret, revokeGrants } = useOAuthApplications()

type FormState = {
  name: string
  websiteUrl: string
  loginUrl: string
  previewUrlPattern: string
  description: string
  icon: string
  priority: number
  allowedRoles: string[]
  tags: string[]
}

const emptyForm = (): FormState => ({
  name: '',
  websiteUrl: '',
  loginUrl: '',
  previewUrlPattern: '',
  description: '',
  icon: 'i-lucide-globe',
  priority: 0,
  allowedRoles: [],
  tags: [],
})

const formOpen = ref(false)
const editingId = ref<string | null>(null)
const form = ref<FormState>(emptyForm())
const busy = ref(false)
const failure = ref<string | null>(null)
// Shown once after creating an application or replacing its secret.
const secret = ref<{ name: string, clientId: string, clientSecret: string } | null>(null)

const forbidden = computed(() => error.value?.statusCode === 401 || error.value?.statusCode === 403)

function openCreate() {
  editingId.value = null
  form.value = emptyForm()
  failure.value = null
  formOpen.value = true
}

function openEdit(application: AdminApplicationDto) {
  editingId.value = application.id
  form.value = {
    name: application.name,
    websiteUrl: application.websiteUrl,
    loginUrl: application.loginUrl ?? '',
    previewUrlPattern: application.previewUrlPattern ?? '',
    description: application.description ?? '',
    icon: application.icon ?? '',
    priority: application.priority,
    allowedRoles: [...application.allowedRoles],
    tags: [...application.tags],
  }
  failure.value = null
  formOpen.value = true
}

const message = (err: unknown) => (err as { statusMessage?: string, data?: { message?: string } }).statusMessage
  || (err as { data?: { message?: string } }).data?.message
  || 'Something went wrong.'

async function run(task: () => Promise<void>) {
  busy.value = true
  failure.value = null
  try {
    await task()
  }
  catch (err) {
    failure.value = message(err)
  }
  finally {
    busy.value = false
  }
}

function submit() {
  const value = form.value
  const input = {
    name: value.name,
    websiteUrl: value.websiteUrl,
    loginUrl: value.loginUrl || null,
    previewUrlPattern: value.previewUrlPattern || null,
    description: value.description || null,
    icon: value.icon || null,
    priority: Number(value.priority) || 0,
    allowedRoles: value.allowedRoles,
    tags: value.tags,
  }
  return run(async () => {
    if (editingId.value) {
      await update(editingId.value, input)
    }
    else {
      const created = await create(input)
      secret.value = { name: created.name, clientId: created.clientId, clientSecret: created.clientSecret }
    }
    formOpen.value = false
  })
}

const rotate = (application: AdminApplicationDto) => run(async () => {
  if (!await confirmAction({
    title: t('admin.rotateTitle', 'Replace the client secret of {name}?', { name: application.name }),
    description: t('admin.rotateDescription', 'The old secret stops working and users are signed out.'),
    confirmText: t('admin.newSecret', 'New secret'),
    destructive: true,
  })) return
  const clientSecret = await rotateSecret(application.id)
  secret.value = { name: application.name, clientId: application.id, clientSecret }
})

const toggle = (application: AdminApplicationDto) => run(async () => {
  await update(application.id, { isActive: !application.isActive })
})

const signOutEveryone = (application: AdminApplicationDto) => run(async () => {
  if (await confirmAction({
    title: t('admin.signOutTitle', 'Sign everyone out of {name}?', { name: application.name }),
    confirmText: t('admin.signOutEveryone', 'Sign everyone out'),
    destructive: true,
  })) await revokeGrants(application.id)
})

const destroy = (application: AdminApplicationDto) => run(async () => {
  if (await confirmAction({
    title: t('admin.deleteTitle', 'Delete {name}?', { name: application.name }),
    description: t('admin.deleteDescription', 'This cannot be undone.'),
    confirmText: t('admin.delete', 'Delete'),
    destructive: true,
  })) await remove(application.id)
})

const columns = [
  { accessorKey: 'name', header: t('admin.application', 'Application') },
  { id: 'access', header: t('admin.access', 'Access') },
  { id: 'grants', header: t('admin.signedIn', 'Signed in') },
  { id: 'actions', header: '' },
]

const rowActions = (application: AdminApplicationDto) => [[
  { label: t('admin.edit', 'Edit'), icon: 'i-lucide-pencil', onSelect: () => openEdit(application) },
  { label: application.isActive ? t('admin.disable', 'Disable') : t('admin.enable', 'Enable'), icon: application.isActive ? 'i-lucide-pause' : 'i-lucide-play', onSelect: () => toggle(application) },
  { label: t('admin.newSecret', 'New secret'), icon: 'i-lucide-key-round', onSelect: () => rotate(application) },
  { label: t('admin.signOutEveryone', 'Sign everyone out'), icon: 'i-lucide-log-out', onSelect: () => signOutEveryone(application) },
], [
  { label: t('admin.delete', 'Delete'), icon: 'i-lucide-trash', color: 'error' as const, onSelect: () => destroy(application) },
]]

const copy = (value: string) => navigator.clipboard?.writeText(value)
</script>

<template>
  <AdminPage>
    <AdminPageHeader :title="t('admin.title', 'OAuth applications')">
      <template #actions>
        <UButton
          v-if="!forbidden"
          icon="i-lucide-plus"
          :label="t('admin.new', 'New application')"
          @click="openCreate"
        />
      </template>
    </AdminPageHeader>

    <UAlert
      v-if="forbidden"
      color="error"
      variant="subtle"
      :title="t('admin.forbidden', 'You are not allowed to manage OAuth applications.')"
    />
    <template v-else>
      <UAlert
        v-if="failure && !formOpen"
        color="error"
        variant="subtle"
        :title="failure"
      />

      <AdminTable
        :data="applications"
        :columns="columns"
        :loading="status === 'pending'"
      >
        <template #name-cell="{ row }">
          <div class="flex min-w-0 items-start gap-3">
            <UIcon
              :name="row.original.icon || 'i-lucide-globe'"
              class="mt-0.5 size-5 shrink-0"
            />
            <div class="min-w-0">
              <p class="flex items-center gap-2 font-medium">
                {{ row.original.name }}
                <UBadge
                  v-if="!row.original.isActive"
                  color="neutral"
                  variant="subtle"
                  :label="t('admin.disabled', 'Disabled')"
                />
              </p>
              <p class="truncate text-sm text-muted">
                {{ row.original.websiteUrl }}
              </p>
              <p class="truncate text-xs text-muted">
                {{ t('admin.callback', 'Callback') }}: {{ row.original.callbackUrl }}
              </p>
            </div>
          </div>
        </template>
        <template #access-cell="{ row }">
          <div class="flex flex-wrap gap-1">
            <UBadge
              v-for="role in row.original.allowedRoles"
              :key="role"
              variant="subtle"
              :label="role"
            />
            <UBadge
              v-if="!row.original.allowedRoles.length"
              color="neutral"
              variant="subtle"
              :label="t('admin.everyone', 'Every signed-in user')"
            />
          </div>
        </template>
        <template #grants-cell="{ row }">
          {{ row.original.activeGrants ?? 0 }}
        </template>
        <template #actions-cell="{ row }">
          <div class="flex justify-end">
            <UDropdownMenu :items="rowActions(row.original)">
              <UButton
                icon="i-lucide-ellipsis"
                color="neutral"
                variant="ghost"
                size="sm"
                :disabled="busy"
                :aria-label="t('admin.actions', 'Actions')"
              />
            </UDropdownMenu>
          </div>
        </template>
        <template #empty>
          <AdminEmpty
            icon="i-lucide-app-window"
            :title="t('admin.empty', 'No applications yet.')"
          />
        </template>
      </AdminTable>
    </template>

    <UModal
      v-model:open="formOpen"
      :title="editingId ? 'Edit application' : 'New application'"
    >
      <template #body>
        <form
          id="oauth-application-form"
          class="grid gap-4"
          @submit.prevent="submit"
        >
          <UFormField
            label="Name"
            required
          >
            <UInput
              v-model="form.name"
              class="w-full"
              required
            />
          </UFormField>
          <UFormField
            label="Website URL"
            description="The origin of the application, without a path. The callback is the website URL plus the configured callback path."
            required
          >
            <UInput
              v-model="form.websiteUrl"
              class="w-full"
              placeholder="https://app.example.com"
              required
            />
          </UFormField>
          <UFormField
            label="Login URL"
            description="Where the Open button goes. Defaults to the website URL."
          >
            <UInput
              v-model="form.loginUrl"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Preview URL pattern"
            description="Optional, e.g. https://*.vercel.app, for preview deployments."
          >
            <UInput
              v-model="form.previewUrlPattern"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Allowed roles"
            description="Leave empty to allow every signed-in user."
          >
            <UInputTags
              v-model="form.allowedRoles"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Tags">
            <UInputTags
              v-model="form.tags"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Description">
            <UTextarea
              v-model="form.description"
              class="w-full"
            />
          </UFormField>
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Icon">
              <UInput
                v-model="form.icon"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Priority">
              <UInput
                v-model.number="form.priority"
                type="number"
                class="w-full"
              />
            </UFormField>
          </div>
          <UAlert
            v-if="failure"
            color="error"
            variant="subtle"
            :title="failure"
          />
        </form>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            color="neutral"
            variant="outline"
            @click="formOpen = false"
          >
            Cancel
          </UButton>
          <UButton
            type="submit"
            form="oauth-application-form"
            :loading="busy"
          >
            {{ editingId ? 'Save' : 'Create' }}
          </UButton>
        </div>
      </template>
    </UModal>

    <UModal
      :open="!!secret"
      :title="secret ? `Credentials for ${secret.name}` : ''"
      description="Copy the client secret now. It is only shown once."
      @update:open="secret = null"
    >
      <template #body>
        <div
          v-if="secret"
          class="grid gap-3 text-sm"
        >
          <div>
            <div class="text-muted">
              Client ID
            </div>
            <code class="break-all">{{ secret.clientId }}</code>
            <UButton
              size="xs"
              variant="link"
              @click="copy(secret.clientId)"
            >
              Copy
            </UButton>
          </div>
          <div>
            <div class="text-muted">
              Client secret
            </div>
            <code class="break-all">{{ secret.clientSecret }}</code>
            <UButton
              size="xs"
              variant="link"
              @click="copy(secret.clientSecret)"
            >
              Copy
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </AdminPage>
</template>
