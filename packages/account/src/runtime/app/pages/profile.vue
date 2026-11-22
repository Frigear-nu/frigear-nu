<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import AccountChangeEmailSlideover from '../components/Account/AccountChangeEmailSlideover.vue'
import { PROFILE_NO_LOCALE as NO_LOCALE, profileChanges } from '../utils/profile'
import { computed, reactive, ref, useAccount, useAction, useModuleT, useNuxtApp, useOverlay, useRoute, useToast, useUserSession, watch } from '#imports'

defineOptions({ name: 'AccountProfilePage' })

const t = useModuleT('account.profile')
const toast = useToast()
const route = useRoute()
const { user } = useUserSession()
const { updateProfileDetails } = useAccount()
const { $i18n } = useNuxtApp() as unknown as { $i18n?: { locales: { value: Array<string | { code: string, name?: string }> } } }

// The app's languages (`@nuxtjs/i18n`): the only ones the server accepts for `locale`. Without i18n the row is hidden.
const localeItems = computed(() => {
  const locales = ($i18n?.locales.value ?? []).map(locale => typeof locale === 'string' ? { value: locale, label: locale } : { value: locale.code, label: locale.name || locale.code })
  return locales.length ? [{ value: NO_LOCALE, label: t('locale.none', 'Not set') }, ...locales] : []
})

const schema = z.object({
  name: z.string().trim().min(1, t('name.required', 'Please enter your name.')),
  // The server's rule: an http(s) URL of at most 2048 characters (empty clears the avatar).
  avatar: z.union([
    z.literal(''),
    z.url({ protocol: /^https?$/, message: t('avatar.invalid', 'Enter a valid URL.') }).max(2048, t('avatar.invalid', 'Enter a valid URL.')),
  ]).optional(),
  // The server's rule (`phoneField` of `@frigear-nu/users`): digits, spaces and `+-().`; empty clears it.
  phone: z.string().trim().max(40).regex(/^(\+?[\d\s().-]{3,40})?$/, t('phone.invalid', 'Enter a phone number of digits, spaces and + - ( ).')).optional(),
})
type Schema = z.output<typeof schema>

// The session carries the stored user, so the phone number and the language (`users` columns) are read from it like
// the avatar.
const sessionText = (key: 'phone' | 'locale') => {
  const value = (user.value as Record<string, unknown> | null)?.[key]
  return typeof value === 'string' ? value : ''
}
const state = reactive<{ name: string, avatar: string, phone: string, locale: string }>({
  name: user.value?.name ?? '',
  avatar: user.value?.avatar ?? '',
  phone: sessionText('phone'),
  locale: sessionText('locale') || NO_LOCALE,
})

// Only sync from the session when the user has no unsaved edits, so a background refresh never clobbers typing.
const saved = computed(() => ({ name: user.value?.name ?? '', avatar: user.value?.avatar ?? '', phone: sessionText('phone'), locale: sessionText('locale') || NO_LOCALE }))
let lastSynced = { ...saved.value }
watch(saved, (next) => {
  const pristine = state.name === lastSynced.name && state.avatar === lastSynced.avatar && state.phone === lastSynced.phone && state.locale === lastSynced.locale
  lastSynced = { ...next }
  if (pristine) {
    state.name = next.name
    state.avatar = next.avatar
    state.phone = next.phone
    state.locale = next.locale
  }
})
const dirty = computed(() => state.name !== saved.value.name || state.avatar !== saved.value.avatar || state.phone.trim() !== saved.value.phone || state.locale !== saved.value.locale)

const profileAction = useAction()
function onSubmitProfile(event: FormSubmitEvent<Schema>) {
  // The language is only sent when the app offers a choice and the user changed it (`profileChanges`).
  const body = profileChanges({ ...event.data, avatar: event.data.avatar ?? '', phone: event.data.phone ?? '', locale: state.locale }, saved.value, { localeChoice: localeItems.value.length > 0 })
  return profileAction.run(
    () => updateProfileDetails(body),
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
      :title="t('details.title', 'Your details')"
      :description="t('details.description', 'How you appear to others and how we reach you.')"
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
            class="w-full"
          />
        </FormRow>
        <FormRow
          name="avatar"
          :label="t('avatar.label', 'Avatar')"
          :description="t('avatar.description', 'Link to a square image.')"
        >
          <UInput
            v-model="state.avatar"
            type="url"
            placeholder="https://"
            :aria-label="t('avatar.url', 'Avatar URL')"
            class="w-full"
          >
            <template #leading>
              <UAvatar
                :src="state.avatar || undefined"
                :alt="state.name"
                size="3xs"
              />
            </template>
          </UInput>
        </FormRow>
        <FormRow
          name="phone"
          :label="t('phone.label', 'Phone')"
          :description="t('phone.description', 'For text messages. Only staff who need it can see it.')"
        >
          <UInput
            v-model="state.phone"
            type="tel"
            autocomplete="tel"
            class="w-full"
          />
        </FormRow>
        <FormRow
          v-if="localeItems.length"
          name="locale"
          :label="t('locale.label', 'Language')"
          :description="t('locale.description', 'The language we write to you in: emails, texts and notifications.')"
        >
          <USelect
            v-model="state.locale"
            :items="localeItems"
            class="w-full"
          />
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

    <SectionCard
      :title="t('email.label', 'Email')"
      :description="t('email.description', 'Where we send messages and how you sign in.')"
    >
      <FormRow :label="t('email.address', 'Address')">
        <UInput
          :model-value="user?.email ?? ''"
          type="email"
          readonly
          class="w-full"
        />
      </FormRow>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-pencil"
            :label="t('email.change.title', 'Change email')"
            @click="onChangeEmail"
          />
        </div>
      </template>
    </SectionCard>
  </div>
</template>
