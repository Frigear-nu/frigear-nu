<script setup lang="ts">
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
import type { ApiToken, ApiTokenScope } from '../utils/api-tokens'
import AccountApiTokenSlideover from '../components/Account/AccountApiTokenSlideover.vue'

defineOptions({ name: 'AccountApiTokensPage' })

const t = useModuleT('account.apiTokens')
const toast = useToast()
const showError = useErrorToast()
const confirm = useConfirmDialog()
const format = useFormat()
const { copy } = useCopyToClipboard()
const overlay = useOverlay()
const createSlideover = overlay.create(AccountApiTokenSlideover, { destroyOnClose: true })

const { data: tokens, refresh, status } = await useFetch<ApiToken[]>('/api/auth/tokens', { key: 'account-api-tokens', default: () => [] })
const { data: scopes } = await useFetch<ApiTokenScope[]>('/api/auth/scopes', { key: 'account-api-token-scopes', default: () => [] })

// The plaintext token exists only in the response to the create call; it is shown once, then dropped.
const revealed = ref<{ name: string, token: string } | null>(null)

async function onCreate() {
  const created = await createSlideover.open({ scopes: scopes.value ?? [] })
  if (!created) return
  revealed.value = { name: created.name, token: created.token }
  toast.add({ title: t('created', 'Token created'), description: created.name, color: 'success', icon: 'i-lucide-check' })
  await refresh()
}

const copyToken = () => revealed.value && copy(revealed.value.token, t('copied', 'Token copied.'))

async function onRevoke(token: ApiToken) {
  const confirmed = await confirm({
    title: t('revokeConfirm.title', 'Revoke {name}?', { name: token.name }),
    description: t('revokeConfirm.description', 'Scripts and tools using this token stop working immediately. This cannot be undone.'),
    confirmText: t('revoke', 'Revoke token'),
    destructive: true,
  })
  if (!confirmed) return
  try {
    await $fetch(`/api/auth/tokens/${token.id}`, { method: 'DELETE' })
    toast.add({ title: t('revoked', 'Token revoked.'), description: token.name, color: 'success', icon: 'i-lucide-check' })
    await refresh()
  }
  catch (e) {
    showError(e, t('revokeError', 'Could not revoke the token.'))
  }
}

const tokenMenu = (token: ApiToken): DropdownMenuItem[][] => token.status === 'revoked'
  ? []
  : [[{ label: t('revoke', 'Revoke token'), icon: 'i-lucide-ban', color: 'error', onSelect: () => onRevoke(token) }]]

const columns = computed<TableColumn<ApiToken>[]>(() => [
  { accessorKey: 'name', header: t('list.name', 'Name') },
  { accessorKey: 'scopes', header: t('scopes.label', 'Scopes') },
  { accessorKey: 'createdAt', header: t('list.createdColumn', 'Created') },
  { accessorKey: 'lastUsedAt', header: t('list.lastUsedColumn', 'Last used') },
  { accessorKey: 'expiresAt', header: t('list.expiresColumn', 'Expires') },
  { id: 'actions', meta: { class: { td: 'w-px text-right' } } },
])

function tokenStatusColor(status: ApiToken['status']) {
  return statusColor(status, { ok: 'success', expired: 'warning' })
}

// The token is only ever inlined into a snippet while it is revealed; afterwards the snippets show a placeholder.
const mcpEnabled = useRuntimeConfig().public.users?.mcp === true
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
    extraSteps: undefined,
    extraCode: undefined,
  },
])
const activeTab = computed(() => connectTabs.value.find(tab => tab.value === activeConnect.value) ?? connectTabs.value[0])
</script>

