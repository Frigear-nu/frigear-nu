<script setup lang="ts">
import { ref, useModuleT, useOAuth } from '#imports'

defineOptions({ name: 'OAuthSignInButton', inheritAttrs: false })

const props = defineProps<{
  /** The same-app path to come back to after signing in. */
  returnTo?: string
  label?: string
}>()

const emit = defineEmits<{ error: [error: unknown] }>()

const t = useModuleT('oauthClient')
const { login, signingIn } = useOAuth()
const starting = ref(false)

async function start() {
  starting.value = true
  try {
    await login({ returnTo: props.returnTo })
  }
  catch (error) {
    emit('error', error)
  }
  finally {
    starting.value = false
  }
}
</script>

<template>
  <UButton
    :label="label ?? t('signIn', 'Sign in')"
    :loading="signingIn || starting"
    v-bind="$attrs"
    @click="start"
  />
</template>
