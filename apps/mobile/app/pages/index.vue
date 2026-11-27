<script setup lang="ts">
// Signed out: the public home, with the website's upcoming events, the contact form, sign-in and sign-up. Signed in it
// redirects to the Home tab. It is also where a guarded page sends a visitor (`authorization.redirectTo`), with the
// page in `?redirect=`, and where a failed sign-in lands (`?error=sign-in`).
definePageMeta({
  // No navbar or tab bar: the hero starts under the status bar (the layout pads the top inset), as an app's start screen.
  mobile: { navbar: false, tabBar: false },
})

const { t } = useI18n()
const route = useRoute()
const { loggedIn } = useUserSession()
const { login, signingIn, getClient } = useAuth()
const host = useMobileHost()
const hostPath = useHostPath()
const { tabs } = useMobileTabs()
const localePath = useLocalePath()

const returnTo = computed(() => {
  const redirect = route.query.redirect
  return typeof redirect === 'string' && redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : undefined
})
const homeTab = computed(() => tabs.value.find(tab => tab.id === 'home')?.to ?? '/account')

// Signed in (now, or once a sign-in completes here): on to where the visitor was going, else the Home tab.
watch(loggedIn, (value) => {
  if (value) void navigateTo(returnTo.value ?? localePath(homeTab.value), { replace: true })
}, { immediate: true })

const signInFailed = computed(() => route.query.error === 'sign-in')

async function signIn() {
  await login({ returnTo: returnTo.value })
}

// Sign-up happens on the website. Its `?redirect=` is the app's own sign-in (the `/oauth/authorize` URL with this app's
// PKCE challenge), which the website keeps through the email confirmation: following the emailed link finishes the
// sign-in in the app, even from another browser or after the app was closed (the pending sign-in is stored).
const signUpOpened = ref(false)
async function createAccount() {
  let path = hostPath('/sign-up')
  try {
    const client = await getClient()
    const { url } = await client.startAuthorization({ returnTo: returnTo.value })
    const authorize = new URL(url)
    path = `${path}?redirect=${encodeURIComponent(`${authorize.pathname}${authorize.search}`)}`
  }
  catch (error) {
    // Without it the website signs the new account in on its own pages; the app's sign-in still works afterwards.
    console.warn('[app] Could not prepare the sign-in for sign-up:', error)
  }
  await host.open(path)
  signUpOpened.value = true
}
</script>

<template>
  <div class="flex flex-col gap-8 pb-8">
    <section class="flex flex-col items-center gap-4 pt-8 text-center">
      <img
        src="/images/logo-light.png"
        alt="Frigear"
        class="w-40 dark:hidden"
      >
      <img
        src="/images/logo-dark.png"
        alt="Frigear"
        class="hidden w-40 dark:block"
      >
      <div class="flex flex-col gap-1">
        <h1 class="text-2xl font-bold text-highlighted">
          {{ t('app.home.title') }}
        </h1>
        <p class="text-muted">
          {{ t('app.home.description') }}
        </p>
      </div>

      <UAlert
        v-if="signInFailed"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="t('app.home.signInFailed')"
        class="text-left"
      />

      <div class="flex w-full flex-col gap-2">
        <UButton
          :label="t('app.home.signIn')"
          icon="i-lucide-log-in"
          size="xl"
          block
          :loading="signingIn"
          data-sign-in
          @click="signIn"
        />
        <UButton
          :label="t('app.home.createAccount')"
          icon="i-lucide-user-plus"
          color="neutral"
          variant="outline"
          size="xl"
          block
          data-create-account
          @click="createAccount"
        />
      </div>

      <UAlert
        v-if="signUpOpened"
        color="info"
        variant="subtle"
        icon="i-lucide-mail-check"
        :title="t('app.home.confirmEmail.title')"
        :description="t('app.home.confirmEmail.description')"
        class="text-left"
      />
    </section>

    <HomeEvents />

    <section class="flex flex-col gap-3">
      <div>
        <h2 class="text-lg font-semibold text-highlighted">
          {{ t('app.home.contact.title') }}
        </h2>
        <p class="text-sm text-muted">
          {{ t('app.home.contact.description') }}
        </p>
      </div>
      <FormEmbed slug="contact" />
    </section>
  </div>
</template>
