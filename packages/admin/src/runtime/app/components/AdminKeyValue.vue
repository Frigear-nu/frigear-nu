<!-- @deprecated: use DescriptionList from @frigear-nu/ui -->
<script setup lang="ts">
export interface AdminKeyValueItem {
  key: string
  label: string
  value?: string | number | null
}

defineProps<{ items: AdminKeyValueItem[], loading?: boolean }>()
</script>

<template>
  <DescriptionList
    :items="items"
    :loading="loading"
    align="end"
    empty="–"
  >
    <template
      v-for="(_, name) in $slots"
      #[name]="slotProps"
    >
      <slot
        :name="name"
        v-bind="slotProps ?? {}"
      />
    </template>
  </DescriptionList>
</template>
