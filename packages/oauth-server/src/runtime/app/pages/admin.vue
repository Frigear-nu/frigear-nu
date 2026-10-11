<script setup lang="ts">
import type { AdminApplicationDto } from '../../../types'

defineOptions({ name: 'OAuthAdminPage' })

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
  if (!confirm(`Replace the client secret of ${application.name}? The old secret stops working and users are signed out.`)) return
  const clientSecret = await rotateSecret(application.id)
  secret.value = { name: application.name, clientId: application.id, clientSecret }
})

const toggle = (application: AdminApplicationDto) => run(async () => {
  await update(application.id, { isActive: !application.isActive })
})

const signOutEveryone = (application: AdminApplicationDto) => run(async () => {
  if (confirm(`Sign everyone out of ${application.name}?`)) await revokeGrants(application.id)
})

const destroy = (application: AdminApplicationDto) => run(async () => {
  if (confirm(`Delete ${application.name}? This cannot be undone.`)) await remove(application.id)
})

const copy = (value: string) => navigator.clipboard?.writeText(value)
</script>

<template>
  <UContainer class="max-w-none py-10">
    <div class="mb-6 flex items-center justify-between gap-4">
      <h1 class="text-2xl font-semibold">
        OAuth applications
      </h1>
      <UButton
        v-if="!forbidden"
        icon="i-lucide-plus"
        @click="openCreate"
      >
        New application
      </UButton>
    </div>

    <UAlert
      v-if="forbidden"
      color="error"
      variant="subtle"
      title="You are not allowed to manage OAuth applications."
    />
    <UAlert
      v-else-if="failure && !formOpen"
      class="mb-4"
      color="error"
      variant="subtle"
      :title="failure"
    />

    <p
      v-if="!forbidden && status !== 'pending' && !applications.length"
      class="text-muted"
    >
      No applications yet.
    </p>

    <div class="grid gap-4">
      <UCard
        v-for="application in applications"
        :key="application.id"
      >
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div class="flex min-w-0 items-start gap-3">
            <UIcon
              :name="application.icon || 'i-lucide-globe'"
              class="mt-1 size-6 shrink-0"
            />
            <div class="min-w-0">
              <h2 class="flex items-center gap-2 font-medium">
                {{ application.name }}
                <UBadge
                  v-if="!application.isActive"
                  color="neutral"
                  variant="subtle"
                >
                  Disabled
                </UBadge>
              </h2>
              <p class="truncate text-sm text-muted">
                {{ application.websiteUrl }} · {{ application.activeGrants ?? 0 }} signed in
              </p>
              <p class="truncate text-xs text-muted">
                Callback: {{ application.callbackUrl }}
              </p>
              <div class="mt-2 flex flex-wrap gap-1">
                <UBadge
                  v-for="role in application.allowedRoles"
                  :key="role"
                  variant="subtle"
                >
                  {{ role }}
                </UBadge>
                <UBadge
                  v-if="!application.allowedRoles.length"
                  color="neutral"
                  variant="subtle"
                >
                  Every signed-in user
                </UBadge>
              </div>
            </div>
          </div>
          <div class="flex flex-wrap gap-2">
            <UButton
              size="sm"
              color="neutral"
              variant="outline"
              :disabled="busy"
              @click="openEdit(application)"
            >
              Edit
            </UButton>
            <UButton
              size="sm"
              color="neutral"
              variant="outline"
              :disabled="busy"
              @click="toggle(application)"
            >
              {{ application.isActive ? 'Disable' : 'Enable' }}
            </UButton>
            <UButton
              size="sm"
              color="neutral"
              variant="outline"
              :disabled="busy"
              @click="rotate(application)"
            >
              New secret
            </UButton>
            <UButton
              size="sm"
              color="neutral"
              variant="outline"
              :disabled="busy"
              @click="signOutEveryone(application)"
            >
              Sign everyone out
            </UButton>
            <UButton
              size="sm"
              color="error"
              variant="outline"
              :disabled="busy"
              @click="destroy(application)"
            >
              Delete
            </UButton>
          </div>
        </div>
      </UCard>
    </div>

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
            help="The origin of the application, without a path. The callback is the website URL plus the configured callback path."
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
            help="Where the Open button goes. Defaults to the website URL."
          >
            <UInput
              v-model="form.loginUrl"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Preview URL pattern"
            help="Optional, e.g. https://*.vercel.app, for preview deployments."
          >
            <UInput
              v-model="form.previewUrlPattern"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Allowed roles"
            help="Leave empty to allow every signed-in user."
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
  </UContainer>
</template>