<template>
  <div class="flex flex-col gap-4">
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
          :label="t('copy', 'Copy token')"
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

    <TableCard :loading="status === 'pending' && !tokens?.length">
      <template #header>
        <div class="min-w-0">
          <h2 class="text-sm font-semibold text-highlighted">
            {{ t('list.title', 'Your tokens') }}
          </h2>
          <p class="text-sm text-muted">
            {{ t('list.description', 'Tokens let scripts and tools such as MCP clients act as you. Revoke one to stop it working immediately.') }}
          </p>
        </div>
        <UButton
          icon="i-lucide-plus"
          :label="t('create.submit', 'Create API token')"
          @click="onCreate"
        />
      </template>

      <UTable
        :data="tokens ?? []"
        :columns="columns"
        :ui="tableUi({ tr: '' })"
      >
        <template #name-cell="{ row }">
          <div class="flex min-w-0 flex-col">
            <span class="flex items-center gap-2 font-medium text-highlighted">
              {{ row.original.name }}
              <UBadge
                :color="tokenStatusColor(row.original.status)"
                variant="subtle"
                :label="t(`status.${row.original.status}`, row.original.status)"
              />
            </span>
            <span class="font-mono text-xs text-muted">{{ row.original.prefix }}…{{ row.original.last4 }}</span>
          </div>
        </template>
        <template #scopes-cell="{ row }">
          <span class="text-muted">{{ row.original.scopes.join(', ') }}</span>
        </template>
        <template #createdAt-cell="{ row }">
          {{ format.date(row.original.createdAt) }}
        </template>
        <template #lastUsedAt-cell="{ row }">
          <span v-if="row.original.lastUsedAt">{{ format.date(row.original.lastUsedAt) }}</span>
          <span
            v-else
            class="text-dimmed"
          >{{ t('list.neverUsed', 'Never') }}</span>
        </template>
        <template #expiresAt-cell="{ row }">
          <span v-if="row.original.expiresAt">{{ format.date(row.original.expiresAt) }}</span>
          <span
            v-else
            class="text-dimmed"
          >{{ t('expiry.never', 'No expiry') }}</span>
        </template>
        <template #actions-cell="{ row }">
          <RowMenu
            v-if="row.original.status !== 'revoked'"
            :items="tokenMenu(row.original)"
            :subject="row.original.name"
          />
        </template>
        <template #empty>
          <UEmpty
            variant="naked"
            icon="i-lucide-key-round"
            :title="t('list.empty', 'You have not created any tokens yet.')"
            :actions="[{ label: t('create.submit', 'Create API token'), icon: 'i-lucide-plus', onClick: onCreate }]"
          />
        </template>
      </UTable>
    </TableCard>

    <SectionCard
      v-if="mcpEnabled"
      :title="t('connect.title', 'Connect to MCP')"
      :description="t('connect.description', 'Use your account from an AI assistant. Your API token is only filled into the commands right after you create it.')"
    >
      <div class="flex min-w-0 flex-col gap-3">
        <PageTabs
          v-model="activeConnect"
          :items="connectTabs.map(tab => ({ label: tab.label, value: tab.value }))"
        />
        <template v-if="activeTab">
          <p class="text-sm text-muted">
            {{ activeTab.steps }}
          </p>
          <div class="relative min-w-0">
            <pre class="max-w-full whitespace-pre-wrap break-all rounded-md bg-elevated p-3 pr-12 text-sm"><code>{{ activeTab.code }}</code></pre>
            <UButton
              class="absolute right-2 top-2"
              color="neutral"
              variant="ghost"
              size="xs"
              icon="i-lucide-copy"
              :aria-label="t('copySnippet', 'Copy command')"
              @click="copy(activeTab.code, t('copiedSnippet', 'Copied.'))"
            />
          </div>
          <template v-if="activeTab.extraCode">
            <p class="text-sm text-muted">
              {{ activeTab.extraSteps }}
            </p>
            <div class="relative min-w-0">
              <pre class="max-w-full whitespace-pre-wrap break-all rounded-md bg-elevated p-3 pr-12 text-sm"><code>{{ activeTab.extraCode }}</code></pre>
              <UButton
                class="absolute right-2 top-2"
                color="neutral"
                variant="ghost"
                size="xs"
                icon="i-lucide-copy"
                :aria-label="t('copySnippet', 'Copy command')"
                @click="copy(activeTab.extraCode, t('copiedSnippet', 'Copied.'))"
              />
            </div>
          </template>
        </template>
      </div>
    </SectionCard>
  </div>
</template>
