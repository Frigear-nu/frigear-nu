<script setup lang="ts">
const { locale, locales, switchLocalePath } = useSiteI18n()

const localeObj = computed(() => locales.find(l => l.code === locale.value) || {
  name: locale.value,
  code: locale.value,
})

function getFlagUrl(locale: string): string {
  const languageToCountry: Record<string, string> = {
    ar: 'sa',
    bn: 'bd',
    ca: 'es',
    ckb: 'iq',
    cs: 'cz',
    da: 'dk',
    el: 'gr',
    en: 'gb',
    et: 'ee',
    he: 'il',
    hi: 'in',
    hy: 'am',
    ja: 'jp',
    kk: 'kz',
    km: 'kh',
    ko: 'kr',
    ky: 'kg',
    lb: 'lu',
    ms: 'my',
    nb: 'no',
    sl: 'si',
    sv: 'se',
    uk: 'ua',
    ur: 'pk',
    vi: 'vn',
    es: 'es',
    id: 'id',
  }

  const baseLanguage = locale.split('-')[0]?.toLowerCase() || locale
  const countryCode = languageToCountry[baseLanguage] || locale.replace(/^.*-/, '').slice(0, 2)

  return `https://flagcdn.com/w20/${countryCode.toLowerCase()}.png`
}
</script>

<template>
  <ClientOnly>
    <UPopover
      :mode="$device.isMobile ? 'click' : 'hover'"
      :content="{ align: 'end' }"
    >
      <UButton
        color="neutral"
        variant="ghost"
        class="size-8"
        :aria-label="$t('locale.switch', localeObj)"
      >
        <template #trailing>
          <img
            :src="getFlagUrl(locale)"
            :alt="localeObj.name"
            class="size-5 object-cover rounded-full ring-1 ring-black/10 border border-gray-500"
          >
        </template>
      </UButton>

      <template #content>
        <ul class="flex flex-col">
          <li
            v-for="localeItem in locales"
            :key="localeItem.code"
          >
            <NuxtLink
              class="flex justify-between py-1.5 px-2 gap-1 hover:bg-muted"
              :to="switchLocalePath(localeItem.code as never) as string"
              :aria-label="localeItem.name"
            >
              <span class="text-sm">
                {{ localeItem.name }}
              </span>
              <img
                :src="getFlagUrl(localeItem.code)"
                :alt="localeItem.name"
                class="size-5 object-cover rounded-full ring-1 ring-black/10"
              >
            </NuxtLink>
          </li>
        </ul>
      </template>
    </UPopover>

    <template #fallback>
      <div class="h-8 w-8 animate-pulse bg-neutral-200 dark:bg-neutral-800 rounded-md" />
    </template>
  </ClientOnly>
</template>
