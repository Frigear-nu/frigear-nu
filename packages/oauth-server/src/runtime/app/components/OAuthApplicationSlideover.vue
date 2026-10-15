<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { AdminApplicationDto, ApplicationInput, CreatedApplicationDto } from '../../../types'

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

const schema = z.object({
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

async function onSubmit(event: FormSubmitEvent<FormState>) {
  const value = event.data
  const saved = await run(() => props.save({
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
