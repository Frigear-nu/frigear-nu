<script setup lang="ts">
import type { ButtonProps } from '@nuxt/ui'
import { computed, useHelpCenterPaths, useModuleT, useRuntimeConfig, useUserSession } from '#imports'

defineOptions({ name: 'HelpCenterSignedInCta' })

// A button into the signed-in help center, shown to signed-in people only. It renders on the client only, so the public
// pages stay the same for every visitor and cacheable. The module puts it in the header of the public area and at the
// end of each public article; a host can place it anywhere (site header, footer, account menu). `cta: false` in the
// module settings hides it everywhere.
const props = defineProps<{
  /** Where it goes: defaults to the signed-in area's home. */
  to?: string
  /** The text: defaults to "Crew help center". */
  label?: string
  variant?: ButtonProps['variant']
  size?: ButtonProps['size']
  color?: ButtonProps['color']
}>()

const t = useModuleT('helpCenter')
const { loggedIn } = useUserSession()
const paths = useHelpCenterPaths()
const enabled = useRuntimeConfig().public.helpCenter?.cta !== false
const target = computed(() => props.to ?? paths.signedIn.index())
</script>

<template>
  <ClientOnly>
    <UButton
      v-if="enabled && loggedIn && target"
      :to="target"
      icon="i-lucide-life-buoy"
      :label="label ?? t('cta.label', 'Crew help center')"
      :variant="variant ?? 'outline'"
      :size="size"
      :color="color ?? 'neutral'"
      data-test="help-center-cta"
    />
  </ClientOnly>
</template>
