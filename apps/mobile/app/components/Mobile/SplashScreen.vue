<script setup lang="ts">
// The splash screen (replaces @frigear-nu/mobile's): the full Frigear logo at the centre, as on the native launch image
// (`assets/splash.png`, `assets/splash-dark.png`), on its light or dark background.
const config = useRuntimeConfig().public.mobile
const style = {
  '--splash-light': config.splashScreen.background.light,
  '--splash-dark': config.splashScreen.background.dark,
}
</script>

<template>
  <div
    class="app-splash"
    :style="style"
    role="status"
    aria-busy="true"
    :aria-label="config.appName"
  >
    <img
      src="/images/logo-light.png"
      alt=""
      class="app-splash-logo dark:hidden"
    >
    <img
      src="/images/logo-dark.png"
      alt=""
      class="app-splash-logo hidden dark:block"
    >
  </div>
</template>

<style scoped>
.app-splash {
  background: var(--splash-light);
}

:root.dark .app-splash {
  background: var(--splash-dark);
}

.app-splash-logo {
  position: absolute;
  top: 50%;
  left: 50%;
  width: min(60vw, 280px);
  transform: translate(-50%, -50%);
}
</style>
