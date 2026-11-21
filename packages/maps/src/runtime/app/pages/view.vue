<script setup lang="ts">
import { computed, useHead, useMap, useMapsTranslate, useModuleT, useRoute } from '#imports'

defineOptions({ name: 'MapsViewPage' })

// The read-only page of one map (`/maps/:map`, by key or id), for volunteers on the web and in the app. `?feature=`
// opens the map on a feature: help articles and shifts link here.
const t = useModuleT('maps')
const tr = useMapsTranslate()
const route = useRoute()
const target = computed(() => String(route.params.map))
const feature = computed(() => typeof route.query.feature === 'string' ? route.query.feature : null)
const { map } = await useMap(target)
const title = computed(() => tr(map.value?.name) || t('view.title', 'Map'))
useHead({ title })
</script>

<template>
  <UContainer>
    <UPage>
      <UPageHeader :title="title" />
      <UPageBody>
        <MapView
          :map="target"
          :feature="feature"
          height="max(24rem, calc(100dvh - 16rem))"
        />
      </UPageBody>
    </UPage>
  </UContainer>
</template>
