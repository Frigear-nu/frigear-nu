<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent, InputMenuItem } from '@nuxt/ui'
import type { AdminOAuthScopeDto, OAuthScopeInput, OAuthScopePermissionOptionDto } from '../../../types'
import { oauthServerApi } from '../../utils/api'
import { computed, reactive, useAction, useLazyFetch, useModuleT, useNuxtApp } from '#imports'

defineOptions({ name: 'OAuthScopeSlideover' })

/**
 * Create or edit a database scope (read-only for a scope of config or a module). Open it with `useOverlay()` (see
 * `useOAuthScopeActions`): it closes with the saved scope, or `false` on cancel.
 */
const props = defineProps<{
  /** The scope to edit; leave out to create one. */
  scope?: AdminOAuthScopeDto
  save: (input: OAuthScopeInput) => Promise<AdminOAuthScopeDto>
}>()

const emit = defineEmits<{
  close: [value: AdminOAuthScopeDto | false]
}>()

const t = useModuleT('oauthServer')
const { busy, run } = useAction()
const managed = computed(() => !!props.scope?.managed)

const schema = z.object({
  name: z.string().trim().regex(/^[a-z0-9][a-z0-9._-]*$/, t('scopes.form.nameInvalid', 'One lower-case word: letters, digits, ".", "_" or "-".')),
  label: z.string(),
  description: z.string(),
  icon: z.string(),
  permissions: z.array(z.string()).min(1, t('scopes.form.permissionsRequired', 'Add at least one permission.')),
  isActive: z.boolean(),
})

type FormState = z.infer<typeof schema>

const state = reactive<FormState>({
  name: props.scope?.name ?? '',
  label: props.scope?.label ?? '',
  description: props.scope?.description ?? '',
  icon: props.scope?.icon ?? '',
  permissions: [...(props.scope?.permissions ?? [])],
  isActive: props.scope?.isActive ?? true,
})

const formId = 'oauth-scope-form'

// The permissions a scope may carry (never sensitive or session-only), grouped by module. Names that are not offered
// can still be typed: the server validates every name.
const { data: permissionOptions, status: permissionStatus } = useLazyFetch<OAuthScopePermissionOptionDto[]>(oauthServerApi.admin.permissions, {
  key: 'oauth-server:scope-permissions',
  server: false,
  immediate: !managed.value,
  default: () => [],
})
const i18n = useNuxtApp().$i18n as { t: (key: string) => string, te?: (key: string) => boolean } | undefined
// Permission labels name full i18n keys (any namespace).
const translated = (key: string | null, fallback: string) => key && i18n?.te?.(key) ? i18n.t(key) : fallback

const permissionItems = computed<InputMenuItem[][]>(() => {
  const groups = new Map<string, InputMenuItem[]>()
  for (const option of permissionOptions.value ?? []) {
    const group = option.from ?? option.group
    if (!groups.has(group)) groups.set(group, [{ type: 'label', label: group }])
    groups.get(group)!.push({
      label: translated(option.labelKey, option.label ?? option.name),
      description: option.name,
      value: option.name,
      ui: { itemDescription: 'font-mono' },
    })
  }
  return [...groups.values()]
})

function addPermission(value: string) {
  const name = value.trim()
  if (name && !state.permissions.includes(name)) state.permissions.push(name)
}

async function onSubmit(event: FormSubmitEvent<FormState>) {
  if (managed.value) return
  const value = event.data
  const saved = await run(() => props.save({
    name: value.name,
    label: value.label || null,
    description: value.description || null,
    icon: value.icon || null,
    permissions: value.permissions,
    isActive: value.isActive,
  }))
  if (saved) emit('close', saved)
}
</script>

<template>
  <FormSlideover
    :title="scope ? scope.name : t('scopes.form.createTitle', 'Add scope')"
    :description="scope ? t('scopes.form.editDescription', 'What applications get when a user grants this scope.') : t('scopes.form.createDescription', 'A name applications can ask for, standing for a set of permissions.')"
    :form-id="formId"
    :submit-label="scope ? t('scopes.form.save', 'Save scope') : t('scopes.form.create', 'Add scope')"
    :loading="busy"
    @close="emit('close', $event)"
  >
    <UForm
      :id="formId"
      :schema="schema"
      :state="state"
      :disabled="managed"
      class="grid gap-4"
      @submit="onSubmit"
    >
      <UAlert
        v-if="managed"
        color="neutral"
        variant="subtle"
        icon="i-lucide-file-cog"
        :title="t('scopes.form.managedTitle', 'Managed in nuxt.config')"
        :description="t('scopes.form.managedDescription', 'This scope is defined in oauthServer.scopes or by a module and cannot be changed here.')"
      />
      <UFormField
        name="name"
        :label="t('scopes.form.name', 'Name')"
        :description="t('scopes.form.nameHint', 'What applications ask for, e.g. tickets. Cannot be changed later.')"
        required
      >
        <UInput
          v-model="state.name"
          :disabled="!!scope"
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="permissions"
        :label="t('scopes.form.permissions', 'Permissions')"
        :description="t('scopes.form.permissionsHint', 'Pick a permission or type its name, e.g. tickets:read. Never sensitive or session-only ones, and no wildcards. Adding permissions asks users to consent again.')"
        required
      >
        <UInputMenu
          v-model="state.permissions"
          :items="permissionItems"
          value-key="value"
          :filter-fields="['label', 'description']"
          :loading="permissionStatus === 'pending'"
          :placeholder="t('scopes.form.permissionsPlaceholder', 'Search permissions...')"
          multiple
          create-item
          class="w-full"
          @create="addPermission"
        >
          <template #tags-item-text="{ item }">
            <span class="font-mono">{{ item }}</span>
          </template>
        </UInputMenu>
      </UFormField>
      <UFormField
        name="label"
        :label="t('scopes.form.label', 'Label')"
        :description="t('scopes.form.labelHint', 'Shown on the consent screen, e.g. “Your tickets”.')"
      >
        <UInput
          v-model="state.label"
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="description"
        :label="t('scopes.form.description', 'Description')"
      >
        <UTextarea
          v-model="state.description"
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="icon"
        :label="t('scopes.form.icon', 'Icon')"
      >
        <UInput
          v-model="state.icon"
          class="w-full"
          placeholder="i-lucide-key-round"
        />
      </UFormField>
      <UFormField
        name="isActive"
        :description="t('scopes.form.isActiveHint', 'A disabled scope is unknown to applications until it is enabled again.')"
      >
        <USwitch
          v-model="state.isActive"
          :label="t('scopes.form.isActive', 'Active')"
        />
      </UFormField>
      <p
        v-if="scope && !managed"
        class="text-xs text-muted"
      >
        {{ t('scopes.form.version', 'Version {version}', { version: scope.version }) }}
      </p>
    </UForm>
  </FormSlideover>
</template>
