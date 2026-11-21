<script setup lang="ts">
import { useRoute } from '#imports'

defineOptions({ name: 'HelpCenterPublicCategoryPage' })

// One category of the public area (see `HelpCenterCategoryView`).
const route = useRoute()
</script>

<template>
  <HelpCenterCategoryView
    area="public"
    :category="String(route.params.category)"
  />
</template>
