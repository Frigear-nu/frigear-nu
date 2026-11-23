<script setup lang="ts">
import HomeSwaps from '../tabs/HomeSwaps.vue'
import { useHead, useModuleT, useShiftsLinks } from '#imports'

defineOptions({ name: 'ShiftsSwapsPage' })

// The swap marketplace as a page of the site: `/shifts/swaps` when the crew home is not in the signed-in hub (or with
// `@frigear-nu/mobile`). The body is the Swaps tab of the crew home (`tabs/HomeSwaps.vue`).
const t = useModuleT('shifts')
const links = useShiftsLinks()

useHead({ title: () => t('swaps.title', 'Open swaps') })
</script>

<template>
  <UContainer>
    <UPage>
      <UPageHeader
        :title="t('swaps.title', 'Open swaps')"
        :description="t('swaps.description', 'Shifts others want to trade or give away that you can take. A trade asks for one of your own shifts in return.')"
      >
        <template #links>
          <UButton
            :to="links.shifts()"
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            :label="t('shift.back', 'My shifts')"
          />
        </template>
      </UPageHeader>
      <UPageBody class="max-w-3xl">
        <HomeSwaps />
      </UPageBody>
    </UPage>
  </UContainer>
</template>
