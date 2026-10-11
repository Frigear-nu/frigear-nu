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
        class="cc-fab"
        :aria-label="t('expand')"
        data-testid="cookie-consent-fab"
        @click="isManuallyExpanded = true"
      >
        <UIcon
          :name="config.icon"
          class="cc-fab-icon"
        />
      </button>
    </Transition>

    <Transition name="cookie-slide">
      <div
        v-if="open && !collapsed"
        class="cc-wrap"
        role="dialog"
        :aria-label="t('preferencesTitle')"
        data-testid="cookie-consent-banner"
      >
        <div class="cc-banner">
          <div class="cc-badge">
            <UIcon
              :name="config.icon"
              class="cc-badge-icon"
            />
          </div>
          <div class="cc-content">
            <p class="cc-text">
              {{ t('description') }}
              <NuxtLink
                v-if="config.policyUrl"
                :to="config.policyUrl"
                class="cc-link"
              >
                {{ t('policy') }}
              </NuxtLink>
            </p>
            <div class="cc-actions">
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
/* Plain CSS on Nuxt UI variables: Tailwind does not scan workspace/node_modules packages, so utility classes here would silently be dropped. */
.cc-wrap { position: fixed; inset: auto 0 0 0; z-index: 50; display: flex; justify-content: center; pointer-events: none; }
.cc-banner {
  position: relative; width: 92vw; pointer-events: auto;
  background: var(--ui-bg); color: var(--ui-text);
  border: 1px solid color-mix(in oklab, var(--ui-primary) 70%, transparent);
  border-radius: 1rem 1rem 0 0; box-shadow: 0 -8px 30px rgb(0 0 0 / 0.25);
}
.cc-badge {
  position: absolute; top: -0.875rem; left: 1rem; display: flex; align-items: center; justify-content: center; padding: 0.25rem;
  background: var(--ui-bg); border: 1px solid color-mix(in oklab, var(--ui-primary) 70%, transparent); border-radius: 9999px;
}
.cc-badge-icon { width: 1.25rem; height: 1.25rem; color: var(--ui-primary); }
.cc-content { display: flex; flex-direction: column; align-items: center; justify-content: space-between; gap: 1rem; padding: 1.25rem 1rem 1rem; }
.cc-text { margin: 0; font-size: 0.875rem; color: var(--ui-text-muted); }
.cc-link { text-decoration: underline; }
.cc-actions { display: flex; flex-wrap: wrap; flex-shrink: 0; gap: 0.5rem; }
@media (min-width: 640px) { .cc-content { flex-direction: row; } }
.cc-fab {
  position: fixed; bottom: 1rem; left: 1rem; z-index: 50; display: flex; align-items: center; justify-content: center;
  width: 3.5rem; height: 3.5rem; cursor: pointer; background: var(--ui-bg); border: 1px solid var(--ui-border); border-radius: 9999px;
  box-shadow: 0 10px 25px rgb(0 0 0 / 0.3);
}
.cc-fab:hover { opacity: 0.9; }
.cc-fab-icon { width: 1.75rem; height: 1.75rem; color: var(--ui-primary); }
.cookie-slide-enter-active, .cookie-slide-leave-active { transition: transform 0.3s ease, opacity 0.3s ease; }
.cookie-slide-enter-from, .cookie-slide-leave-to { transform: translateY(100%); opacity: 0; }
.cookie-fab-enter-active, .cookie-fab-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.cookie-fab-enter-from, .cookie-fab-leave-to { opacity: 0; transform: scale(0.5); }
</style>
