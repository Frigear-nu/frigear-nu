<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { AdminApplicationDto, ApplicationInput, ClientType, CreatedApplicationDto } from '../../../types'
import { isLongBrowserSession, isNativeRedirectUri, isSecureOrigin } from '../../utils'
import { computed, reactive, ref, useAction, useModuleT } from '#imports'

type Saved = AdminApplicationDto | CreatedApplicationDto

defineOptions({ name: 'OAuthApplicationSlideover' })

/**
 * Create or edit an application. Open it with `useOverlay()` (see `useOAuthApplicationActions`): it closes with the
 * saved application, or `false` on cancel. `save` performs the request, so a failure is toasted and the form stays open.
 */
const props = defineProps<{
  /** The application to edit; leave out to create one. */
  application?: AdminApplicationDto
  save: (input: ApplicationInput) => Promise<Saved>
}>()

const emit = defineEmits<{
  close: [value: Saved | false]
}>()

const t = useModuleT('oauthServer')
const { busy, run } = useAction()

/** https (http for localhost) for everyone; a custom scheme only when the client is public. The server decides again. */
const isAllowedRedirect = (value: string, clientType: ClientType) => {
  if (!URL.canParse(value)) return false
  const url = new URL(value)
  return !url.hash && (isSecureOrigin(url) || (clientType === 'public' && isNativeRedirectUri(url)))
}

/** Defined in `oauthServer.clients`: config owns everything but the login URL, priority and whether it is active. */
const managed = computed(() => !!props.application?.managed)

const schema = z.object({
  clientType: z.enum(['confidential', 'public']),
  redirectUris: z.array(z.string()),
  name: z.string().trim().min(1, t('form.nameRequired', 'Enter a name.')),
  // Empty is allowed here; whether this client may leave it out is `websiteUrlError` (it depends on the client type).
  websiteUrl: z.url(t('form.websiteUrlInvalid', 'Enter a full URL, for example https://app.example.com.')).or(z.literal('')),
  loginUrl: z.string(),
  previewUrlPattern: z.string(),
  description: z.string(),
  icon: z.string(),
  priority: z.number(),
  allowedRoles: z.array(z.string()),
  tags: z.array(z.string()),
  wildcardScopes: z.boolean(),
  isListed: z.boolean(),
  // Seconds; 0 = the default (inherit).
  refreshIdleTtl: z.number(),
  refreshMaxAge: z.number(),
})

type FormState = z.infer<typeof schema>

const state = reactive<FormState>({
  clientType: props.application?.clientType ?? 'confidential',
  redirectUris: [...(props.application?.redirectUris ?? [])],
  name: props.application?.name ?? '',
  websiteUrl: props.application?.websiteUrl ?? '',
  loginUrl: props.application?.loginUrl ?? '',
  previewUrlPattern: props.application?.previewUrlPattern ?? '',
  description: props.application?.description ?? '',
  icon: props.application ? (props.application.icon ?? '') : 'i-lucide-globe',
  priority: props.application?.priority ?? 0,
  allowedRoles: [...(props.application?.allowedRoles ?? [])],
  tags: [...(props.application?.tags ?? [])],
  wildcardScopes: props.application?.wildcardScopes ?? false,
  isListed: props.application?.isListed ?? true,
  refreshIdleTtl: props.application?.refreshIdleTtl ?? 0,
  refreshMaxAge: props.application?.refreshMaxAge ?? 0,
})

const formId = 'oauth-application-form'

const clientTypeItems = computed(() => [
  { label: t('form.clientTypeConfidential', 'Confidential'), value: 'confidential' },
  { label: t('form.clientTypePublic', 'Public'), value: 'public' },
])

/** What the selected client type means, shown under the select so the items stay short. */
const clientTypeDetail = computed(() => state.clientType === 'public'
  ? {
      icon: 'i-lucide-smartphone',
      title: t('form.clientTypePublicTitle', 'Native or single-page app'),
      description: t('form.clientTypePublicDetail', 'Runs on the user\'s device, so it cannot keep a secret. It signs in with PKCE only and may use custom-scheme redirect URIs such as com.example.app:/callback. The website URL is optional.'),
    }
  : {
      icon: 'i-lucide-server',
      title: t('form.clientTypeConfidentialTitle', 'Server-side app'),
      description: t('form.clientTypeConfidentialDetail', 'Runs on a server that keeps the client secret. You get the secret once, after adding the application.'),
    })

