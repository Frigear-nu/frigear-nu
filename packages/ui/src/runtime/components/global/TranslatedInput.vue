<script setup lang="ts">
import { collapseTranslated, expandTranslated, filledLocales, isLocaleCode, readTranslated, translate, writeTranslated } from '../../translated'
import type { Translated } from '../../translated'
import { computed, ref, useTranslatedFallbackLocale, useTranslatedLocale, useTranslatedLocales, useUiT } from '#imports'

const props = withDefaults(defineProps<{
  placeholder?: string
  /** Edit as a textarea (descriptions, markdown bodies). */
  multiline?: boolean
  rows?: number
  /** Write / Preview toggle for multiline text (markdown). Defaults on. */
  preview?: boolean
  /** Preview with MDC (components such as `::callout`) instead of plain markdown. */
  mdc?: boolean
  /** Variables for `{{ name }}` in the MDC preview. */
  mdcData?: Record<string, unknown>
  required?: boolean
  disabled?: boolean
}>(), { preview: true })

/** Either one string for every language, or a map of locale -> text. `undefined` / `null` = empty. */
const model = defineModel<Translated | null | undefined>()

const t = useUiT('translated')
const current = useTranslatedLocale()
const available = useTranslatedLocales()
const fallback = useTranslatedFallbackLocale()

const translated = computed(() => !!model.value && typeof model.value === 'object')
// Locales offered as rows: every configured one, plus any already in the data (e.g. a removed locale).
// Languages added by hand stay listed while their text is still empty.
const added = ref<string[]>([])
const newLocale = ref('')
const locales = computed(() => [...new Set([...available.value, ...filledLocales(model.value), ...added.value])])
const filled = computed(() => new Set(filledLocales(model.value)))
// What a visitor sees in a language without its own text.
const fallbackText = (locale: string) => translate(model.value, locale, fallback.value)

function addLocale() {
  const code = newLocale.value.trim()
  if (isLocaleCode(code) && !locales.value.includes(code)) added.value.push(code)
  newLocale.value = ''
}

function toggle() {
  // An empty text has nothing to expand yet; an empty map still switches the editor to per-language rows.
  model.value = translated.value ? collapseTranslated(model.value, current.value) : expandTranslated(model.value, current.value) ?? {}
}

function setPlain(text: string) {
  model.value = text || undefined
}

/** Empty entries are dropped so `translate()` falls back to another language instead of showing nothing. */
function setLocale(locale: string, text: string) {
  model.value = writeTranslated({ ...(model.value as Record<string, string>) }, locale, text) ?? {}
}
</script>

<template>
  <div class="w-full space-y-1">
    <div
      v-if="!translated"
      class="flex items-start gap-1"
    >
      <MarkdownTextarea
        v-if="props.multiline"
        :model-value="readTranslated(model, current)"
        :placeholder="placeholder"
        :rows="rows ?? 4"
        :required="required"
        :disabled="disabled"
        :preview="preview"
        :mdc="mdc"
        :mdc-data="mdcData"
        class="min-w-0 flex-1"
        @update:model-value="setPlain(String($event))"
      />
      <UInput
        v-else
        :model-value="readTranslated(model, current)"
        :placeholder="placeholder"
        :required="required"
        :disabled="disabled"
        class="min-w-0 flex-1"
        @update:model-value="setPlain(String($event))"
      />
      <UButton
        color="neutral"
        variant="outline"
        icon="i-lucide-languages"
        :disabled="disabled"
        :aria-label="t('translate', 'Translate')"
        :title="t('translate', 'Translate')"
        @click="toggle"
      />
    </div>

    <div
      v-else
      class="space-y-1 rounded-md border border-default p-1.5"
    >
      <div
        v-for="locale in locales"
        :key="locale"
        class="flex items-start gap-1.5"
      >
        <UBadge
          :color="filled.has(locale) ? 'primary' : 'neutral'"
          :variant="filled.has(locale) ? 'subtle' : 'outline'"
          :icon="filled.has(locale) ? 'i-lucide-check' : undefined"
          size="sm"
          class="mt-1.5 min-w-11 justify-center uppercase"
          :title="filled.has(locale) ? t('filled', 'Translated') : t('missing', 'Missing, shows the fallback language')"
          :label="locale"
        />
        <MarkdownTextarea
          v-if="props.multiline"
          :model-value="readTranslated(model, locale)"
          :placeholder="fallbackText(locale) || placeholder"
          :rows="rows ?? 3"
          :disabled="disabled"
          :preview="preview"
          :mdc="mdc"
          :mdc-data="mdcData"
          class="min-w-0 flex-1"
          @update:model-value="setLocale(locale, String($event))"
        />
        <UInput
          v-else
          :model-value="readTranslated(model, locale)"
          :placeholder="fallbackText(locale) || placeholder"
          :disabled="disabled"
          class="min-w-0 flex-1"
          @update:model-value="setLocale(locale, String($event))"
        />
      </div>
      <form
        class="flex gap-1"
        @submit.prevent="addLocale"
      >
        <UInput
          v-model="newLocale"
          size="xs"
          :placeholder="t('addLanguage', 'Add language, e.g. de')"
          class="min-w-0 flex-1"
        />
        <UButton
          type="submit"
          color="neutral"
          variant="outline"
          size="xs"
          icon="i-lucide-plus"
          :aria-label="t('addLanguage', 'Add language, e.g. de')"
        />
      </form>
      <UButton
        color="neutral"
        variant="link"
        size="xs"
        icon="i-lucide-x"
        :disabled="disabled"
        :label="t('singleLanguage', 'Same text in every language')"
        @click="toggle"
      />
    </div>
  </div>
</template>
