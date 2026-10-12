<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

defineOptions({ name: 'AccountApiTokensPage' })

interface ApiToken {
  id: string
  name: string
  prefix: string
  last4: string
  scopes: string[]
  expiresAt: string | null
  lastUsedAt: string | null
  createdAt: string
  status: 'ok' | 'revoked' | 'expired'
}
interface ScopeInfo { name: string, description?: string }

const t = useModuleT('account.apiTokens')
const toast = useToast()

const { data: tokens, refresh } = await useFetch<ApiToken[]>('/api/auth/tokens', { key: 'account-api-tokens', default: () => [] })
const { data: scopes } = await useFetch<ScopeInfo[]>('/api/auth/scopes', { key: 'account-api-token-scopes', default: () => [] })

const scopeItems = computed(() => (scopes.value ?? []).map(scope => ({
  label: scope.name === '*' ? t('allScopes', 'Full access') : scope.name,
  description: scope.description,
  value: scope.name,
})))
const expiryItems = computed(() => [
  { label: t('expiry.30', '30 days'), value: 30 },
  { label: t('expiry.90', '90 days'), value: 90 },
  { label: t('expiry.365', '1 year'), value: 365 },
  { label: t('expiry.never', 'No expiry'), value: 0 },
])

const schema = z.object({
  name: z.string().trim().min(1, t('name.required', 'Give the token a name.')).max(80),
  scopes: z.array(z.string()).min(1, t('scopes.required', 'Pick at least one scope.')),
  expiresInDays: z.number(),
})
type Schema = z.output<typeof schema>

const state = reactive<Schema>({ name: '', scopes: [], expiresInDays: 90 })
const creating = ref(false)
const revokingId = ref<string | null>(null)
// The plaintext token exists only in the response to the create call; it is shown once, then dropped.
const revealed = ref<{ name: string, token: string } | null>(null)

function errorMessage(e: unknown, fallback: string) {
  const err = e as { data?: { statusMessage?: string }, statusMessage?: string }
  return err?.data?.statusMessage ?? err?.statusMessage ?? fallback
}

async function onCreate(event: FormSubmitEvent<Schema>) {
  creating.value = true
  try {
    const created = await $fetch<ApiToken & { token: string }>('/api/auth/tokens', {
      method: 'POST',
      body: { name: event.data.name, scopes: event.data.scopes, expiresInDays: event.data.expiresInDays || null },
    })
    revealed.value = { name: created.name, token: created.token }
    state.name = ''
    state.scopes = []
    await refresh()
  }
  catch (e) {
    toast.add({ title: errorMessage(e, t('createError', 'Could not create the token.')), color: 'error' })
  }
  finally {
    creating.value = false
  }
}

async function copyText(text: string, success: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.add({ title: success, color: 'success' })
  }
  catch {
    toast.add({ title: t('copyError', 'Could not copy. Select the token and copy it manually.'), color: 'warning' })
  }
}

const copyToken = () => revealed.value && copyText(revealed.value.token, t('copied', 'Token copied.'))

async function onRevoke(token: ApiToken) {
  revokingId.value = token.id
  try {
    await $fetch(`/api/auth/tokens/${token.id}`, { method: 'DELETE' })
    toast.add({ title: t('revoked', 'Token revoked.'), color: 'success' })
    await refresh()
  }
  catch (e) {
    toast.add({ title: errorMessage(e, t('revokeError', 'Could not revoke the token.')), color: 'error' })
  }
  finally {
    revokingId.value = null
  }
}

// The token is only ever inlined into a snippet while it is revealed; afterwards the snippets show a placeholder.
const activeConnect = ref('claude')
const mcpUrl = `${useRequestURL().origin}/mcp`
const tokenPlaceholder = '<your-api-token>'
const shownToken = computed(() => revealed.value?.token ?? tokenPlaceholder)
const connectTabs = computed(() => [
  {
    label: 'Claude',
    value: 'claude',
    steps: t('connect.claude.steps', 'Claude.ai and Claude Desktop: open Settings → Connectors → Add custom connector, paste the URL below and sign in when asked. No token needed.'),
    code: mcpUrl,
    extraSteps: t('connect.claude.cli', 'Claude Code (uses an API token):'),
    extraCode: `claude mcp add --transport http frigear ${mcpUrl} --header "Authorization: Bearer ${shownToken.value}"`,
  },
  {
    label: 'ChatGPT',
    value: 'chatgpt',
    steps: t('connect.chatgpt.steps', 'ChatGPT: open Settings → Connectors → Advanced, turn on Developer mode, then create a connector with the URL below. Choose OAuth and sign in when asked. No token needed.'),
    code: mcpUrl,
  },
])

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })
function formatDate(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : dateFormatter.format(date)
}

function statusColor(status: ApiToken['status']) {
  return status === 'ok' ? 'success' : status === 'expired' ? 'warning' : 'neutral'
}
</script>

