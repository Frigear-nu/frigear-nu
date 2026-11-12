<script setup lang="ts">
// The ids `useWidgets` / `useTabs` return after authorization's filters, and the access version they are keyed on.
const { data: widgets } = await useWidgets('fixture')
const { data: tabs } = await useTabs('fixture')
const version = useState<number>('access:version')
</script>

<template>
  <div>
    <span
      v-for="widget in widgets"
      :key="widget.id"
    >widget:{{ widget.id }}</span>
    <span
      v-for="tab in tabs"
      :key="tab.id"
    >tab:{{ tab.id }}</span>
    <span>access-version:{{ version }}</span>
  </div>
</template>
