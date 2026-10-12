<script setup lang="ts">
const t = useModuleT('account.identificationCode')
const open = defineModel<boolean>('open', { default: false })
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('title', 'Frigear ID')"
  >
    <slot />
    <template #body>
      <AccountIdentificationCode v-if="open" />
    </template>
  </UModal>
</template>
