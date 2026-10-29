<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import AccountChangeEmailSlideover from '../components/Account/AccountChangeEmailSlideover.vue'

defineOptions({ name: 'AccountProfilePage' })

const t = useModuleT('account.profile')
const toast = useToast()
const route = useRoute()
const { user } = useUserSession()
const { updateProfileDetails } = useAccount()

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
const emailVerificationSent = ref(false)
const emailChanged = computed(() => route.query['email-changed'] === '1')
const emailChangeFailed = computed(() => route.query.error === 'email-change')

const overlay = useOverlay()
const emailSlideover = overlay.create(AccountChangeEmailSlideover, { destroyOnClose: true })

async function onChangeEmail() {
  const result = await emailSlideover.open({ email: user.value?.email ?? undefined })
  if (!result) return
  emailVerificationSent.value = result.verificationRequired
  toast.add({
    title: result.verificationRequired ? t('email.change.sent.title', 'Check your inbox') : t('email.change.done', 'Your email address was changed.'),
    description: result.verificationRequired ? undefined : user.value?.email ?? undefined,
    color: 'success',
    icon: 'i-lucide-check',
  })
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <AccountHeader />

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
      :title="t('details.title', 'Name and avatar')"
      :description="t('details.description', 'How you appear to others.')"
    >
      <UForm
        id="account-profile"
        :schema="schema"
        :state="state"
        class="flex flex-col divide-y divide-default"
        @submit="onSubmitProfile"
      >
        <FormRow
          name="name"
          :label="t('name.label', 'Name')"
          :description="t('name.description', 'Your full name.')"
          required
        >
          <UInput
            v-model="state.name"
            autocomplete="name"
            class="w-full sm:max-w-sm"
          />
        </FormRow>
        <FormRow
          name="avatar"
          :label="t('avatar.label', 'Avatar')"
          :description="t('avatar.description', 'Link to a square image.')"
        >
          <div class="flex items-center gap-3 sm:max-w-sm">
            <UAvatar
              :src="state.avatar || undefined"
              :alt="state.name"
              size="lg"
            />
            <UInput
              v-model="state.avatar"
              type="url"
              placeholder="https://"
              :aria-label="t('avatar.url', 'Avatar URL')"
              class="min-w-0 flex-1"
            />
          </div>
        </FormRow>
      </UForm>
      <template #footer>
        <div class="flex justify-end gap-2">
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

    <SectionCard :title="t('email.label', 'Email')">
      <FormRow
        :label="t('email.address', 'Address')"
        :description="t('email.description', 'Where we send messages and how you sign in.')"
      >
        <div class="flex flex-wrap items-center gap-2 sm:max-w-lg">
          <UInput
            :model-value="user?.email ?? ''"
            type="email"
            readonly
            disabled
            class="min-w-48 flex-1"
          />
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-pencil"
            :label="t('email.change.title', 'Change email')"
            @click="onChangeEmail"
          />
        </div>
      </FormRow>
    </SectionCard>
  </div>
</template>
