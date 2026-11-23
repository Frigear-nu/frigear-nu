<script setup lang="ts">
// One image for desktop, a differently cropped one for mobile, each cropped (`object-cover`) to its width:height, so a
// tall photo shows as a banner instead of at its natural height.
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
      fit="cover"
      class="hidden w-full rounded-xl object-cover md:block"
      :style="{ aspectRatio: `${desktopWidth} / ${desktopHeight}` }"
    />
    <NuxtImg
      :src="mobile"
      :alt="alt"
      :width="mobileWidth"
      :height="mobileHeight"
      fit="cover"
      class="block w-full rounded-xl object-cover md:hidden"
      :style="{ aspectRatio: `${mobileWidth} / ${mobileHeight}` }"
    />
  </div>
</template>
