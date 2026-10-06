<script setup lang="ts">
import { useMenu } from '../composables/useMenu'

defineOptions({ name: 'MenuBar' })

const props = defineProps<{
  /** Menu or `menu.group` to render, e.g. `'main'` or `'dashboard.more'`. */
  menu: string
}>()

const { data: items } = useMenu(props.menu)
</script>

<template>
  <nav class="menu-bar">
    <ul>
      <li
        v-for="item in items"
        :key="item.id"
      >
        <a
          :href="item.to"
          :target="item.external ? '_blank' : undefined"
          :rel="item.external ? 'noopener noreferrer' : undefined"
        >
          <span
            v-if="item.icon"
            :class="item.icon"
          />
          {{ item.label }}
        </a>
      </li>
    </ul>
  </nav>
</template>
