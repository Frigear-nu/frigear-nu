<script setup lang="ts">
import { getWidgetComponent } from '../utils/components'

// Renders every widget registered for `name` in a responsive grid. Replace the layout by using the `item` slot.
const props = defineProps<{ name: string }>()

const { data: widgets } = await useWidgets(props.name)

const spans = {
  1: '',
  2: 'md:col-span-2',
  3: 'lg:col-span-3',
  4: 'lg:col-span-4',
} as const
</script>

<template>
  <div
    v-if="widgets?.length"
    class="grid gap-4 md:grid-cols-2 lg:grid-cols-4"
  >
    <template
      v-for="widget in widgets"
      :key="widget.id"
    >
      <slot
        name="item"
        :widget="widget"
        :component="getWidgetComponent(name, widget.id)"
      >
        <div :class="spans[widget.span ?? 1]">
          <component
            :is="getWidgetComponent(name, widget.id)"
            v-bind="widget.props"
          />
        </div>
      </slot>
    </template>
  </div>
  <slot
    v-else
    name="empty"
  />
</template>
