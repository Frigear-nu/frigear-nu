<template>
  <UApp>
    <div class="flex h-[200vh] flex-col gap-4 p-8">
      <h1 class="text-xl font-semibold">
        Cookie consent playground
      </h1>
      <CookieConsentManage />
      <pre>{{ useCookieConsent().consent.value }}</pre>
    </div>
    <CookieConsentBanner />
  </UApp>
</template>
