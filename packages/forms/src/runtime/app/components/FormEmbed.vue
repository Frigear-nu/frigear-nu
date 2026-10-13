<script setup lang="ts">
import { embedMode } from '../../utils'

/**
 * Embeds a published form in a page or in Markdown (MDC): `::form-embed{slug="contact"}`.
 * Honors the form's access settings: sign-in prompt, password gate, nothing for API-only/token forms.
 */
const props = withDefaults(defineProps<{
  /** Slug of a published form. */
  slug: string
  /** Show the form's name as a heading above it. */
  title?: boolean
  /** Overrides the locale of translated form content (defaults to the app's locale). */
  locale?: string
  /** Extra classes for the wrapper. */
  class?: string
}>(), { title: false, locale: undefined, class: undefined })

const route = useRoute()
const t = useModuleT('forms')
const { data: access, status } = useFormAccess(() => props.slug)

const mode = computed(() => embedMode(access.value))
const loading = computed(() => !access.value && (status.value === 'pending' || status.value === 'idle'))

if (import.meta.dev) {
  watch(mode, (value) => {
    if (value === 'hidden') console.warn(`[forms] <FormEmbed slug="${props.slug}"> renders nothing: API-only and token forms have no public UI.`)
  }, { immediate: true })
}

const loginPath = computed(() => useAuthPages().login)

// Password forms: the password is checked by loading the definition with it.
const password = ref('')
const unlocked = ref('')
const checking = ref(false)
const wrong = ref(false)

async function unlock() {
  checking.value = true
  wrong.value = false
  try {
    await $fetch(`/api/forms/${props.slug}`, { headers: { [FORM_PASSWORD_HEADER]: password.value } })
    unlocked.value = password.value
  }
  catch {
    wrong.value = true
  }
  finally {
    checking.value = false
  }
}
</script>

<template>
  <div
    v-if="mode !== 'hidden'"
    :class="['not-prose', props.class]"
    data-form-embed
  >
    <div
      v-if="loading"
      class="space-y-4"
      aria-busy="true"
    >
      <USkeleton class="h-10 w-full" />
      <USkeleton class="h-10 w-full" />
      <USkeleton class="h-24 w-full" />
      <USkeleton class="h-10 w-32" />
    </div>

    <UAlert
      v-else-if="mode === 'not-found'"
      color="error"
      variant="subtle"
      :title="t('error.notFound', 'This form could not be found.')"
    />

    <template v-else>
      <h2
        v-if="props.title && access"
        class="mb-4 text-2xl font-bold"
      >
        {{ access.name }}
      </h2>

      <UAlert
        v-if="mode === 'sign-in'"
        color="neutral"
        variant="subtle"
        icon="i-lucide-lock"
        :title="t('embed.signInTitle', 'Sign in to use this form')"
        :actions="[{ label: t('embed.signIn', 'Sign in'), to: { path: loginPath, query: { redirect: route.fullPath } } }]"
      />

      <UCard v-else-if="mode === 'password' && !unlocked">
        <form
          class="space-y-4"
          @submit.prevent="unlock"
        >
          <UFormField
            :label="t('access.passwordLabel', 'Password')"
            :description="t('access.passwordHint', 'This form is protected. Enter the password you were given.')"
            :error="wrong ? t('access.passwordWrong', 'Wrong password.') : undefined"
          >
            <UInput
              v-model="password"
              type="password"
              autocomplete="off"
              class="w-full"
            />
          </UFormField>
          <UButton
            type="submit"
            :loading="checking"
            :disabled="!password"
            :label="t('access.unlock', 'Continue')"
          />
        </form>
      </UCard>

      <FormRenderer
        v-else
        :slug="props.slug"
        :password="unlocked || undefined"
        :locale="props.locale"
      />
    </template>
  </div>
</template>
