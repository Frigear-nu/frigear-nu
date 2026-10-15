<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { ApiTokenScope, CreatedApiToken } from '../../utils/api-tokens'

// "Create API token" form, opened from the API tokens page with `useOverlay()`. Resolves with the created token
// (the only time its plaintext exists) or `false` when cancelled.

const props = defineProps<{ scopes: ApiTokenScope[] }>()
const emit = defineEmits<{ close: [created: CreatedApiToken | false] }>()

const t = useModuleT('account.apiTokens')
const { busy, run } = useAction()

const scopeItems = computed(() => props.scopes.map(scope => ({
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

async function onSubmit(event: FormSubmitEvent<Schema>) {
  const created = await run(
    () => $fetch<CreatedApiToken>('/api/auth/tokens', {
      method: 'POST',
      body: { name: event.data.name, scopes: event.data.scopes, expiresInDays: event.data.expiresInDays || null },
    }),
    { error: t('createError', 'Could not create the token.') },
  )
  if (created) emit('close', created)
}
</script>

<template>
  <FormSlideover
    form-id="account-api-token"
    :title="t('create.title', 'Create API token')"
    :description="t('create.description', 'Tokens let scripts and tools such as MCP clients act as you. Give each one only the scopes it needs.')"
    :submit-label="t('create.submit', 'Create API token')"
    :loading="busy"
    @close="emit('close', false)"
  >
    <UForm
      id="account-api-token"
      :schema="schema"
      :state="state"
      class="flex flex-col gap-4"
      @submit="onSubmit"
    >
      <UFormField
        :label="t('name.label', 'Name')"
        :description="t('name.description', 'So you recognise the token later.')"
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
        :description="t('scopes.description', 'What the token may do.')"
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
          class="w-full"
        />
      </UFormField>
    </UForm>
  </FormSlideover>
</template>
