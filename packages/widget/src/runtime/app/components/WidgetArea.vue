<script setup lang="ts">
import { getWidgetComponent } from '../utils/components'

// Renders every widget registered for `name` in a responsive grid. Replace the layout by using the `item` slot.
const props = defineProps<{ name: string }>()

const { data: widgets } = await useWidgets(props.name)
</script>

<template>
  <div
    v-if="widgets?.length"
    class="grid grid-cols-[repeat(auto-fit,minmax(16rem,1fr))] gap-4 md:grid-cols-4 md:[&>*]:[grid-column:span_var(--widget-span,1)]"
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
        <div :style="{ '--widget-span': widget.span ?? 1 }">
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
