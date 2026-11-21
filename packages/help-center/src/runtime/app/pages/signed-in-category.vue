<script setup lang="ts">
import { useRoute } from '#imports'

defineOptions({ name: 'HelpCenterSignedInCategoryPage' })

// One category of the signed-in area (see `HelpCenterCategoryView`).
const route = useRoute()
</script>

<template>
  <HelpCenterCategoryView
    area="signedIn"
    :category="String(route.params.category)"
  />
</template>
