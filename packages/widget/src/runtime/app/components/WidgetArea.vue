<script setup lang="ts">
import { getWidgetComponent } from '../utils/components'

// Renders every widget registered for `name` in a responsive grid. Replace the layout by using the `item` slot.
// Each widget receives its static `props`, then every entry of `context` as a prop (e.g. `{ user }`).
const props = defineProps<{ name: string, context?: Record<string, unknown> }>()

const { data: widgets } = await useWidgets(props.name, () => props.context)
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
        :context="context"
      >
        <div :style="{ '--widget-span': widget.span ?? 1 }">
          <component
            :is="getWidgetComponent(name, widget.id)"
            v-bind="{ ...widget.props, ...context }"
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