const DAY = 60 * 60 * 24
/** Session length presets (seconds). A value set elsewhere (config, API) is kept as its own item. */
const lifetimeItems = (none: string, current: number) => {
  const items = [
    { label: none, value: 0 },
    { label: t('form.lifetime.day', '1 day'), value: DAY },
    { label: t('form.lifetime.week', '7 days'), value: 7 * DAY },
    { label: t('form.lifetime.month', '30 days'), value: 30 * DAY },
    { label: t('form.lifetime.quarter', '90 days'), value: 90 * DAY },
    { label: t('form.lifetime.halfYear', '6 months'), value: 180 * DAY },
    { label: t('form.lifetime.year', '1 year'), value: 365 * DAY },
  ]
  if (current && !items.some(item => item.value === current)) {
    items.push({ label: t('form.lifetime.days', '{days} days', { days: Math.round(current / DAY) }), value: current })
  }
  return items
}
const idleItems = computed(() => lifetimeItems(t('form.lifetime.default', 'Default'), state.refreshIdleTtl))
const maxAgeItems = computed(() => lifetimeItems(t('form.lifetime.never', 'Default (no limit unless configured)'), state.refreshMaxAge))

/** A browser app (public, web redirect) keeps its refresh token where any script on the page can read it. */
const longBrowserSession = computed(() => isLongBrowserSession(
  { clientType: state.clientType, websiteUrl: state.websiteUrl || null, redirectUris: state.redirectUris },
  state.refreshIdleTtl,
))

// Cross-field rules (they depend on the client type), so they run next to the schema. The server checks them again.
const redirectUriError = computed(() => state.redirectUris.find(uri => !isAllowedRedirect(uri, state.clientType)))
const websiteUrlError = computed(() => {
  if (managed.value || state.websiteUrl) return undefined
  if (state.clientType === 'confidential') return t('form.websiteUrlRequired', 'Enter the website URL.')
  return state.redirectUris.length ? undefined : t('form.websiteUrlOrRedirect', 'Enter a website URL or at least one redirect URI.')
})
const showWebsiteUrlError = ref(false)

async function onSubmit(event: FormSubmitEvent<FormState>) {
  const value = event.data
  showWebsiteUrlError.value = true
  if (redirectUriError.value || websiteUrlError.value) return
  const saved = await run(() => props.save({
    clientType: value.clientType,
    redirectUris: value.redirectUris,
    name: value.name,
    websiteUrl: value.websiteUrl || null,
    loginUrl: value.loginUrl || null,
    previewUrlPattern: value.previewUrlPattern || null,
    description: value.description || null,
    icon: value.icon || null,
    priority: Number(value.priority) || 0,
    allowedRoles: value.allowedRoles,
    tags: value.tags,
    wildcardScopes: value.wildcardScopes,
    isListed: value.isListed,
    refreshIdleTtl: value.refreshIdleTtl || null,
    refreshMaxAge: value.refreshMaxAge || null,
  }))
  if (saved) emit('close', saved)
}
</script>

