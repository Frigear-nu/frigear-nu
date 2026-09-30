<script setup lang="ts">
import { useUserLogin } from '#imports'

const { isEnabled, oauthProviders } = useUserLogin()
</script>

<template>
  <UContainer>
    <UPage>
      <UPageBody>
        <UAuthForm
          title="Hello"
          :providers="oauthProviders"
        />
      </UPageBody>
    </UPage>
  </UContainer>
</template>
