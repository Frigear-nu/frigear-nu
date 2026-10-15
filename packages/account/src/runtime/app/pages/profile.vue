<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

defineOptions({ name: 'AccountProfilePage' })

const t = useModuleT('account.profile')
const toast = useToast()
const route = useRoute()
const { user } = useUserSession()
const { updateProfileDetails, changeEmailAddress } = useAccount()

const schema = z.object({
  name: z.string().trim().min(1, t('name.required', 'Please enter your name.')),
  avatar: z.union([z.literal(''), z.url(t('avatar.invalid', 'Enter a valid URL.'))]).optional(),
})
type Schema = z.output<typeof schema>

const state = reactive<{ name: string, avatar: string }>({
  name: user.value?.name ?? '',
  avatar: user.value?.avatar ?? '',
})

// Only sync from the session when the user has no unsaved edits, so a background refresh never clobbers typing.
const saved = computed(() => ({ name: user.value?.name ?? '', avatar: user.value?.avatar ?? '' }))
let lastSynced = { ...saved.value }
watch(saved, (next) => {
  const pristine = state.name === lastSynced.name && state.avatar === lastSynced.avatar
  lastSynced = { ...next }
  if (pristine) {
    state.name = next.name
    state.avatar = next.avatar
  }
})
const dirty = computed(() => state.name !== saved.value.name || state.avatar !== saved.value.avatar)

const profileAction = useAction()
function onSubmitProfile(event: FormSubmitEvent<Schema>) {
  return profileAction.run(
    () => updateProfileDetails({ name: event.data.name, avatar: event.data.avatar || undefined }),
    { success: t('saved', 'Profile updated'), error: t('saveFailed', 'Could not update your profile.') },
  )
}

// With `verifyEmailChange` the address only changes after the emailed link was followed.
const emailModalOpen = ref(false)
const newEmail = ref('')
const emailVerificationSent = ref(false)
const emailChanged = computed(() => route.query['email-changed'] === '1')
const emailChangeFailed = computed(() => route.query.error === 'email-change')
const emailSchema = z.object({ email: z.email(t('email.invalid', 'Enter a valid email address.')) })

const emailAction = useAction()
async function onSubmitEmail() {
  const result = await emailAction.run(
    () => changeEmailAddress({ email: newEmail.value }),
    { error: t('email.change.error', 'Could not change your email address.') },
  )
  if (!result) return
  emailVerificationSent.value = result.verificationRequired === true
  emailModalOpen.value = false
  newEmail.value = ''
  toast.add({ title: result.verificationRequired ? t('email.change.sent.title', 'Check your inbox') : t('email.change.done', 'Your email address was changed.'), color: 'success' })
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <UAlert
      v-if="emailChanged"
      color="success"
      variant="subtle"
      :title="t('email.change.done', 'Your email address was changed.')"
    />
    <UAlert
      v-if="emailChangeFailed"
      color="error"
      variant="subtle"
      :title="t('email.change.failed', 'This confirmation link is invalid or has expired.')"
    />
    <UAlert
      v-if="emailVerificationSent"
      variant="subtle"
      :title="t('email.change.sent.title', 'Check your inbox')"
      :description="t('email.change.sent.description', 'We sent a link to your new address. It takes effect once you confirm it.')"
    />

    <SectionCard
      :title="t('title', 'Profile')"
      :description="t('description', 'Change your information.')"
    >
      <UForm
        id="account-profile"
        :schema="schema"
        :state="state"
        class="flex flex-col gap-4"
        @submit="onSubmitProfile"
      >
        <UFormField
          name="name"
          :label="t('name.label', 'Name')"
          :description="t('name.description', 'Your full name.')"
          required
          class="flex items-start justify-between gap-4 max-sm:flex-col"
        >
          <UInput
            v-model="state.name"
            autocomplete="name"
          />
        </UFormField>
        <USeparator />
        <UFormField
          name="avatar"
          :label="t('avatar.label', 'Avatar')"
          :description="t('avatar.description', 'Link to a square image.')"
          class="flex items-start justify-between gap-4 max-sm:flex-col"
        >
          <div class="flex items-center gap-3">
            <UAvatar
              :src="state.avatar || undefined"
              :alt="state.name"
              size="xl"
            />
            <UInput
              v-model="state.avatar"
              type="url"
              placeholder="https://"
              :aria-label="t('avatar.url', 'Avatar URL')"
            />
          </div>
        </UFormField>
      </UForm>
      <template #footer>
        <div class="flex justify-end">
          <UButton
            type="submit"
            form="account-profile"
            :loading="profileAction.busy.value"
            :disabled="!dirty"
            :label="t('save', 'Save profile')"
          />
        </div>
      </template>
    </SectionCard>

    <SectionCard
      :title="t('email.label', 'Email')"
      :description="t('email.description', 'Your email address.')"
    >
      <template #actions>
        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-pencil"
          :label="t('email.change.title', 'Change email')"
          @click="emailModalOpen = true"
        />
      </template>
      <UInput
        :model-value="user?.email ?? ''"
        type="email"
        readonly
        disabled
        class="w-full sm:max-w-xs"
        :aria-label="t('email.label', 'Email')"
      />
    </SectionCard>

    <UModal
      v-model:open="emailModalOpen"
      :title="t('email.change.title', 'Change email')"
    >
      <template #body>
        <UForm
          id="account-change-email"
          :schema="emailSchema"
          :state="{ email: newEmail }"
          class="flex flex-col gap-4"
          @submit="onSubmitEmail"
        >
          <UFormField
            name="email"
            :label="t('email.change.label', 'New e-mail')"
            required
          >
            <UInput
              v-model="newEmail"
              type="email"
              autocomplete="email"
              class="w-full"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            color="neutral"
            variant="outline"
            :label="t('cancel', 'Cancel')"
            @click="emailModalOpen = false"
          />
          <UButton
            type="submit"
            form="account-change-email"
            :loading="emailAction.busy.value"
            :label="t('email.change.title', 'Change email')"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
