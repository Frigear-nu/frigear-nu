<script setup lang="ts">
const route = useRoute()
const t = useModuleT('forms')
const slug = computed(() => String(route.params.slug))
const { data: access } = await useFormAccess(slug)

// API-only forms have no public page, and a bearer token cannot be typed into one.
if (access.value && (access.value.access.availability === 'api' || access.value.access.auth === 'token')) {
  throw createError({ statusCode: 404, statusMessage: 'Form not found.', fatal: true })
}

const needsSignIn = computed(() => access.value?.access.auth === 'user' && !access.value.signedIn)
if (needsSignIn.value) {
  const loginPath = useAuthPages().login
  await navigateTo({ path: loginPath, query: { redirect: route.path } })
}

// Password forms: the password is checked by loading the definition with it.
const gated = computed(() => access.value?.access.auth === 'password')
const password = ref('')
const unlocked = ref('')
const checking = ref(false)
const wrong = ref(false)

async function unlock() {
  checking.value = true
  wrong.value = false
  try {
    await $fetch(`/api/forms/${slug.value}`, { headers: { [FORM_PASSWORD_HEADER]: password.value } })
    unlocked.value = password.value
  }
  catch {
    wrong.value = true
  }
  finally {
    checking.value = false
  }
}

useHead({ title: computed(() => access.value?.name ?? '') })
</script>

<template>
  <UContainer class="max-w-2xl py-10">
    <h1
      v-if="access"
      class="mb-6 text-3xl font-bold"
    >
      {{ access.name }}
    </h1>

    <UAlert
      v-if="access && !access.open"
      icon="i-lucide-calendar-x"
      color="neutral"
      variant="subtle"
      :title="t('schedule.closed', 'This form is closed.')"
      :description="access.opensAt
        ? t('schedule.opensAt', 'It opens again {date}.', { date: new Date(access.opensAt).toLocaleString() })
        : undefined"
    />

    <UCard v-else-if="gated && !unlocked">
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
      v-else-if="!needsSignIn"
      :slug="slug"
      :password="unlocked || undefined"
    />
  </UContainer>
</template>
