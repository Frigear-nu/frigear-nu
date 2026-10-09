<script setup lang="ts">
import { useWindowScroll } from '@vueuse/core'

const { config, hasResponded, acceptAll, rejectAll, openPreferences, hydrateFromUser } = useCookieConsent()
const { t } = useConsentT()

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
    <Transition name="cookie-fab">
      <button
        v-if="open && collapsed"
        class="fixed bottom-4 left-4 z-50 flex size-14 items-center justify-center rounded-full border border-default bg-(--ui-bg) shadow-lg ring-0 hover:opacity-90 focus:outline-none"
        :aria-label="t('expand')"
        data-testid="cookie-consent-fab"
        @click="isManuallyExpanded = true"
      >
        <UIcon
          name="i-lucide-cookie"
          class="size-7 text-primary"
        />
      </button>
    </Transition>

    <Transition name="cookie-slide">
      <div
        v-if="open && !collapsed"
        class="fixed bottom-0 left-0 right-0 z-50 flex justify-center"
        role="dialog"
        :aria-label="t('preferencesTitle')"
        data-testid="cookie-consent-banner"
      >
        <div class="relative w-[92vw] rounded-t-2xl border border-primary/70 bg-(--ui-bg) shadow-xl">
          <div class="absolute -top-3.5 left-4 flex items-center justify-center rounded-full border border-primary/70 bg-(--ui-bg) p-1">
            <UIcon
              name="i-lucide-cookie"
              class="size-5 text-primary"
            />
          </div>
          <div class="flex flex-col items-center justify-between gap-4 p-4 pt-5 sm:flex-row">
            <p class="text-sm text-muted">
              {{ t('description') }}
              <NuxtLink
                v-if="config.policyUrl"
                :to="config.policyUrl"
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

<style scoped>
.cookie-slide-enter-active, .cookie-slide-leave-active { transition: transform 0.3s ease, opacity 0.3s ease; }
.cookie-slide-enter-from, .cookie-slide-leave-to { transform: translateY(100%); opacity: 0; }
.cookie-fab-enter-active, .cookie-fab-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.cookie-fab-enter-from, .cookie-fab-leave-to { opacity: 0; transform: scale(0.5); }
</style>
