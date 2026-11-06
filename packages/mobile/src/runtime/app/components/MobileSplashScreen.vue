<script setup lang="ts">
import { computed, useRuntimeConfig } from '#imports'

/**
 * The default splash screen: the app's logo (or its name's first letter in a tile) at the exact centre, where a native
 * launch image made from the same logo has it, with the app name fading in under it. Replace it with
 * `app/components/Mobile/SplashScreen.vue`.
 */
const config = useRuntimeConfig().public.mobile
const splash = config.splashScreen
const initial = computed(() => (config.appName.trim()[0] ?? '').toUpperCase())
const style = computed(() => ({
  '--mobile-splash-light': splash.background.light,
  '--mobile-splash-dark': splash.background.dark,
}))
</script>

<template>
  <div
    class="mobile-splash-screen"
    :style="style"
    role="status"
    aria-busy="true"
    :aria-label="config.appName"
  >
    <div class="mobile-splash-mark">
      <img
        v-if="splash.logo"
        :src="splash.logo"
        alt=""
        class="size-full object-contain"
      >
      <span
        v-else
        class="mobile-splash-initial flex size-full items-center justify-center bg-primary text-inverted"
        aria-hidden="true"
      >{{ initial }}</span>
    </div>
    <p class="mobile-splash-name text-lg font-semibold text-highlighted">
      {{ config.appName }}
    </p>
  </div>
</template>

<style scoped>
.mobile-splash-screen {
  background: var(--mobile-splash-light);
}

:root.dark .mobile-splash-screen {
  background: var(--mobile-splash-dark);
}

/* Centred on the screen, not in the safe area: a native launch image is centred on the screen. */
.mobile-splash-mark {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 88px;
  height: 88px;
  margin: -44px 0 0 -44px;
  overflow: hidden;
  border-radius: 22%;
  animation: mobile-splash-breathe 1.6s ease-in-out 0.6s infinite;
}

/* The system font, as a launch image drawn with it has. */
.mobile-splash-initial {
  font: 600 40px/1 system-ui, -apple-system, sans-serif;
}

.mobile-splash-name {
  position: absolute;
  top: calc(50% + 44px + 1rem);
  right: 1rem;
  left: 1rem;
  text-align: center;
  animation: mobile-splash-in 400ms ease-out 150ms both;
}

@keyframes mobile-splash-breathe {
  50% {
    transform: scale(0.95);
  }
}

@keyframes mobile-splash-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .mobile-splash-mark,
  .mobile-splash-name {
    animation: none;
  }
}
</style>
