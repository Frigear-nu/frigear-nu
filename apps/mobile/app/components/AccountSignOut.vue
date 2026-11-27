<script setup lang="ts">
// Signs out: revokes the refresh token at the website and returns to the public home.
const { t } = useI18n()
const { logout } = useAuth()
const native = useNative()
const signingOut = ref(false)

async function signOut() {
  const confirmed = await native.confirm({
    title: t('app.signOut.confirm.title'),
    description: t('app.signOut.confirm.description'),
    confirmLabel: t('app.signOut.label'),
    destructive: true,
  })
  if (!confirmed) return
  signingOut.value = true
  try {
    await logout()
  }
  finally {
    signingOut.value = false
  }
}
</script>

<template>
  <UButton
    :label="t('app.signOut.label')"
    icon="i-lucide-log-out"
    color="error"
    variant="soft"
    size="lg"
    block
    :loading="signingOut"
    data-sign-out
    @click="signOut"
  />
</template>
