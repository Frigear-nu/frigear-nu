<script setup lang="ts">
import { computed, reactive, ref, resolveComponent } from 'vue'
import { AUTH_WIDGET_AREAS } from '../../utils/register-extras'
import { useAfterLogin, useAuthPages, useModuleT, useRegistration } from '#imports'

defineOptions({ name: 'UsersRegisterPage' })

const t = useModuleT('auth')
const { register, pending, error } = useRegistration()
const loginPath = useAuthPages().login

const { requested: requestedRedirect, go: afterLogin } = useAfterLogin()
const loginLink = computed(() => requestedRedirect.value
  ? `${loginPath}?redirect=${encodeURIComponent(requestedRedirect.value)}`
  : loginPath)

const fields = computed(() => [
  { name: 'name', type: 'text' as const, label: t('name.label', 'Name'), autocomplete: 'name', required: true },
  { name: 'email', type: 'email' as const, label: t('email.label', 'Email'), autocomplete: 'email', required: true },
  { name: 'password', type: 'password' as const, label: t('password.label', 'Password'), autocomplete: 'new-password', required: true },
])

// Other modules add fields below the form through the `auth.register` widget area (`@frigear-nu/widget`, optional: the
// area only renders when it is installed). A widget puts what it collects under its module's key with `setExtra`.
const WidgetArea = resolveComponent('WidgetArea')
const widgetArea = typeof WidgetArea === 'string' ? undefined : WidgetArea
const extras = reactive(new Map<string, unknown>())
function setExtra(module: string, value: unknown) {
  if (value === undefined) extras.delete(module)
  else extras.set(module, value)
}

// With `verifyEmail` no session is created: the emailed link verifies the address and signs the user in.
const verificationSent = ref(false)

async function onSubmit(payload: { data: { name: string, email: string, password: string } }) {
  const result = await register({ ...payload.data, ...(extras.size ? { extras: Object.fromEntries(extras) } : {}) })
  if (result?.verificationRequired) {
    verificationSent.value = true
    return
  }
  await afterLogin()
}
</script>

<template>
  <AuthCard
    :title="verificationSent ? t('verifyEmail.title', 'Verify your e-mail') : t('signUp', 'Sign up')"
    :description="verificationSent ? t('verifyEmail.description', 'We have sent you an e-mail. Check your inbox or spam.') : undefined"
  >
    <UAuthForm
      v-if="!verificationSent"
      :fields="fields"
      :loading="pending"
      :submit="{ label: t('signUp', 'Sign up'), block: true }"
      @submit="onSubmit"
    >
      <template
        v-if="error || widgetArea"
        #validation
      >
        <component
          :is="widgetArea"
          v-if="widgetArea"
          :name="AUTH_WIDGET_AREAS.register"
          :context="{ setExtra }"
          grid-class="flex flex-col gap-3"
        />
        <UAlert
          v-if="error"
          color="error"
          variant="subtle"
          :title="error"
        />
      </template>
    </UAuthForm>

    <template
      v-if="!verificationSent"
      #description
    >
      {{ t('alreadyHaveAnAccount', 'Already have an account? ➜') }}
      <ULink
        :to="loginLink"
        class="font-medium text-primary"
      >
        {{ t('signIn', 'Log in') }}
      </ULink>.
    </template>
  </AuthCard>
</template>
