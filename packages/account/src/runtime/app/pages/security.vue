<script setup lang="ts">
import { z } from 'zod'
import type { DropdownMenuItem, FormSubmitEvent } from '@nuxt/ui'
import { authApi } from '@frigear-nu/auth/api'
import type { AuthPasskeyDto } from '@frigear-nu/auth/utils'
import AccountPasskeySlideover from '../components/Account/AccountPasskeySlideover.vue'
import AccountSignedInApps from '../components/Account/AccountSignedInApps.vue'
import { computed, errorMessage, reactive, useAccount, useAction, useCachedFetch, useConfirmDialog, useErrorToast, useFormat, useModuleT, useOverlay, usePasskeys, useRuntimeConfig, useToast, useUserSession } from '#imports'

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
// The applications signed in with this account, when `@frigear-nu/oauth-server` is installed.
const signedInApps = useRuntimeConfig().public.account?.signedInApps === true

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
type Passkey = AuthPasskeyDto

// Loaded on the server (awaited), so the card renders with the list instead of "no passkeys" until the client
// catches up. Keyed by user so another account on the same browser never sees a remembered list; it is refetched on
// every visit (`ttl: 0`) while the remembered one stays on screen. Nothing is requested when WebAuthn is off.
const {
  data: passkeyData,
  error: passkeysError,
  loading: passkeysLoading,
  refresh: loadPasskeys,
} = await useCachedFetch<Passkey[]>(authApi.me.passkeys, {
  key: () => `account:passkeys:${user.value?.id ?? 'anonymous'}`,
  ttl: 0,
  immediate: webAuthnEnabled,
  watch: false,
})
const passkeyList = computed(() => passkeyData.value ?? [])

const overlay = useOverlay()
const passkeySlideover = overlay.create(AccountPasskeySlideover, { destroyOnClose: true })

async function onAddPasskey() {
  const added = await passkeySlideover.open({ userName: user.value?.email ?? '' })
  if (!added) return
  toast.add({ title: t('passkeys.registered', 'Passkey added.'), color: 'success', icon: 'i-lucide-check' })
  await loadPasskeys()
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
</script>

<template>
  <div class="flex flex-col gap-4">
    <AccountHeader />

    <SectionCard
      :title="t('password.title', 'Password')"
      :description="t('password.description', 'Change your password.')"
    >
      <UForm
        id="account-change-password"
        :schema="passwordSchema"
        :state="passwordState"
        class="flex flex-col divide-y divide-default"
        @submit="onSubmitPassword"
      >
        <FormRow
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
        </FormRow>
        <FormRow
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
        </FormRow>
        <FormRow
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
        </FormRow>
      </UForm>
      <template #footer>
        <div class="flex justify-end gap-2">
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
      :loading="passkeysLoading"
      flush
    >
      <template #actions>
        <UButton
          icon="i-lucide-plus"
          :label="t('passkeys.add', 'Add passkey')"
          @click="onAddPasskey"
        />
      </template>
      <ul
        v-if="passkeyList.length"
        class="divide-y divide-default"
      >
        <li
          v-for="passkey in passkeyList"
          :key="passkey.id"
          class="flex items-center gap-3 px-4 py-3"
        >
          <UIcon
            name="i-lucide-key-round"
            class="size-5 shrink-0 text-muted"
          />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-highlighted">
              {{ passkeyLabel(passkey) }}
            </p>
            <p class="text-sm text-muted">
              {{ t('passkeys.created', 'Added {date}', { date: format.date(passkey.createdAt) }) }}
            </p>
          </div>
          <RowMenu
            :items="passkeyMenu(passkey)"
            :subject="passkeyLabel(passkey)"
          />
        </li>
      </ul>
      <UEmpty
        v-else-if="passkeysError"
        variant="naked"
        icon="i-lucide-circle-alert"
        :title="t('passkeys.loadError', 'Could not load your passkeys.')"
        :description="errorMessage(passkeysError, '')"
        :actions="[{ label: t('passkeys.tryAgain', 'Try again'), icon: 'i-lucide-rotate-ccw', color: 'neutral', variant: 'outline', onClick: () => loadPasskeys() }]"
      />
      <UEmpty
        v-else
        variant="naked"
        icon="i-lucide-key-round"
        :title="t('passkeys.empty', 'You have not added any passkeys yet.')"
        :actions="[{ label: t('passkeys.add', 'Add passkey'), icon: 'i-lucide-plus', onClick: onAddPasskey }]"
      />
    </SectionCard>

    <AccountSignedInApps v-if="signedInApps" />
  </div>
</template>
