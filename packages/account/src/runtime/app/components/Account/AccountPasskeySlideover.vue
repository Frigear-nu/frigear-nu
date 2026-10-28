<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

// "Add passkey" form, opened from the security page with `useOverlay()` (only when WebAuthn is enabled). Submitting
// starts the browser's passkey prompt; resolves with `true` once the passkey is registered, or `false` when cancelled.
// Dismissing the browser prompt keeps the slideover open without an error toast.

const props = defineProps<{ userName: string }>()
const emit = defineEmits<{ close: [added: boolean] }>()

const t = useModuleT('account.security.passkeys')
const showError = useErrorToast()
const passkeys = usePasskeys()
const busy = ref(false)

const schema = z.object({
  name: z.string().trim().max(100),
})
type Schema = z.output<typeof schema>

const state = reactive<Schema>({ name: '' })

async function onSubmit(event: FormSubmitEvent<Schema>) {
  busy.value = true
  try {
    await passkeys.registerPasskey(props.userName, event.data.name)
    emit('close', true)
  }
  catch (e) {
    // Dismissing the browser prompt rejects with a NotAllowedError, which is not worth an error toast.
    if ((e as { name?: string })?.name !== 'NotAllowedError') {
      showError(e, t('registerError', 'Could not register the passkey.'))
    }
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <FormSlideover
    form-id="account-passkey"
    :title="t('add', 'Add passkey')"
    :description="t('description', 'Sign in with your fingerprint, face or device PIN instead of a password.')"
    :submit-label="t('add', 'Add passkey')"
    :loading="busy"
    @close="emit('close', false)"
  >
    <UForm
      id="account-passkey"
      :schema="schema"
      :state="state"
      class="flex flex-col gap-4"
      @submit="onSubmit"
    >
      <UFormField
        name="name"
        :label="t('name.label', 'Passkey name')"
        :description="t('name.description', 'Optional. Helps you tell your passkeys apart.')"
      >
        <UInput
          v-model="state.name"
          :placeholder="t('name.placeholder', 'Name, e.g. MacBook')"
          maxlength="100"
          class="w-full"
        />
      </UFormField>
    </UForm>
  </FormSlideover>
</template>
