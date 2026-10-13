<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

defineOptions({ name: 'AccountSecurityPage' })

const t = useModuleT('account.security')
const toast = useToast()
const { user } = useUserSession()
const { changePassword, pending } = useAccount()
// Guarded like `@frigear-nu/auth`'s own `login.vue` - `usePasskeys()` calls `useWebAuthn()`
// internally, which isn't available when WebAuthn is disabled (the default).
const webAuthnEnabled = useRuntimeConfig().public.authentication?.webAuthn === true
const passkeys = webAuthnEnabled ? usePasskeys() : undefined

function errorMessage(e: unknown, fallback: string) {
  const err = e as { data?: { statusMessage?: string }, statusMessage?: string, message?: string }
  return err?.data?.statusMessage ?? err?.statusMessage ?? fallback
}

// --- Change password -------------------------------------------------------------------------------------------
const passwordSchema = z.object({
  currentPassword: z.string().min(1, t('changePassword.current.required', 'Enter your current password.')),
  newPassword: z.string().min(8, t('changePassword.new.min', 'Use at least 8 characters.')),
  confirmNewPassword: z.string(),
}).refine(data => data.newPassword === data.confirmNewPassword, {
  message: t('changePassword.confirm.mismatch', 'The passwords do not match.'),
  path: ['confirmNewPassword'],
})
type PasswordSchema = z.output<typeof passwordSchema>

const passwordState = reactive<PasswordSchema>({ currentPassword: '', newPassword: '', confirmNewPassword: '' })

async function onSubmitPassword(event: FormSubmitEvent<PasswordSchema>) {
  try {
    await changePassword(event.data)
    passwordState.currentPassword = ''
    passwordState.newPassword = ''
    passwordState.confirmNewPassword = ''
    toast.add({ title: t('changePassword.success', 'Your password was changed.'), color: 'success' })
  }
  catch (e) {
    toast.add({ title: errorMessage(e, t('changePassword.error', 'Could not change your password.')), color: 'error' })
  }
}

// --- Passkeys --------------------------------------------------------------------------------------------------
interface Passkey { id: string, name: string | null, createdAt: string | Date }

const passkeyList = ref<Passkey[]>([])
const passkeyName = ref('')
const passkeyPending = ref(false)
const passkeysLoading = ref(false)
const removingId = ref<string | null>(null)

async function loadPasskeys() {
  if (!passkeys) return
  passkeysLoading.value = true
  try {
    passkeyList.value = await passkeys.listPasskeys()
  }
  catch (e) {
    toast.add({ title: errorMessage(e, t('passkeys.loadError', 'Could not load your passkeys.')), color: 'error' })
  }
  finally {
    passkeysLoading.value = false
  }
}

async function onRegisterPasskey() {
  passkeyPending.value = true
  try {
    await passkeys?.registerPasskey(user.value?.email ?? '', passkeyName.value)
    passkeyName.value = ''
    toast.add({ title: t('passkeys.registered', 'Passkey added.'), color: 'success' })
    await loadPasskeys()
  }
  catch (e) {
    // Dismissing the browser prompt rejects with a NotAllowedError, which is not worth an error toast.
    if ((e as { name?: string })?.name !== 'NotAllowedError') {
      toast.add({ title: errorMessage(e, t('passkeys.registerError', 'Could not register the passkey.')), color: 'error' })
    }
  }
  finally {
    passkeyPending.value = false
  }
}

async function onRemovePasskey(id: string) {
  removingId.value = id
  try {
    await passkeys?.removePasskey(id)
    toast.add({ title: t('passkeys.removed', 'Passkey removed.'), color: 'success' })
    await loadPasskeys()
  }
  catch (e) {
    toast.add({ title: errorMessage(e, t('passkeys.removeError', 'Could not remove the passkey.')), color: 'error' })
  }
  finally {
    removingId.value = null
  }
}

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })
function formatDate(value: string | Date) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : dateFormatter.format(date)
}

onMounted(loadPasskeys)
</script>

<template>
  <UContainer>
    <UPage>
      <UPageBody>
        <UPageCard
          :title="t('password.title', 'Password')"
          :description="t('password.description', 'Change your password.')"
          variant="subtle"
        >
          <UForm
            :schema="passwordSchema"
            :state="passwordState"
            class="space-y-4"
            @submit="onSubmitPassword"
          >
            <UFormField
              :label="t('changePassword.current.label', 'Current password')"
              name="currentPassword"
              required
            >
              <UInput
                v-model="passwordState.currentPassword"
                type="password"
                autocomplete="current-password"
                class="w-full"
              />
            </UFormField>
            <UFormField
              :label="t('changePassword.new.label', 'New password')"
              name="newPassword"
              required
            >
              <UInput
                v-model="passwordState.newPassword"
                type="password"
                autocomplete="new-password"
                class="w-full"
              />
            </UFormField>
            <UFormField
              :label="t('changePassword.confirm.label', 'Confirm new password')"
              name="confirmNewPassword"
              required
            >
              <UInput
                v-model="passwordState.confirmNewPassword"
                type="password"
                autocomplete="new-password"
                class="w-full"
              />
            </UFormField>
            <UButton
              type="submit"
              :loading="pending"
              :label="t('changePassword.submit', 'Change password')"
            />
          </UForm>
        </UPageCard>

        <UPageCard
          v-if="passkeys?.isEnabled.value"
          :title="t('passkeys.title', 'Passkeys')"
          :description="t('passkeys.description', 'Sign in with your fingerprint, face or device PIN instead of a password.')"
          variant="subtle"
        >
          <ul
            v-if="passkeyList.length"
            class="divide-y divide-default"
          >
            <li
              v-for="passkey in passkeyList"
              :key="passkey.id"
              class="flex items-center justify-between gap-3 py-3"
            >
              <div class="flex min-w-0 items-center gap-3">
                <UIcon
                  name="i-lucide-key-round"
                  class="size-5 shrink-0 text-muted"
                />
                <div class="min-w-0">
                  <p class="truncate font-medium text-highlighted">
                    {{ passkey.name || t('passkeys.unnamed', 'Passkey') }}
                  </p>
                  <p class="text-sm text-muted">
                    {{ t('passkeys.created', 'Added {date}', { date: formatDate(passkey.createdAt) }) }}
                  </p>
                </div>
              </div>
              <UButton
                color="error"
                variant="ghost"
                icon="i-lucide-trash-2"
                :loading="removingId === passkey.id"
                :aria-label="t('passkeys.remove', 'Remove passkey')"
                @click="onRemovePasskey(passkey.id)"
              />
            </li>
          </ul>
          <p
            v-else-if="!passkeysLoading"
            class="text-sm text-muted"
          >
            {{ t('passkeys.empty', 'You have not added any passkeys yet.') }}
          </p>

          <form
            class="flex flex-col gap-2 sm:flex-row"
            @submit.prevent="onRegisterPasskey"
          >
            <UInput
              v-model="passkeyName"
              :placeholder="t('passkeys.name.placeholder', 'Name, e.g. MacBook')"
              :aria-label="t('passkeys.name.label', 'Passkey name')"
              maxlength="100"
              class="w-full sm:max-w-xs"
            />
            <UButton
              type="submit"
              :loading="passkeyPending"
              :label="t('passkeys.register', 'Register a passkey')"
            />
          </form>
        </UPageCard>
      </UPageBody>
    </UPage>
  </UContainer>
</template>
