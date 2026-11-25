<script setup lang="ts">
import { credentialsEnv } from '../../utils/credentials-env'
import type { CredentialsEnvBlock } from '../../utils/credentials-env'
import { computed, ref, surfaceClass, useCopyToClipboard, useModuleT } from '#imports'

defineOptions({ name: 'OAuthCredentialsModal' })

/** Shown once after creating an application or replacing its secret. Opened by `useOAuthApplicationActions`. */
const props = defineProps<{
  name: string
  clientId: string
  /** `null` for a public client: it has no secret. */
  clientSecret: string | null
  /** The issuer URL the client signs in against. */
  issuer: string
  /** The redirect URI the app signs in with, when known: goes into the OIDC `.env`. */
  redirectUri?: string | null
}>()

const t = useModuleT('oauthServer')
const { copy } = useCopyToClipboard()

const showEnv = ref(false)
const env = computed(() => credentialsEnv(props))
const tabs = computed(() => [
  { value: 'frigear', label: t('credentials.tabFrigear', 'Frigear Auth'), slot: 'env' as const, blocks: env.value.frigear },
  { value: 'oidc', label: t('credentials.tabOidc', 'OIDC (nuxt-auth-utils)'), slot: 'env' as const, blocks: env.value.oidc },
])

function blockLabel(block: CredentialsEnvBlock) {
  if (block.label === 'server') return t('credentials.serverApp', 'Server-rendered app (PKCE)')
  if (block.label === 'client') return t('credentials.clientApp', 'Browser, desktop or mobile app (client mode)')
  return undefined
}
</script>

<template>
  <UModal
    :title="t('credentials.title', 'Credentials for {name}', { name })"
    :ui="{ content: 'sm:max-w-2xl' }"
    :description="clientSecret ? t('credentials.description', 'Copy the client secret now. It is only shown once.') : t('credentials.publicDescription', 'This is a public client: it has no client secret and signs in with PKCE only.')"
  >
    <template #body>
      <div class="flex flex-col gap-4">
        <DescriptionList
          :items="[
            { key: 'issuer', label: t('credentials.issuer', 'Issuer') },
            { key: 'clientId', label: t('credentials.clientId', 'Client ID') },
            { key: 'clientSecret', label: t('credentials.clientSecret', 'Client secret') },
          ]"
        >
          <template #issuer>
            <div class="flex items-center gap-2">
              <code class="min-w-0 break-all">{{ issuer }}</code>
              <UButton
                size="xs"
                color="neutral"
                variant="outline"
                icon="i-lucide-copy"
                :label="t('credentials.copy', 'Copy')"
                @click="copy(issuer, t('credentials.copiedIssuer', 'Issuer copied'))"
              />
            </div>
          </template>
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

        <UCollapsible v-model:open="showEnv">
          <UButton
            color="neutral"
            variant="link"
            class="px-0"
            :icon="showEnv ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
            :label="showEnv ? t('credentials.hideEnv', 'Hide .env') : t('credentials.showEnv', 'Show .env')"
          />
          <template #content>
            <UTabs
              :items="tabs"
              default-value="frigear"
              variant="link"
              size="sm"
              class="pt-2"
            >
              <template #env="{ item }">
                <div class="flex flex-col gap-3 pt-2">
                  <div
                    v-for="(block, index) in item.blocks"
                    :key="index"
                    class="flex flex-col gap-1.5"
                  >
                    <p
                      v-if="blockLabel(block)"
                      class="text-sm font-medium text-highlighted"
                    >
                      {{ blockLabel(block) }}
                    </p>
                    <pre :class="[surfaceClass, 'p-3 text-xs overflow-x-auto']"><code>{{ block.text }}</code></pre>
                    <div>
                      <UButton
                        size="xs"
                        color="neutral"
                        variant="outline"
                        icon="i-lucide-copy"
                        :label="t('credentials.copyEnv', 'Copy .env')"
                        @click="copy(block.text, t('credentials.copiedEnv', '.env copied'))"
                      />
                    </div>
                  </div>
                </div>
              </template>
            </UTabs>
          </template>
        </UCollapsible>
      </div>
    </template>
  </UModal>
</template>
