<script setup lang="ts">
import type { Translated } from '../../../types'
import { collapseTranslated, expandTranslated, readTranslated } from '../../utils'
import { useFormsLocale, useFormsLocales } from '../composables/useForms'
import { computed, ref, useModuleT } from '#imports'

const props = withDefaults(defineProps<{
  placeholder?: string
  multiline?: boolean
  /** Write / Preview toggle for multiline text (markdown). */
  preview?: boolean
}>(), { preview: true })
/** Either one string for every language, or a map of locale → text. */
const model = defineModel<Translated | undefined>()

const t = useModuleT('forms')
const current = useFormsLocale()
const available = useFormsLocales()

const translated = computed(() => !!model.value && typeof model.value === 'object')
// Locales offered as rows: every configured one, plus any already in the data (e.g. a removed locale).
// Languages added by hand stay listed while their text is still empty.
const added = ref<string[]>([])
const newLocale = ref('')
const locales = computed(() => [...new Set([...available.value, ...Object.keys(translated.value ? model.value as object : {}), ...added.value])])

function addLocale() {
  const code = newLocale.value.trim()
  if (/^[a-z]{2,3}(?:[-_][a-z0-9]{2,8})*$/i.test(code) && !locales.value.includes(code)) added.value.push(code)
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
  model.value = Object.fromEntries(Object.entries({ ...(model.value as Record<string, string>), [locale]: text }).filter(([, entry]) => entry))
}
</script>

<template>
  <div class="space-y-1">
    <div
      v-if="!translated"
      class="flex items-start gap-1"
    >
      <MarkdownTextarea
        v-if="multiline"
        :model-value="readTranslated(model, current)"
        :placeholder="placeholder"
        :rows="4"
        :preview="props.preview"
        class="min-w-0 flex-1"
        @update:model-value="setPlain(String($event))"
      />
      <UInput
        v-else
        :model-value="readTranslated(model, current)"
        :placeholder="placeholder"
        class="min-w-0 flex-1"
        @update:model-value="setPlain(String($event))"
      />
      <UButton
        color="neutral"
        variant="outline"
        icon="i-lucide-languages"
        :aria-label="t('builder.translate', 'Translate')"
        :title="t('builder.translate', 'Translate')"
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
          :color="locale === current ? 'primary' : 'neutral'"
          variant="subtle"
          size="sm"
          class="mt-1.5 w-8 justify-center uppercase"
          :label="locale"
        />
        <MarkdownTextarea
          v-if="multiline"
          :model-value="readTranslated(model, locale)"
          :placeholder="placeholder"
          :rows="3"
          :preview="props.preview"
          class="min-w-0 flex-1"
          @update:model-value="setLocale(locale, String($event))"
        />
        <UInput
          v-else
          :model-value="readTranslated(model, locale)"
          :placeholder="placeholder"
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
          :placeholder="t('builder.addLanguage', 'Add language, e.g. da')"
          class="min-w-0 flex-1"
        />
        <UButton
          type="submit"
          color="neutral"
          variant="outline"
          size="xs"
          icon="i-lucide-plus"
          :aria-label="t('builder.addLanguage', 'Add language, e.g. da')"
        />
      </form>
      <UButton
        color="neutral"
        variant="link"
        size="xs"
        icon="i-lucide-x"
        :label="t('builder.singleLanguage', 'Same text in every language')"
        @click="toggle"
      />
    </div>
  </div>
</template>
