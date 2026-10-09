<script setup lang="ts">
const links = [
  { title: 'Frigear Instagram', icon: 'i-simple-icons-instagram', to: 'https://www.instagram.com/frigear.nu' },
  { title: 'Frigear Facebook', icon: 'i-simple-icons-facebook', to: 'https://www.facebook.com/Frigear.nu' },
  { title: 'Frigear LinkedIn', icon: 'i-simple-icons-linkedin', to: 'https://www.linkedin.com/company/frigear' },
  { title: 'Frigear TikTok', icon: 'i-simple-icons-tiktok', to: 'https://www.tiktok.com/@frigear.nu' },
  { title: 'Frigear YouTube', icon: 'i-simple-icons-youtube', to: 'https://www.youtube.com/@frigear' },
]
</script>

<template>
  <div class="flex flex-wrap gap-2">
    <UButton
      v-for="link in links"
      :key="link.to"
      :title="link.title"
      :aria-label="link.title"
      :icon="link.icon"
      :to="link.to"
      size="xl"
      variant="subtle"
      target="_blank"
      rel="noopener noreferrer"
    />
  </div>
</template>
