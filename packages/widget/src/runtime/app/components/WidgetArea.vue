<script setup lang="ts">
import { getWidgetComponent } from '../utils/components'

// Renders every widget registered for `name` in a responsive grid. Replace the layout by using the `item` slot.
const props = defineProps<{ name: string }>()

const { data: widgets } = await useWidgets(props.name)
</script>

<template>
  <div
    v-if="widgets?.length"
    class="widget-area"
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

<style scoped>
/* Plain CSS rather than utility classes: Tailwind does not scan workspace packages. */
.widget-area {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
}

@media (min-width: 48rem) {
  .widget-area {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .widget-area > * {
    grid-column: span var(--widget-span, 1);
  }
}
</style>
