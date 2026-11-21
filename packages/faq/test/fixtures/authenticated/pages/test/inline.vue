<script setup lang="ts">
// Inline cards exactly in the shape of the website's page frontmatter (`FaqCardProps[]`).
const items = [
  {
    title: 'Inline card',
    icon: 'i-lucide-info',
    description: 'Written by hand.',
    faqs: [{ title: 'Inline question?', details: 'Inline answer.', lines: ['First line', 'Second line'] }],
    links: [{ label: 'Inline link', to: '/somewhere' }],
    contact: { label: 'Write to us', initial: { subject: 'Hello' } },
  },
]
</script>

<template>
  <div>
    <section data-test="faq-inline">
      <FaqGrid :items="items" />
    </section>
  </div>
</template>
