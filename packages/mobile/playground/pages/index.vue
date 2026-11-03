<script setup lang="ts">
const native = useNative()

async function remove() {
  if (await native.confirm({ title: 'Delete the note?', description: 'This cannot be undone.', confirmLabel: 'Delete note', destructive: true })) {
    await native.haptic('success')
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <p>Platform: {{ native.platform }}</p>
    <UButton
      label="Delete note"
      color="error"
      @click="remove"
    />
    <MobileFab
      label="Add note"
      @click="native.haptic()"
    />
  </div>
</template>
