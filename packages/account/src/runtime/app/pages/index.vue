<script setup lang="ts">
defineOptions({ name: 'AccountIndexPage' })

const { data: tiles } = useMenu('dashboard')
</script>

<template>
  <UContainer>
    <UPage>
      <UPageBody>
        <UPageGrid>
          <UPageCard
            v-for="tile in tiles"
            :key="tile.id"
            :title="tile.label"
            :description="tile.description"
            :icon="tile.icon"
            :to="tile.to"
            orientation="horizontal"
          />
        </UPageGrid>
      </UPageBody>
    </UPage>
  </UContainer>
</template>
