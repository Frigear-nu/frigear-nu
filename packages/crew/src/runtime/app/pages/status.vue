<script setup lang="ts">
import HomeStatus from '../tabs/HomeStatus.vue'
import { useHead, useModuleT } from '#imports'

defineOptions({ name: 'CrewStatusPage' })

// A volunteer's own crew status as a page of the site: the page the mobile Crew tab opens, and `/crew/status` when the
// crew home is not in the signed-in hub. The body is the My crew tab of the crew home (`tabs/HomeStatus.vue`), which
// sends a signed-out visitor to the sign-in page.
const t = useModuleT('crew')

useHead({ title: () => t('status.title', 'My crew') })
</script>

<template>
  <UContainer>
    <UPage>
      <UPageHeader
        :title="t('status.title', 'My crew')"
        :description="t('status.description', 'Your applications and your places on a crew.')"
      />
      <UPageBody>
        <HomeStatus />
      </UPageBody>
    </UPage>
  </UContainer>
</template>
