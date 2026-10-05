<script setup lang="ts">
defineOptions({ name: 'AccountIndexPage' })

const tiles = useNavigation()
</script>

<template>
  <UContainer>
    <UPage>
      <UPageBody>
        <UPageGrid>
          <UPageCard
            v-for="tile in tiles"
            :key="tile.id ?? tile.title"
            :title="tile.title"
            :description="tile.description"
            :icon="tile.icon"
            :to="tile.to"
            orientation="horizontal"
            @click="tile.onClick?.()"
          />
        </UPageGrid>
      </UPageBody>
    </UPage>
  </UContainer>
</template>
