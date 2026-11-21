<script setup lang="ts">
// A custom page: fetch with `useFaq` and render the cards from `toFaqCardProps`.
const { groups, items, status } = await useFaq(['page-custom'])
</script>

<template>
  <div>
    <p data-test="faq-status">
      {{ status }}: {{ groups.length }} groups, {{ items.length }} items
    </p>
    <section data-test="faq-custom">
      <FaqGrid :items="groups.map(toFaqCardProps)" />
    </section>
  </div>
</template>