<template>
  <UContainer>
    <UPage>
      <UPageBody>
        <UPageCard
          :title="t('create.title', 'Create an API token')"
          :description="t('create.description', 'Tokens let scripts and tools such as MCP clients act as you. Give each one only the scopes it needs.')"
          variant="subtle"
        >
          <UAlert
            v-if="revealed"
            color="success"
            variant="subtle"
            icon="i-lucide-key-round"
            :title="t('reveal.title', 'Copy your new token now')"
            :description="t('reveal.description', 'This is the only time it is shown. If you lose it, create a new one.')"
          >
            <template #actions>
              <UInput
                :model-value="revealed.token"
                readonly
                class="w-full sm:w-96"
                :aria-label="t('reveal.label', 'New token')"
                @focus="($event.target as HTMLInputElement).select()"
              />
              <UButton
                icon="i-lucide-copy"
                :label="t('copy', 'Copy')"
                @click="copyToken"
              />
              <UButton
                color="neutral"
                variant="ghost"
                :label="t('reveal.done', 'Done')"
                @click="revealed = null"
              />
            </template>
          </UAlert>

          <UForm
            :schema="schema"
            :state="state"
            class="space-y-4"
            @submit="onCreate"
          >
            <UFormField
              :label="t('name.label', 'Name')"
              name="name"
              required
            >
              <UInput
                v-model="state.name"
                :placeholder="t('name.placeholder', 'e.g. My MCP client')"
                maxlength="80"
                class="w-full"
              />
            </UFormField>
            <UFormField
              :label="t('scopes.label', 'Scopes')"
              name="scopes"
              required
            >
              <USelectMenu
                v-model="state.scopes"
                :items="scopeItems"
                value-key="value"
                multiple
                :placeholder="t('scopes.placeholder', 'Choose what the token may do')"
                class="w-full"
              />
            </UFormField>
            <UFormField
              :label="t('expiry.label', 'Expires')"
              name="expiresInDays"
            >
              <USelect
                v-model="state.expiresInDays"
                :items="expiryItems"
                value-key="value"
                class="w-full sm:max-w-xs"
              />
            </UFormField>
            <UButton
              type="submit"
              :loading="creating"
              :label="t('create.submit', 'Create token')"
            />
          </UForm>
        </UPageCard>

        <UPageCard
          :title="t('connect.title', 'Connect to MCP')"
          :description="t('connect.description', 'Use your account from an AI assistant. Your API token is only filled into the commands right after you create it.')"
          variant="subtle"
        >
          <UTabs
            v-model="activeConnect"
            :items="connectTabs"
            :content="false"
            class="w-full"
          />
          <template
            v-for="tab in connectTabs"
            :key="tab.value"
          >
            <div
              v-if="tab.value === activeConnect"
              class="min-w-0 max-w-full space-y-3"
            >
              <p class="text-sm text-muted">
                {{ tab.steps }}
              </p>
              <div class="relative min-w-0">
                <pre class="max-w-full whitespace-pre-wrap break-all rounded-md bg-elevated p-3 pr-12 text-sm"><code>{{ tab.code }}</code></pre>
                <UButton
                  class="absolute right-2 top-2"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  icon="i-lucide-copy"
                  :aria-label="t('copy', 'Copy')"
                  @click="copyText(tab.code, t('copiedSnippet', 'Copied.'))"
                />
              </div>
              <template v-if="tab.extraCode">
                <p class="text-sm text-muted">
                  {{ tab.extraSteps }}
                </p>
                <div class="relative min-w-0">
                  <pre class="max-w-full whitespace-pre-wrap break-all rounded-md bg-elevated p-3 pr-12 text-sm"><code>{{ tab.extraCode }}</code></pre>
                  <UButton
                    class="absolute right-2 top-2"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    icon="i-lucide-copy"
                    :aria-label="t('copy', 'Copy')"
                    @click="copyText(tab.extraCode ?? '', t('copiedSnippet', 'Copied.'))"
                  />
                </div>
              </template>
            </div>
          </template>
        </UPageCard>

        <UPageCard
          :title="t('list.title', 'Your tokens')"
          :description="t('list.description', 'Revoke a token to stop it working immediately.')"
          variant="subtle"
        >
          <ul
            v-if="tokens?.length"
            class="divide-y divide-default"
          >
            <li
              v-for="token in tokens"
              :key="token.id"
              class="flex items-center justify-between gap-3 py-3"
            >
              <div class="min-w-0">
                <p class="flex items-center gap-2 truncate font-medium text-highlighted">
                  {{ token.name }}
                  <UBadge
                    :color="statusColor(token.status)"
                    variant="subtle"
                    :label="t(`status.${token.status}`, token.status)"
                  />
                </p>
                <p class="font-mono text-sm text-muted">
                  {{ token.prefix }}…{{ token.last4 }}
                </p>
                <p class="text-sm text-muted">
                  {{ token.scopes.join(', ') }}
                </p>
                <p class="text-sm text-muted">
                  {{ t('list.created', 'Created {date}', { date: formatDate(token.createdAt) }) }}
                  <template v-if="token.lastUsedAt">
                    · {{ t('list.lastUsed', 'Last used {date}', { date: formatDate(token.lastUsedAt) }) }}
                  </template>
                  <template v-if="token.expiresAt">
                    · {{ t('list.expires', 'Expires {date}', { date: formatDate(token.expiresAt) }) }}
                  </template>
                </p>
              </div>
              <UButton
                v-if="token.status !== 'revoked'"
                color="error"
                variant="ghost"
                icon="i-lucide-trash-2"
                :loading="revokingId === token.id"
                :aria-label="t('revoke', 'Revoke token')"
                @click="onRevoke(token)"
              />
            </li>
          </ul>
          <p
            v-else
            class="text-sm text-muted"
          >
            {{ t('list.empty', 'You have not created any tokens yet.') }}
          </p>
        </UPageCard>
      </UPageBody>
    </UPage>
  </UContainer>
</template>
