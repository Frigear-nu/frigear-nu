<script setup lang="ts">
import HomeShifts from '../tabs/HomeShifts.vue'
import { useHead, useModuleT } from '#imports'

defineOptions({ name: 'ShiftsMinePage' })

// My shifts as a page of the site: the page the mobile Shifts tab opens, and `/shifts` when the crew home is not in the
// signed-in hub. The body is the My shifts tab of the crew home (`tabs/HomeShifts.vue`), which sends a signed-out
// visitor to the sign-in page.
const t = useModuleT('shifts')

useHead({ title: () => t('mine.title', 'My shifts') })
</script>

<template>
  <UContainer>
    <UPage>
      <UPageHeader
        :title="t('mine.title', 'My shifts')"
        :description="t('mine.description', 'Your shifts, your check-in pass and your swaps.')"
      />
      <UPageBody>
        <HomeShifts standalone />
      </UPageBody>
    </UPage>
  </UContainer>
</template>
