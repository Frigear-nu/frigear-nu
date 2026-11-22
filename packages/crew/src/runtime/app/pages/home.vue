<script setup lang="ts">
import { useHead, useModuleT } from '#imports'
import { CREW_DASHBOARD } from '../../dashboard'

defineOptions({ name: 'CrewHomePage' })

// A crew member's home: the `crew.home` dashboard, with every installed module's items the person may see (their crew
// status, shifts, help, ...). Signed-in only (`guardPages` in `module.ts`); each item checks its own permission.
const t = useModuleT('crew')

useHead({ title: () => t('home.title', 'Crew') })
</script>

<template>
  <UContainer>
    <UPage>
      <UPageHeader
        :title="t('home.title', 'Crew')"
        :description="t('home.description', 'What is happening for you on the crew.')"
      />
      <UPageBody>
        <Dashboard :name="CREW_DASHBOARD" />
      </UPageBody>
    </UPage>
  </UContainer>
</template>
