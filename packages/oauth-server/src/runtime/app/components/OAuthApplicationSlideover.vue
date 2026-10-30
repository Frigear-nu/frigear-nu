<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { AdminApplicationDto, ApplicationInput, ClientType, CreatedApplicationDto } from '../../../types'
import { isNativeRedirectUri, isSecureOrigin } from '../../utils'
import { computed, reactive, useAction, useModuleT } from '#imports'

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

const schema = z.object({
  clientType: z.enum(['confidential', 'public']),
  redirectUris: z.array(z.string()),
  name: z.string().trim().min(1, t('form.nameRequired', 'Enter a name.')),
  websiteUrl: z.url(t('form.websiteUrlInvalid', 'Enter a full URL, for example https://app.example.com.')),
  loginUrl: z.string(),
  previewUrlPattern: z.string(),
  description: z.string(),
  icon: z.string(),
  priority: z.number(),
  allowedRoles: z.array(z.string()),
  tags: z.array(z.string()),
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
})

const formId = 'oauth-application-form'

const clientTypeItems = computed(() => [
  { label: t('form.clientTypeConfidential', 'Confidential (server-side, has a client secret)'), value: 'confidential' },
  { label: t('form.clientTypePublic', 'Public (native or single-page app, no secret)'), value: 'public' },
])

// Cross-field rule (depends on the client type), so it runs next to the schema.
const redirectUriError = computed(() => state.redirectUris.find(uri => !isAllowedRedirect(uri, state.clientType)))

async function onSubmit(event: FormSubmitEvent<FormState>) {
  const value = event.data
  if (redirectUriError.value) return
  const saved = await run(() => props.save({
    clientType: value.clientType,
    redirectUris: value.redirectUris,
    name: value.name,
    websiteUrl: value.websiteUrl,
    loginUrl: value.loginUrl || null,
    previewUrlPattern: value.previewUrlPattern || null,
    description: value.description || null,
    icon: value.icon || null,
    priority: Number(value.priority) || 0,
    allowedRoles: value.allowedRoles,
    tags: value.tags,
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
      <UFormField
        name="clientType"
        :label="t('form.clientType', 'Client type')"
        :description="t('form.clientTypeHint', 'Cannot be changed later. Public clients sign in with PKCE only, so they never get a secret.')"
      >
        <USelect
          v-model="state.clientType"
          :items="clientTypeItems"
          :disabled="!!application"
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="name"
        :label="t('form.name', 'Name')"
        required
      >
        <UInput
          v-model="state.name"
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="websiteUrl"
        :label="t('form.websiteUrl', 'Website URL')"
        :description="t('form.websiteUrlHint', 'The origin of the application, without a path. The callback is the website URL plus the configured callback path.')"
        required
      >
        <UInput
          v-model="state.websiteUrl"
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
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="allowedRoles"
        :label="t('form.allowedRoles', 'Allowed roles')"
        :description="t('form.allowedRolesHint', 'Leave empty to allow every signed-in user.')"
      >
        <UInputTags
          v-model="state.allowedRoles"
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="tags"
        :label="t('form.tags', 'Tags')"
      >
        <UInputTags
          v-model="state.tags"
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="description"
        :label="t('form.description', 'Description')"
      >
        <UTextarea
          v-model="state.description"
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
