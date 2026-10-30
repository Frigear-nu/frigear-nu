<script setup lang="ts">
import type { FormField } from '../../../types'
import type { CaptchaSecrets } from '../composables/useCaptchaSecrets'
import { captchaProviders } from '../../utils'
import { captchaSiteKey } from '../composables/useCaptcha'
import { computed, useModuleT } from '#imports'

// Settings of a selected captcha field: provider, site key, the write-only secret key, theme and size.
const props = defineProps<{
  field: FormField
  /** The saved form; enables the per-form secret key. */
  formId?: string
  secrets: CaptchaSecrets
}>()
const emit = defineEmits<{ patch: [patch: Partial<NonNullable<FormField['captcha']>>] }>()

const t = useModuleT('forms')

const providerItems = computed(() => captchaProviders.map(value => ({ value, label: t(`captcha.providers.${value}`, value) })))
const themeItems = computed(() => [
  { value: 'auto', label: t('captcha.themes.auto', 'Automatic') },
  { value: 'light', label: t('captcha.themes.light', 'Light') },
  { value: 'dark', label: t('captcha.themes.dark', 'Dark') },
])
const sizeItems = computed(() => [
  { value: 'normal', label: t('captcha.sizes.normal', 'Normal') },
  { value: 'compact', label: t('captcha.sizes.compact', 'Compact') },
])
const keyMissing = computed(() => !captchaSiteKey(props.field))
</script>

<template>
  <template v-if="secrets.captcha">
    <UFormField :label="t('captcha.provider', 'Provider')">
      <USelect
        :model-value="secrets.captcha.provider"
        :items="providerItems"
        class="w-full"
        @update:model-value="emit('patch', { provider: $event })"
      />
    </UFormField>
    <UAlert
      v-if="keyMissing"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :title="t('captcha.missingKey', 'The {provider} captcha has no site key configured.', { provider: t(`captcha.providers.${secrets.captcha.provider}`, secrets.captcha.provider) })"
      :ui="{ description: 'break-words' }"
      :description="t('captcha.missingKeyHint', 'Set the site key below or the NUXT_PUBLIC_FORMS_CAPTCHA_PROVIDER_SITE_KEY environment variable. Submissions also need the matching secret key on the server.')"
    />
    <UFormField
      :label="t('captcha.siteKey', 'Site key')"
      :description="t('captcha.siteKeyHint', 'Public key of this site. Leave empty to use the one configured for the provider.')"
    >
      <UInput
        :model-value="secrets.captcha.siteKey"
        class="w-full font-mono"
        @update:model-value="emit('patch', { siteKey: String($event).trim() })"
      />
    </UFormField>
    <UFormField
      v-if="formId"
      :label="t('captcha.secretLabel', 'Secret key')"
      :description="t('captcha.secretHint', 'Server-side key used to verify this form. Stored encrypted and never shown again. Without one, the environment variable is used.')"
    >
      <p
        class="mb-2 flex gap-1 text-sm"
        data-testid="captcha-secret-status"
      >
        <span class="text-muted">{{ t('captcha.secretStatus', 'Secret key') }}:</span>
        <USkeleton
          v-if="secrets.loading"
          class="h-5 w-32"
        />
        <span
          v-else
          :class="secrets.source === 'unset' ? 'text-warning' : 'text-success'"
        >{{ secrets.statusLabel }}</span>
      </p>
      <UAlert
        v-if="secrets.secrets?.unreadable"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        class="mb-2"
        :title="t('captcha.secretUnreadable', 'The stored secrets of this form cannot be decrypted because the encryption key changed. Enter them again.')"
      />
      <form
        class="flex gap-2"
        @submit.prevent="secrets.save()"
      >
        <UInput
          :model-value="secrets.value"
          type="password"
          autocomplete="new-password"
          class="min-w-0 flex-1 font-mono"
          :placeholder="secrets.source === 'form' ? t('captcha.secretPlaceholderSet', 'Enter a new secret key to replace it') : t('captcha.secretPlaceholder', 'Paste the secret key')"
          @update:model-value="secrets.setValue(String($event ?? ''))"
        />
        <UButton
          type="submit"
          :loading="secrets.saving"
          :disabled="!secrets.value.trim()"
          :label="t('captcha.secretSave', 'Save secret')"
        />
        <UButton
          v-if="secrets.source === 'form'"
          type="button"
          color="error"
          variant="outline"
          :label="t('captcha.secretRemove', 'Remove')"
          @click="secrets.remove()"
        />
      </form>
      <p class="mt-1 text-xs text-muted">
        {{ t('captcha.secretImmediate', 'Saved immediately, independent of the form Save.') }}
      </p>
    </UFormField>
    <div class="grid grid-cols-2 gap-2">
      <UFormField :label="t('captcha.theme', 'Theme')">
        <USelect
          :model-value="secrets.captcha.theme ?? 'auto'"
          :items="themeItems"
          class="w-full"
          @update:model-value="emit('patch', { theme: $event === 'auto' ? undefined : $event })"
        />
      </UFormField>
      <UFormField :label="t('captcha.size', 'Size')">
        <USelect
          :model-value="secrets.captcha.size ?? 'normal'"
          :items="sizeItems"
          class="w-full"
          @update:model-value="emit('patch', { size: $event === 'normal' ? undefined : $event })"
        />
      </UFormField>
    </div>
    <p class="text-sm text-muted">
      {{ t('captcha.hint', 'Always required while visible. The token is checked on the server and never stored. Submissions with an API token skip it.') }}
    </p>
  </template>
</template>
