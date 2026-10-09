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
        class="flex flex-col gap-4"
        data-testid="cookie-consent-preferences-dialog"
      >
        <div
          v-for="category in categories"
          :key="category.key"
          class="rounded-lg border border-default p-3"
        >
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="font-medium">
                {{ label(category) }}
              </p>
              <p class="text-sm text-muted">
                {{ description(category) }}
              </p>
            </div>
            <span
              v-if="category.required"
              class="shrink-0 text-xs text-muted"
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
            class="mt-2 text-sm"
          >
            <summary class="cursor-pointer text-muted">
              {{ t('cookies') }} ({{ category.cookies.length }})
            </summary>
            <ul class="mt-1 space-y-1">
              <li
                v-for="cookie in category.cookies"
                :key="cookie.name"
              >
                <code>{{ cookie.name }}</code>
                <span v-if="cookie.provider"> · {{ cookie.provider }}</span>
                <span v-if="cookie.duration"> · {{ cookie.duration }}</span>
                <span
                  v-if="cookie.purpose"
                  class="block text-muted"
                >{{ localize(cookie.purpose) }}</span>
              </li>
            </ul>
          </details>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap justify-end gap-2">
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
