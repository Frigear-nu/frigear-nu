<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

defineOptions({ name: 'AccountProfilePage' })

const t = useModuleT('account.profile')
const toast = useToast()
const route = useRoute()
const { user } = useUserSession()
const { updateProfileDetails, updateColorMode, changeEmailAddress, error } = useAccount()

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

const saving = ref(false)
async function onSubmitProfile(event: FormSubmitEvent<Schema>) {
  saving.value = true
  try {
    await updateProfileDetails({ name: event.data.name, avatar: event.data.avatar || undefined })
    toast.add({ title: t('saved', 'Profile updated'), color: 'success' })
  }
  catch (e) {
    toast.add({ title: (e as { statusMessage?: string }).statusMessage ?? t('saveFailed', 'Could not update your profile.'), color: 'error' })
  }
  finally {
    saving.value = false
  }
}

// The stored preference is forwarded to OAuth applications; locally it drives the Nuxt UI color mode.
type ColorModePreference = 'light' | 'dark' | 'system'
const colorMode = useColorMode()
const colorModeItems = computed(() => [
  { value: 'light', label: t('colorMode.light', 'Light'), icon: 'i-lucide-sun' },
  { value: 'dark', label: t('colorMode.dark', 'Dark'), icon: 'i-lucide-moon' },
  { value: 'system', label: t('colorMode.system', 'System'), icon: 'i-lucide-monitor' },
])
const savedColorMode = computed(() => (user.value as { colorMode?: string | null } | null)?.colorMode ?? null)
const colorModePending = ref(false)

async function onChangeColorMode(next: ColorModePreference) {
  const previous = colorMode.preference
  colorMode.preference = next
  colorModePending.value = true
  try {
    await updateColorMode({ colorMode: next })
  }
  catch (e) {
    colorMode.preference = previous
    toast.add({ title: (e as { statusMessage?: string }).statusMessage ?? t('colorMode.failed', 'Could not update your color mode.'), color: 'error' })
  }
  finally {
    colorModePending.value = false
  }
}

onMounted(() => {
  if (savedColorMode.value) colorMode.preference = savedColorMode.value
})

// With `verifyEmailChange` the address only changes after the emailed link was followed.
const emailModalOpen = ref(false)
const newEmail = ref('')
const emailPending = ref(false)
const emailVerificationSent = ref(false)
const emailChanged = computed(() => route.query['email-changed'] === '1')
const emailChangeFailed = computed(() => route.query.error === 'email-change')
const emailSchema = z.object({ email: z.email(t('email.invalid', 'Enter a valid email address.')) })

async function onSubmitEmail() {
  emailPending.value = true
  try {
    const result = await changeEmailAddress({ email: newEmail.value })
    emailVerificationSent.value = result.verificationRequired
    emailModalOpen.value = false
    newEmail.value = ''
    toast.add({ title: result.verificationRequired ? t('email.change.sent.title', 'Check your inbox') : t('email.change.done', 'Your email address was changed.'), color: 'success' })
  }
  catch (e) {
    toast.add({ title: (e as { statusMessage?: string }).statusMessage ?? t('email.change.error', 'Could not change your email address.'), color: 'error' })
  }
  finally {
    emailPending.value = false
  }
}
</script>

<template>
  <UContainer>
    <UPage>
      <UPageBody>
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

        <UForm
          id="profile"
          :schema="schema"
          :state="state"
          @submit="onSubmitProfile"
        >
          <UPageCard
            variant="subtle"
            :title="t('title', 'Profile')"
            :description="t('description', 'Change your information.')"
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
            <USeparator />
            <div class="flex justify-end">
              <UButton
                type="submit"
                :loading="saving"
                :disabled="!dirty"
                :label="t('save', 'Save profile')"
              />
            </div>
          </UPageCard>
        </UForm>

        <UPageCard
          variant="subtle"
          :title="t('email.label', 'Email')"
          :description="t('email.description', 'Your email address.')"
        >
          <div class="flex items-center justify-between gap-4 max-sm:flex-col max-sm:items-start">
            <UInput
              :model-value="user?.email ?? ''"
              type="email"
              readonly
              disabled
              class="w-full sm:max-w-xs"
              :aria-label="t('email.label', 'Email')"
            />
            <UButton
              variant="subtle"
              trailing-icon="i-lucide-pencil"
              :label="t('email.change.title', 'Change email')"
              @click="emailModalOpen = true"
            />
          </div>
        </UPageCard>

        <UPageCard
          variant="subtle"
          :title="t('colorMode.title', 'Appearance')"
          :description="t('colorMode.description', 'Your preferred color mode. It is also shared with the apps you sign in to.')"
        >
          <USelect
            :model-value="savedColorMode ?? colorMode.preference"
            :items="colorModeItems"
            :loading="colorModePending"
            class="w-full sm:max-w-xs"
            :aria-label="t('colorMode.title', 'Appearance')"
            @update:model-value="onChangeColorMode($event as ColorModePreference)"
          />
        </UPageCard>

        <UAlert
          v-if="error"
          color="error"
          variant="subtle"
          :title="error"
        />

        <UModal
          v-model:open="emailModalOpen"
          :title="t('email.change.title', 'Change email')"
        >
          <template #body>
            <UForm
              id="change-email"
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
                form="change-email"
                :loading="emailPending"
                :label="t('email.change.title', 'Change email')"
              />
            </div>
          </template>
        </UModal>
      </UPageBody>
    </UPage>
  </UContainer>
</template>
