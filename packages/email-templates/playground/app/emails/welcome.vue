<script setup lang="ts">
defineProps<{
  name: string
  url: string
}>()
</script>

<template>
  <EHtml>
    <EHead />
    <EBody>
      <EContainer>
        <ESubject>Welcome, {{ name }}</ESubject>
        <EHeading>Welcome, {{ name }}!</EHeading>
        <EText>Thanks for signing up.</EText>
        <EButton :href="url">
          Get started
        </EButton>
      </EContainer>
    </EBody>
  </EHtml>
</template>
