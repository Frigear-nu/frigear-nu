<script setup lang="ts">
// One image for desktop, a differently cropped one for mobile.
withDefaults(defineProps<{
  desktop: string
  mobile: string
  alt: string
  desktopWidth?: number
  desktopHeight?: number
  mobileWidth?: number
  mobileHeight?: number
}>(), {
  desktopWidth: 1200,
  desktopHeight: 400,
  mobileWidth: 640,
  mobileHeight: 400,
})
</script>

<template>
  <div class="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
    <NuxtImg
      :src="desktop"
      :alt="alt"
      :width="desktopWidth"
      :height="desktopHeight"
      class="hidden w-full rounded-xl md:block"
    />
    <NuxtImg
      :src="mobile"
      :alt="alt"
      :width="mobileWidth"
      :height="mobileHeight"
      class="block w-full rounded-xl md:hidden"
    />
  </div>
</template>
