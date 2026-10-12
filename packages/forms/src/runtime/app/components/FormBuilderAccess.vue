<script setup lang="ts">
import type { CreatedFormAccessTokenDto, FormAccessTokenDto, FormAuthMode, FormAvailability, FormDefinition, FormPasswordStatusDto } from '../../../types'
import { resolveAccess, setAccess } from '../../utils'

const definition = defineModel<FormDefinition>({ required: true })
const props = defineProps<{ formId: string, slug: string }>()

const t = useModuleT('forms')
const toast = useToast()
const base = computed(() => `/api/forms/admin/forms/${props.formId}`)
const access = computed(() => resolveAccess(definition.value))

const availabilities = computed(() => [
  { value: 'web', label: t('access.availabilityWeb', 'Web page and API') },
  { value: 'api', label: t('access.availabilityApi', 'API only') },
])
const authModes = computed(() => [
  { value: 'none', label: t('access.authNone', 'Open to everyone') },
  { value: 'user', label: t('access.authUser', 'Signed-in users') },
  { value: 'token', label: t('access.authToken', 'API token') },
  { value: 'password', label: t('access.authPassword', 'Shared password') },
])

const fail = (cause: unknown) => toast.add({
  title: (cause as { statusMessage?: string }).statusMessage ?? t('error.generic', 'Something went wrong. Please try again.'),
  color: 'error',
})

// --- Tokens ---------------------------------------------------------------------------------
const { data: tokens, refresh: refreshTokens } = await useFetch<FormAccessTokenDto[]>(() => `${base.value}/tokens`, { default: () => [] })
const tokenName = ref('')
const creating = ref(false)
const revealed = ref<CreatedFormAccessTokenDto>()

async function createToken() {
  creating.value = true
  try {
    revealed.value = await $fetch<CreatedFormAccessTokenDto>(`${base.value}/tokens`, { method: 'POST', body: { name: tokenName.value } })
    tokenName.value = ''
    await refreshTokens()
  }
  catch (cause) {
    fail(cause)
  }
  finally {
    creating.value = false
  }
}

async function revoke(token: FormAccessTokenDto) {
  try {
    await $fetch(`${base.value}/tokens/${token.id}`, { method: 'DELETE' })
    await refreshTokens()
  }
  catch (cause) {
    fail(cause)
  }
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.add({ title: t('preview.copied', 'Copied to clipboard.'), color: 'success' })
  }
  catch (cause) {
    fail(cause)
  }
}

// --- Password -------------------------------------------------------------------------------
const { data: passwordStatus, refresh: refreshPassword } = await useFetch<FormPasswordStatusDto>(() => `${base.value}/password`, { default: () => ({ set: false }) })
const password = ref('')
const savingPassword = ref(false)

async function savePassword() {
  savingPassword.value = true
  try {
    await $fetch(`${base.value}/password`, { method: 'PUT', body: { password: password.value } })
    password.value = ''
    await refreshPassword()
    toast.add({ title: t('access.passwordSaved', 'Password saved.'), color: 'success' })
  }
  catch (cause) {
    fail(cause)
  }
  finally {
    savingPassword.value = false
  }
}

async function clearPassword() {
  try {
    await $fetch(`${base.value}/password`, { method: 'DELETE' })
    await refreshPassword()
  }
  catch (cause) {
    fail(cause)
  }
}

// --- API snippet ----------------------------------------------------------------------------
const origin = useRequestURL().origin
const submitUrl = computed(() => `${origin}/api/forms/${props.slug}/submit`)
const snippet = computed(() => {
  const headers = {
    token: '  -H \'Authorization: Bearer TOKEN\' \\\n',
    password: '  -H \'x-form-password: <password>\' \\\n',
    user: '  -H \'Cookie: <session cookie of a signed-in user>\' \\\n',
    none: '',
  }[access.value.auth]
  return `curl -X POST '${submitUrl.value}' \\\n${headers}  -H 'content-type: application/json' \\\n  -d '{"answers":{"field":"value"},"locale":"en"}'`
})
</script>

