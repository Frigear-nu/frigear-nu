<script setup lang="ts">
import { useWindowScroll } from '@vueuse/core'

const { config, hasResponded, acceptAll, rejectAll, openPreferences, hydrateFromUser } = useCookieConsent()
const { t, policyUrl } = useConsentT()

const route = useRoute()
const excluded = computed(() => config.excludeRoutes.includes(route.path))
const open = computed(() => !hasResponded.value && !excluded.value)

const { y } = useWindowScroll()
const scrolledDown = computed(() => config.collapseThreshold !== false && y.value > config.collapseThreshold)
const isManuallyExpanded = ref(false)
const collapsed = computed(() => scrolledDown.value && !isManuallyExpanded.value)

watch(scrolledDown, (isDown) => {
  if (!isDown) isManuallyExpanded.value = false
})

onMounted(() => {
  hydrateFromUser()
  if (config.persistToUser) watch(useUserSession().loggedIn, hydrateFromUser)
  useNuxtApp().callHook('cookie-consent:ready', useCookieConsent().consent.value)
})
</script>

<template>
  <ClientOnly>
    <Transition
      enter-active-class="transition duration-200 ease-out"
      leave-active-class="transition duration-200 ease-out"
      enter-from-class="scale-50 opacity-0"
      leave-to-class="scale-50 opacity-0"
    >
      <button
        v-if="open && collapsed"
        class="fixed bottom-4 left-4 z-50 flex size-14 cursor-pointer items-center justify-center rounded-full border border-default bg-default shadow-[0_10px_25px_rgb(0_0_0/0.3)] hover:opacity-90"
        :aria-label="t('expand')"
        data-testid="cookie-consent-fab"
        @click="isManuallyExpanded = true"
      >
        <UIcon
          :name="config.icon"
          class="size-7 text-primary"
        />
      </button>
    </Transition>

    <Transition
      enter-active-class="transition duration-300 ease-out"
      leave-active-class="transition duration-300 ease-out"
      enter-from-class="translate-y-full opacity-0"
      leave-to-class="translate-y-full opacity-0"
    >
      <div
        v-if="open && !collapsed"
        class="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center"
        role="dialog"
        :aria-label="t('preferencesTitle')"
        data-testid="cookie-consent-banner"
      >
        <div class="pointer-events-auto relative w-[92vw] rounded-t-2xl border border-primary/70 bg-default text-default shadow-[0_-8px_30px_rgb(0_0_0/0.25)]">
          <div class="absolute -top-3.5 left-4 flex items-center justify-center rounded-full border border-primary/70 bg-default p-1">
            <UIcon
              :name="config.icon"
              class="size-5 text-primary"
            />
          </div>
          <div class="flex flex-col items-center justify-between gap-4 px-4 pb-4 pt-5 sm:flex-row">
            <p class="text-sm text-muted">
              {{ t('description') }}
              <NuxtLink
                v-if="policyUrl"
                :to="policyUrl"
                class="underline"
              >
                {{ t('policy') }}
              </NuxtLink>
            </p>
            <div class="flex shrink-0 flex-wrap gap-2">
              <UButton
                color="neutral"
                variant="ghost"
                :label="t('preferences')"
                data-testid="cookie-consent-preferences"
                @click="openPreferences"
              />
              <UButton
                color="neutral"
                variant="outline"
                :label="t('reject')"
                data-testid="cookie-consent-reject"
                @click="rejectAll"
              />
              <UButton
                color="primary"
                :label="t('accept')"
                data-testid="cookie-consent-accept"
                @click="acceptAll"
              />
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <CookieConsentPreferences />
  </ClientOnly>
</template>
