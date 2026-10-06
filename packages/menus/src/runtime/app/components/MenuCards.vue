<script setup lang="ts">
import { useMenu } from '../composables/useMenu'

defineOptions({ name: 'MenuCards' })

const props = defineProps<{
  /** Menu or `menu.group` to render, e.g. `'account'` or `'dashboard.more'`. */
  menu: string
}>()

const { data: items } = useMenu(props.menu)
</script>

<template>
  <div class="menu-cards">
    <a
      v-for="item in items"
      :key="item.id"
      class="menu-cards__item"
      :href="item.to"
      :target="item.external ? '_blank' : undefined"
      :rel="item.external ? 'noopener noreferrer' : undefined"
    >
      <span
        v-if="item.icon"
        :class="item.icon"
      />
      <strong>{{ item.label }}</strong>
      <p v-if="item.description">
        {{ item.description }}
      </p>
    </a>
  </div>
</template>
