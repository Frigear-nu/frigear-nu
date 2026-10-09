<script setup lang="ts">
const { categories, consent, isPreferencesOpen, save, acceptAll, rejectAll } = useCookieConsent()
const { t, label, description, localize } = useConsentT()

const choices = ref<Record<string, boolean>>({})

// Re-seed from the current consent (or the defaults) every time the dialog opens.
watch(isPreferencesOpen, (isOpen) => {
  if (!isOpen) return
  choices.value = Object.fromEntries(categories.map(category => [
    category.key,
    category.required ? true : (consent.value?.categories[category.key] ?? category.defaultEnabled ?? false),
  ]))
}, { immediate: true })
</script>

<template>
  <UModal
    v-model:open="isPreferencesOpen"
    :title="t('preferencesTitle')"
    :description="t('preferencesDescription')"
  >
    <template #body>
      <div
        class="cc-list"
        data-testid="cookie-consent-preferences-dialog"
      >
        <div
          v-for="category in categories"
          :key="category.key"
          class="cc-item"
        >
          <div class="cc-row">
            <div>
              <p class="cc-label">
                {{ label(category) }}
              </p>
              <p class="cc-desc">
                {{ description(category) }}
              </p>
            </div>
            <span
              v-if="category.required"
              class="cc-required"
            >{{ t('required') }}</span>
            <USwitch
              v-else
              v-model="choices[category.key]"
              :aria-label="label(category)"
              :data-testid="`cookie-consent-toggle-${category.key}`"
            />
          </div>
          <details
            v-if="category.cookies?.length"
            class="cc-details"
          >
            <summary class="cc-summary">
              {{ t('cookies') }} ({{ category.cookies.length }})
            </summary>
            <ul class="cc-cookies">
              <li
                v-for="cookie in category.cookies"
                :key="cookie.name"
              >
                <code>{{ cookie.name }}</code>
                <span v-if="cookie.provider"> · {{ cookie.provider }}</span>
                <span v-if="cookie.duration"> · {{ cookie.duration }}</span>
                <span
                  v-if="cookie.purpose"
                  class="cc-purpose"
                >{{ localize(cookie.purpose) }}</span>
              </li>
            </ul>
          </details>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="cc-footer">
        <UButton
          color="neutral"
          variant="outline"
          :label="t('reject')"
          @click="rejectAll"
        />
        <UButton
          color="neutral"
          variant="outline"
          :label="t('accept')"
          @click="acceptAll"
        />
        <UButton
          color="primary"
          :label="t('save')"
          data-testid="cookie-consent-save"
          @click="save(choices)"
        />
      </div>
    </template>
  </UModal>
</template>

<style scoped>
/* Plain CSS on Nuxt UI variables - Tailwind does not scan packages outside the app. */
.cc-list { display: flex; flex-direction: column; gap: 1rem; }
.cc-item { border: 1px solid var(--ui-border); border-radius: 0.5rem; padding: 0.75rem; }
.cc-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; }
.cc-label { margin: 0; font-weight: 500; }
.cc-desc { margin: 0; font-size: 0.875rem; color: var(--ui-text-muted); }
.cc-required { flex-shrink: 0; font-size: 0.75rem; color: var(--ui-text-muted); }
.cc-details { margin-top: 0.5rem; font-size: 0.875rem; }
.cc-summary { cursor: pointer; color: var(--ui-text-muted); }
.cc-cookies { margin: 0.25rem 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 0.25rem; }
.cc-purpose { display: block; color: var(--ui-text-muted); }
.cc-footer { display: flex; width: 100%; flex-wrap: wrap; justify-content: flex-end; gap: 0.5rem; }
</style>
