<script setup lang="ts">
import { useRoute } from '#imports'

defineOptions({ name: 'HelpCenterSignedInArticlePage' })

// One article of the signed-in area (see `HelpCenterArticleView`); reading it ticks it off the checklists.
const route = useRoute()
</script>

<template>
  <HelpCenterArticleView
    area="signedIn"
    :category="String(route.params.category)"
    :slug="String(route.params.slug)"
  />
</template>
