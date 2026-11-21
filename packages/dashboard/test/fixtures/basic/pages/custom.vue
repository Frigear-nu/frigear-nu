<script setup lang="ts">
// A page with its own layout: the same items, read through `useDashboard`, in a list of its own. `DashboardItem`
// renders one item's component with its frame (title, collapse, loading and error states).
const { items, hidden } = await useDashboard('crew.home')
const first = computed(() => items.value[0])
const rest = computed(() => items.value.slice(1))
</script>

<template>
  <div class="flex flex-col gap-4 p-4">
    <h1>Custom layout</h1>
    <section
      v-if="first"
      data-custom-featured
    >
      <DashboardItem :item="first" />
    </section>
    <ol>
      <li
        v-for="item in rest"
        :key="item.id"
      >
        custom:{{ item.id }}:{{ item.title }}
      </li>
    </ol>
    <p>hidden:{{ hidden.map(item => item.id).join(',') }}</p>
  </div>
</template>
