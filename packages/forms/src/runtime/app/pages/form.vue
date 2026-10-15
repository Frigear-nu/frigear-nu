<script setup lang="ts">
const route = useRoute()
const t = useModuleT('forms')
const format = useFormat()
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
  <UContainer>
    <UPage>
      <UPageHeader
        v-if="access"
        :title="access.name"
      />
      <UPageBody class="max-w-2xl">
        <UAlert
          v-if="access && !access.open"
          icon="i-lucide-calendar-x"
          color="neutral"
          variant="subtle"
          :title="t('schedule.closed', 'This form is closed.')"
          :description="access.opensAt
            ? t('schedule.opensAt', 'It opens again {date}.', { date: format.dateTime(access.opensAt) })
            : undefined"
        />

        <SectionCard v-else-if="gated && !unlocked">
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
        </SectionCard>

        <FormRenderer
          v-else-if="!needsSignIn"
          :slug="slug"
          :password="unlocked || undefined"
        />
      </UPageBody>
    </UPage>
  </UContainer>
</template>
