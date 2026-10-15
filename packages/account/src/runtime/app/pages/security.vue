<script setup lang="ts">
import { z } from 'zod'
import type { DropdownMenuItem, FormSubmitEvent } from '@nuxt/ui'

defineOptions({ name: 'AccountSecurityPage' })

const t = useModuleT('account.security')
const toast = useToast()
const showError = useErrorToast()
const confirm = useConfirmDialog()
const format = useFormat()
const { user } = useUserSession()
const { changePassword } = useAccount()
// Guarded like `@frigear-nu/auth`'s own `login.vue` - `usePasskeys()` calls `useWebAuthn()`
// internally, which isn't available when WebAuthn is disabled (the default).
const webAuthnEnabled = useRuntimeConfig().public.authentication?.webAuthn === true
const passkeys = webAuthnEnabled ? usePasskeys() : undefined

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
const passwordAction = useAction()

async function onSubmitPassword(event: FormSubmitEvent<PasswordSchema>) {
  const changed = await passwordAction.run(
    async () => {
      await changePassword(event.data)
      return true
    },
    { success: t('changePassword.success', 'Your password was changed.'), error: t('changePassword.error', 'Could not change your password.') },
  )
  if (!changed) return
  passwordState.currentPassword = ''
  passwordState.newPassword = ''
  passwordState.confirmNewPassword = ''
}

// --- Passkeys --------------------------------------------------------------------------------------------------
interface Passkey { id: string, name: string | null, createdAt: string | Date }

const passkeyList = ref<Passkey[]>([])
const passkeyName = ref('')
const passkeyPending = ref(false)
const passkeysLoading = ref(false)

async function loadPasskeys() {
  if (!passkeys) return
  passkeysLoading.value = true
  try {
    passkeyList.value = await passkeys.listPasskeys()
  }
  catch (e) {
    showError(e, t('passkeys.loadError', 'Could not load your passkeys.'))
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
    toast.add({ title: t('passkeys.registered', 'Passkey added.'), color: 'success', icon: 'i-lucide-check' })
    await loadPasskeys()
  }
  catch (e) {
    // Dismissing the browser prompt rejects with a NotAllowedError, which is not worth an error toast.
    if ((e as { name?: string })?.name !== 'NotAllowedError') {
      showError(e, t('passkeys.registerError', 'Could not register the passkey.'))
    }
  }
  finally {
    passkeyPending.value = false
  }
}

const passkeyLabel = (passkey: Passkey) => passkey.name || t('passkeys.unnamed', 'Passkey')

async function onRemovePasskey(passkey: Passkey) {
  const confirmed = await confirm({
    title: t('passkeys.removeConfirm.title', 'Remove {name}?', { name: passkeyLabel(passkey) }),
    description: t('passkeys.removeConfirm.description', 'You can no longer sign in with this passkey. It stays on your device until you delete it there.'),
    confirmText: t('passkeys.remove', 'Remove passkey'),
    destructive: true,
  })
  if (!confirmed) return
  try {
    await passkeys?.removePasskey(passkey.id)
    toast.add({ title: t('passkeys.removed', 'Passkey removed.'), description: passkeyLabel(passkey), color: 'success', icon: 'i-lucide-check' })
    await loadPasskeys()
  }
  catch (e) {
    showError(e, t('passkeys.removeError', 'Could not remove the passkey.'))
  }
}

const passkeyMenu = (passkey: Passkey): DropdownMenuItem[][] => [[
  { label: t('passkeys.remove', 'Remove passkey'), icon: 'i-lucide-trash-2', color: 'error', onSelect: () => onRemovePasskey(passkey) },
]]

onMounted(loadPasskeys)
</script>

<template>
  <div class="flex flex-col gap-4">
    <SectionCard
      :title="t('password.title', 'Password')"
      :description="t('password.description', 'Change your password.')"
    >
      <UForm
        id="account-change-password"
        :schema="passwordSchema"
        :state="passwordState"
        class="flex flex-col gap-4"
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
            class="w-full sm:max-w-sm"
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
            class="w-full sm:max-w-sm"
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
            class="w-full sm:max-w-sm"
          />
        </UFormField>
      </UForm>
      <template #footer>
        <div class="flex justify-end">
          <UButton
            type="submit"
            form="account-change-password"
            :loading="passwordAction.busy.value"
            :label="t('changePassword.submit', 'Change password')"
          />
        </div>
      </template>
    </SectionCard>

    <SectionCard
      v-if="passkeys?.isEnabled.value"
      :title="t('passkeys.title', 'Passkeys')"
      :description="t('passkeys.description', 'Sign in with your fingerprint, face or device PIN instead of a password.')"
      :loading="passkeysLoading && !passkeyList.length"
      flush
    >
      <ul
        v-if="passkeyList.length"
        class="divide-y divide-default"
      >
        <li
          v-for="passkey in passkeyList"
          :key="passkey.id"
          class="flex items-center justify-between gap-3 px-4 py-3"
        >
          <div class="flex min-w-0 items-center gap-3">
            <UIcon
              name="i-lucide-key-round"
              class="size-5 shrink-0 text-muted"
            />
            <div class="min-w-0">
              <p class="truncate text-sm font-medium text-highlighted">
                {{ passkeyLabel(passkey) }}
              </p>
              <p class="text-sm text-muted">
                {{ t('passkeys.created', 'Added {date}', { date: format.date(passkey.createdAt) }) }}
              </p>
            </div>
          </div>
          <RowMenu
            :items="passkeyMenu(passkey)"
            :subject="passkeyLabel(passkey)"
          />
        </li>
      </ul>
      <UEmpty
        v-else
        variant="naked"
        icon="i-lucide-key-round"
        :title="t('passkeys.empty', 'You have not added any passkeys yet.')"
      />

      <template #footer>
        <form
          class="flex flex-col gap-2 sm:flex-row sm:justify-end"
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
            icon="i-lucide-plus"
            :loading="passkeyPending"
            :label="t('passkeys.register', 'Register a passkey')"
          />
        </form>
      </template>
    </SectionCard>
  </div>
</template>
