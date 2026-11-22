<script setup lang="ts">
import { useRoute } from '#imports'

defineOptions({ name: 'HelpCenterPublicArticlePage' })

// One article of the public area (see `HelpCenterArticleView`).
const route = useRoute()
</script>

<template>
  <HelpCenterArticleView
    area="public"
    :category="String(route.params.category)"
    :slug="String(route.params.slug)"
  />
</template>
