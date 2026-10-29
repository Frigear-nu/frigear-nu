<script setup lang="ts">
/**
 * One row of an inline settings form (a form in a `SectionCard`, not a slideover): a `UFormField` with
 * `orientation="horizontal"`, the label and its `description` in a left column and the control on the right, stacked
 * below `sm`. Takes every `UFormField` prop and slot (a `ui` is merged over the row's). Put rows in a parent with
 * `divide-y divide-default` (usually the `UForm`); give short controls `class="w-full sm:max-w-sm"` and long ones
 * (textareas, editors) `class="w-full"`.
 */
defineOptions({ inheritAttrs: false })

type SlotClasses = Record<string, string | undefined>

const ROW_UI: SlotClasses = {
  root: 'gap-x-8 gap-y-2 py-4 first:pt-0 last:pb-0 max-sm:flex-col max-sm:items-stretch',
  wrapper: 'sm:w-1/3 sm:max-w-64 sm:shrink-0',
  container: 'min-w-0 flex-1',
}

const attrs = useAttrs()
const ui = computed(() => {
  const own = (attrs.ui ?? {}) as SlotClasses
  const slots = new Set([...Object.keys(ROW_UI), ...Object.keys(own)])
  return Object.fromEntries([...slots].map(slot => [slot, [ROW_UI[slot], own[slot]].filter(Boolean).join(' ')])) as SlotClasses
})
</script>

<template>
  <UFormField
    v-bind="$attrs"
    orientation="horizontal"
    :ui="ui"
  >
    <template
      v-for="(_, slot) in $slots"
      #[slot]="slotProps"
    >
      <slot
        :name="slot"
        v-bind="slotProps ?? {}"
      />
    </template>
  </UFormField>
</template>
