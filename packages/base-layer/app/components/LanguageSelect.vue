<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

const { locale, locales } = useI18n()
const multiLocale = useRuntimeConfig().public.multiLocale === true
const route = useRoute()
const { localizePath } = useContentLocale()

const languageToCountry: Record<string, string> = {
  ar: 'sa', bn: 'bd', ca: 'es', ckb: 'iq', cs: 'cz', da: 'dk',
  el: 'gr', en: 'gb', et: 'ee', he: 'il', hi: 'in', hy: 'am',
  ja: 'jp', kk: 'kz', km: 'kh', ko: 'kr', ky: 'kg', lb: 'lu',
  ms: 'my', nb: 'no', sl: 'si', sv: 'se', uk: 'ua', ur: 'pk', vi: 'vn',
}

function getEmojiFlag(loc: string): string {
  const baseLanguage = loc.split('-')[0]?.toLowerCase() || loc
  const countryCode = languageToCountry[baseLanguage] || loc.replace(/^.*-/, '').slice(0, 2)

  return countryCode.toUpperCase()
    .split('')
    .map(char => String.fromCodePoint(0x1F1A5 + char.charCodeAt(0)))
    .join('')
}

const items = computed<DropdownMenuItem[]>(() =>
  (locales.value || []).map(l => ({
    label: l.name,
    onClick: () => {
      return navigateTo(localizePath(route.path, l.code))
    },
    active: l.code === locale.value,
    // stash the code so the trailing slot can look up the flag
    value: l.code,
  })),
)

const currentLabel = computed(() =>
  (locales.value || []).find(l => l.code === locale.value)?.name ?? locale.value,
)
</script>

<template>
  <UDropdownMenu
    v-if="multiLocale"
    :items="items"
    :content="{ align: 'end' }"
    :ui="{ content: 'w-44' }"
  >
    <UButton
      color="neutral"
      variant="ghost"
      class="size-8"
      :aria-label="`Change language, current: ${currentLabel}`"
    >
      <template #trailing>
        <span class="text-lg">{{ getEmojiFlag(locale) }}</span>
      </template>
    </UButton>

    <template #item-trailing="{ item }">
      <span class="size-5 text-center text-base">
        {{ getEmojiFlag((item as any).value) }}
      </span>
    </template>
  </UDropdownMenu>
</template>