<template>
  <div class="max-w-2xl space-y-8">
    <section class="space-y-4">
      <h2 class="font-semibold">
        {{ t('access.title', 'Who can use this form') }}
      </h2>
      <UFormField
        :label="t('access.availability', 'Availability')"
        :description="access.availability === 'api'
          ? t('access.availabilityApiHint', 'No public page: the form can only be read and submitted through the API.')
          : t('access.availabilityWebHint', 'The public page and the API are both available.')"
      >
        <USelect
          :model-value="access.availability"
          :items="availabilities"
          :disabled="access.auth === 'token'"
          class="w-full"
          @update:model-value="definition = setAccess(definition, { availability: $event as FormAvailability })"
        />
      </UFormField>

      <UFormField
        :label="t('access.auth', 'Authentication')"
        :description="access.auth === 'token' ? t('access.authTokenHint', 'Token forms are API only: a token cannot be typed into a page.') : undefined"
      >
        <USelect
          :model-value="access.auth"
          :items="authModes"
          class="w-full"
          @update:model-value="definition = setAccess(definition, { auth: $event as FormAuthMode })"
        />
      </UFormField>
      <p class="text-sm text-muted">
        {{ t('access.saveHint', 'Availability and authentication are saved with the form. Tokens and the password take effect immediately.') }}
      </p>
    </section>

    <section class="space-y-4">
      <h2 class="font-semibold">
        {{ t('access.tokensTitle', 'API tokens') }}
      </h2>
      <p class="text-sm text-muted">
        {{ t('access.tokensHint', 'Send a token as Authorization: Bearer TOKEN or in the x-form-token header. It is shown only once.') }}
      </p>
      <UAlert
        v-if="access.auth !== 'token'"
        color="neutral"
        variant="subtle"
        :title="t('access.tokensInactive', 'Tokens are only checked when authentication is set to API token.')"
      />

      <form
        class="flex gap-2"
        @submit.prevent="createToken"
      >
        <UInput
          v-model="tokenName"
          :placeholder="t('access.tokenName', 'Token name, e.g. Mobile app')"
          class="flex-1"
        />
        <UButton
          type="submit"
          :loading="creating"
          :disabled="!tokenName.trim()"
          :label="t('access.createToken', 'Create token')"
        />
      </form>

      <UAlert
        v-if="revealed"
        color="success"
        variant="subtle"
        :title="t('access.tokenCreated', 'Copy this token now. You will not see it again.')"
        :close="true"
        @update:open="revealed = undefined"
      >
        <template #description>
          <div class="mt-2 flex items-center gap-2">
            <code
              data-testid="revealed-token"
              class="break-all rounded bg-elevated px-2 py-1 text-xs"
            >{{ revealed.token }}</code>
            <UButton
              color="neutral"
              variant="outline"
              size="xs"
              icon="i-lucide-copy"
              :label="t('preview.copy', 'Copy')"
              @click="copy(revealed.token)"
            />
          </div>
        </template>
      </UAlert>

      <ul
        v-if="tokens?.length"
        class="divide-y divide-default rounded-md border border-default"
      >
        <li
          v-for="token in tokens"
          :key="token.id"
          class="flex items-center justify-between gap-3 p-3"
        >
          <div class="min-w-0">
            <p class="truncate font-medium">
              {{ token.name }}
              <UBadge
                v-if="token.revokedAt"
                color="error"
                variant="subtle"
                size="sm"
                :label="t('access.revoked', 'Revoked')"
              />
            </p>
            <p class="text-xs text-muted">
              <code>{{ token.prefix }}…</code>
              ·
              {{ token.lastUsedAt
                ? t('access.lastUsed', 'Last used {date}', { date: new Date(token.lastUsedAt).toLocaleString() })
                : t('access.neverUsed', 'Never used') }}
            </p>
          </div>
          <UButton
            v-if="!token.revokedAt"
            color="error"
            variant="outline"
            size="xs"
            :label="t('access.revoke', 'Revoke')"
            @click="revoke(token)"
          />
        </li>
      </ul>
      <p
        v-else
        class="text-sm text-muted"
      >
        {{ t('access.noTokens', 'No tokens yet.') }}
      </p>
    </section>

    <section class="space-y-4">
      <h2 class="font-semibold">
        {{ t('access.passwordTitle', 'Shared password') }}
      </h2>
      <UAlert
        v-if="access.auth === 'password' && !passwordStatus?.set"
        color="warning"
        variant="subtle"
        :title="t('access.passwordMissing', 'No password is set, so nobody can open this form yet.')"
      />
      <p
        v-else
        class="text-sm text-muted"
      >
        {{ passwordStatus?.set ? t('access.passwordIsSet', 'A password is set.') : t('access.passwordIsNotSet', 'No password is set.') }}
        {{ access.auth !== 'password' ? t('access.passwordInactive', 'It is only checked when authentication is set to Shared password.') : '' }}
      </p>
      <form
        class="flex gap-2"
        @submit.prevent="savePassword"
      >
        <UInput
          v-model="password"
          type="password"
          autocomplete="new-password"
          :placeholder="passwordStatus?.set ? t('access.newPassword', 'New password') : t('access.setPassword', 'Password (min. 6 characters)')"
          class="flex-1"
        />
        <UButton
          type="submit"
          :loading="savingPassword"
          :disabled="password.length < 6"
          :label="passwordStatus?.set ? t('access.changePassword', 'Change') : t('access.savePassword', 'Set password')"
        />
        <UButton
          v-if="passwordStatus?.set"
          type="button"
          color="error"
          variant="outline"
          :label="t('access.clearPassword', 'Clear')"
          @click="clearPassword"
        />
      </form>
    </section>

    <section class="space-y-3">
      <h2 class="font-semibold">
        {{ t('access.apiTitle', 'API') }}
      </h2>
      <p class="text-sm text-muted">
        {{ t('access.apiHint', 'Submit with POST (JSON, or multipart with file:KEY parts). The definition is available with GET on /api/forms/{slug}.', { slug: props.slug }) }}
      </p>
      <div class="flex items-start gap-2">
        <pre class="flex-1 overflow-x-auto rounded-md bg-elevated p-3 text-xs">{{ snippet }}</pre>
        <UButton
          color="neutral"
          variant="outline"
          size="xs"
          icon="i-lucide-copy"
          :label="t('preview.copy', 'Copy')"
          @click="copy(snippet)"
        />
      </div>
    </section>
  </div>
</template>