<template>
  <FormSlideover
    :title="application ? t('form.editTitle', 'Edit application') : t('form.createTitle', 'Add application')"
    :description="application ? t('form.editDescription', 'Change how the application is registered.') : t('form.createDescription', 'Register an application that users can sign in to.')"
    :form-id="formId"
    :submit-label="application ? t('form.save', 'Save application') : t('form.create', 'Add application')"
    :loading="busy"
    @close="emit('close', $event)"
  >
    <UForm
      :id="formId"
      :schema="schema"
      :state="state"
      class="grid gap-4"
      @submit="onSubmit"
    >
      <UAlert
        v-if="managed"
        color="neutral"
        variant="subtle"
        icon="i-lucide-file-cog"
        :title="t('form.managedTitle', 'Managed in nuxt.config')"
        :description="t('form.managedDescription', 'This application is defined in oauthServer.clients. Change its name, website, redirect URIs, roles, tags, listing and session length there; only the login URL and priority can be edited here.')"
      />
      <UFormField
        name="clientType"
        :label="t('form.clientType', 'Client type')"
        :description="t('form.clientTypeHint', 'Cannot be changed later.')"
      >
        <USelect
          v-model="state.clientType"
          :items="clientTypeItems"
          :disabled="!!application"
          class="w-full"
        />
      </UFormField>
      <UAlert
        color="neutral"
        variant="subtle"
        :icon="clientTypeDetail.icon"
        :title="clientTypeDetail.title"
        :description="clientTypeDetail.description"
      />
      <UFormField
        name="name"
        :label="t('form.name', 'Name')"
        required
      >
        <UInput
          v-model="state.name"
          :disabled="managed"
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="websiteUrl"
        :label="t('form.websiteUrl', 'Website URL')"
        :description="state.clientType === 'public'
          ? t('form.websiteUrlHintPublic', 'Optional for native apps. When set, users see it and the callback is the website URL plus the configured callback path.')
          : t('form.websiteUrlHint', 'The origin of the application, without a path. The callback is the website URL plus the configured callback path.')"
        :required="state.clientType === 'confidential'"
        :error="showWebsiteUrlError ? websiteUrlError : undefined"
      >
        <UInput
          v-model="state.websiteUrl"
          :disabled="managed"
          class="w-full"
          placeholder="https://app.example.com"
        />
      </UFormField>
      <UFormField
        name="loginUrl"
        :label="t('form.loginUrl', 'Login URL')"
        :description="t('form.loginUrlHint', 'Where the Open button goes. Defaults to the website URL.')"
      >
        <UInput
          v-model="state.loginUrl"
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="previewUrlPattern"
        :label="t('form.previewUrlPattern', 'Preview URL pattern')"
        :description="t('form.previewUrlPatternHint', 'Optional, e.g. https://*.vercel.app, for preview deployments.')"
      >
        <UInput
          v-model="state.previewUrlPattern"
          :disabled="managed"
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="redirectUris"
        :label="t('form.redirectUris', 'Redirect URIs')"
        :description="t('form.redirectUrisHint', 'Extra exact redirect URIs. Public clients may use custom-scheme URIs such as com.example.app:/callback.')"
        :error="redirectUriError ? t('form.redirectUriInvalid', 'Enter a https URL or, for public clients, a custom-scheme URI.') : undefined"
      >
        <UInputTags
          v-model="state.redirectUris"
          :disabled="managed"
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="allowedRoles"
        :label="t('form.allowedRoles', 'Allowed roles')"
        :description="t('form.allowedRolesHint', 'Leave empty to allow every signed-in user. Inherited roles count.')"
      >
        <UInputTags
          v-model="state.allowedRoles"
          :disabled="managed"
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="wildcardScopes"
        :description="t('form.wildcardScopesHint', 'Lets the application ask for wildcard scopes such as tickets:* or *. Users still only grant what they may do themselves.')"
      >
        <USwitch
          v-model="state.wildcardScopes"
          :disabled="managed"
          :label="t('form.wildcardScopes', 'Allow wildcard scopes')"
        />
      </UFormField>
      <UFormField
        name="tags"
        :label="t('form.tags', 'Tags')"
      >
        <UInputTags
          v-model="state.tags"
          :disabled="managed"
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="description"
        :label="t('form.description', 'Description')"
      >
        <UTextarea
          v-model="state.description"
          :disabled="managed"
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="isListed"
        :description="t('form.isListedHint', 'Turn off for apps users only open themselves, such as a mobile app. Sign-in keeps working.')"
      >
        <USwitch
          v-model="state.isListed"
          :disabled="managed"
          :label="t('form.isListed', 'Show in the users\' application list')"
        />
      </UFormField>
      <UFormField
        name="refreshIdleTtl"
        :label="t('form.sessionLength', 'Session length')"
        :description="t('form.sessionLengthHint', 'How long users stay signed in without opening the application. Every use starts the period again.')"
      >
        <USelect
          v-model="state.refreshIdleTtl"
          :items="idleItems"
          :disabled="managed"
          class="w-full"
        />
      </UFormField>
      <UAlert
        v-if="longBrowserSession"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        :title="t('form.longBrowserSessionTitle', 'Long session for a browser app')"
        :description="t('form.longBrowserSessionDescription', 'This public client signs in on a website, where the refresh token is stored in the browser and any cross-site scripting (XSS) flaw can read it. Keep browser apps at 7 days or less.')"
      />
      <UFormField
        name="refreshMaxAge"
        :label="t('form.signInAgainAfter', 'Sign in again after')"
        :description="t('form.signInAgainAfterHint', 'Optional: users must sign in again this long after they signed in, however often they use the application.')"
      >
        <USelect
          v-model="state.refreshMaxAge"
          :items="maxAgeItems"
          :disabled="managed"
          class="w-full"
        />
      </UFormField>
      <div class="grid grid-cols-2 gap-4">
        <UFormField
          name="icon"
          :label="t('form.icon', 'Icon')"
        >
          <UInput
            v-model="state.icon"
            :disabled="managed"
            class="w-full"
          />
        </UFormField>
        <UFormField
          name="priority"
          :label="t('form.priority', 'Priority')"
        >
          <UInput
            v-model.number="state.priority"
            type="number"
            class="w-full"
          />
        </UFormField>
      </div>
    </UForm>
  </FormSlideover>
</template>
