<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import { reactive, useAccount, useAction, useModuleT } from '#imports'

// "Change email" form, opened from the profile page with `useOverlay()`. Resolves with `{ verificationRequired }`
// (true when `users.settings.verifyEmailChange` sends a confirmation link first) or `false` when cancelled.

const props = defineProps<{ email?: string }>()
const emit = defineEmits<{ close: [result: { verificationRequired: boolean } | false] }>()

const t = useModuleT('account.profile')
const { changeEmailAddress } = useAccount()
const { busy, run } = useAction()

const schema = z.object({
  email: z.email(t('email.invalid', 'Enter a valid email address.')),
})
type Schema = z.output<typeof schema>

const state = reactive<Schema>({ email: '' })

async function onSubmit(event: FormSubmitEvent<Schema>) {
  const result = await run(
    () => changeEmailAddress({ email: event.data.email }),
    { error: t('email.change.error', 'Could not change your email address.') },
  )
  if (!result) return
  emit('close', { verificationRequired: (result as { verificationRequired?: boolean }).verificationRequired === true })
}
</script>

<template>
  <FormSlideover
    form-id="account-change-email"
    :title="t('email.change.title', 'Change email')"
    :description="props.email ? t('email.change.current', 'Your address is now {email}.', { email: props.email }) : undefined"
    :submit-label="t('email.change.title', 'Change email')"
    :loading="busy"
    @close="emit('close', false)"
  >
    <UForm
      id="account-change-email"
      :schema="schema"
      :state="state"
      class="flex flex-col gap-4"
      @submit="onSubmit"
    >
      <UFormField
        name="email"
        :label="t('email.change.label', 'New email')"
        required
      >
        <UInput
          v-model="state.email"
          type="email"
          autocomplete="email"
          class="w-full"
        />
      </UFormField>
    </UForm>
  </FormSlideover>
</template>
