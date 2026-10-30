<script setup lang="ts">
import { useCopyToClipboard, useModuleT } from '#imports'

defineOptions({ name: 'OAuthCredentialsModal' })

/** Shown once after creating an application or replacing its secret. Opened by `useOAuthApplicationActions`. */
defineProps<{
  name: string
  clientId: string
  /** `null` for a public client: it has no secret. */
  clientSecret: string | null
}>()

const t = useModuleT('oauthServer')
const { copy } = useCopyToClipboard()
</script>

<template>
  <UModal
    :title="t('credentials.title', 'Credentials for {name}', { name })"
    :description="clientSecret ? t('credentials.description', 'Copy the client secret now. It is only shown once.') : t('credentials.publicDescription', 'This is a public client: it has no client secret and signs in with PKCE only.')"
  >
    <template #body>
      <DescriptionList
        :items="[
          { key: 'clientId', label: t('credentials.clientId', 'Client ID') },
          { key: 'clientSecret', label: t('credentials.clientSecret', 'Client secret') },
        ]"
      >
        <template #clientId>
          <div class="flex items-center gap-2">
            <code class="min-w-0 break-all">{{ clientId }}</code>
            <UButton
              size="xs"
              color="neutral"
              variant="outline"
              icon="i-lucide-copy"
              :label="t('credentials.copy', 'Copy')"
              @click="copy(clientId, t('credentials.copiedClientId', 'Client ID copied'))"
            />
          </div>
        </template>
        <template #clientSecret>
          <span
            v-if="!clientSecret"
            class="text-muted"
          >{{ t('credentials.noSecret', 'None (public client)') }}</span>
          <div
            v-else
            class="flex items-center gap-2"
          >
            <code class="min-w-0 break-all">{{ clientSecret }}</code>
            <UButton
              size="xs"
              color="neutral"
              variant="outline"
              icon="i-lucide-copy"
              :label="t('credentials.copy', 'Copy')"
              @click="copy(clientSecret, t('credentials.copiedClientSecret', 'Client secret copied'))"
            />
          </div>
        </template>
      </DescriptionList>
    </template>
  </UModal>
</template>
