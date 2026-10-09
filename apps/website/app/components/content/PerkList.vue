<script setup lang="ts">
// Renders a plain markdown list (`- item`) as a tidy grid of perk cards, e.g.
//   ::perk-list
//   - First in line for updates
//   - Voting rights
//   ::
</script>

<template>
  <div
    class="mx-auto max-w-3xl text-left
      [&_ul]:m-0 [&_ul]:grid [&_ul]:list-none [&_ul]:gap-3 [&_ul]:p-0 sm:[&_ul]:grid-cols-2
      [&_li]:m-0 [&_li]:before:text-primary [&_li]:before:content-['★'] [&_li]:flex [&_li]:items-start [&_li]:gap-3 [&_li]:rounded-lg [&_li]:bg-elevated/50 [&_li]:p-4 [&_li]:ring [&_li]:ring-default
      [&_li_p]:m-0"
  >
    <slot />
  </div>
</template>
