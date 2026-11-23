<script setup lang="ts">
import { usersApi } from '../../utils/api'
import { USER_PHONE_MAX_LENGTH, USER_PHONE_PATTERN } from '../../utils/phone'
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { UserCreateResult, UserRow } from '../utils/admin-user'
import type { UserPickerOption } from '../../../types'
import { $fetch, reactive, ref, useErrorToast, useModuleT, useNuxtApp, useToast } from '#imports'

defineOptions({ name: 'UsersUserCreateSlideover' })

// The "Add user" form, opened by `useUserActions().create()` and by `UserPicker`'s "Create user": closes with the
// created user, or `false` when cancelled. With `offerExisting` (the picker), a taken email offers that user instead.
// Roles are given afterwards, on the user's "Roles and permissions" tab (`@frigear-nu/authorization`).
const props = withDefaults(defineProps<{
  /** Prefills the form (the picker's search term, or what a host knows of the person). */
  initial?: { name?: string, email?: string, phone?: string }
  /** Show "Mark the email address as verified" (`users:manage`). The admin list does, the picker does not. */
  verify?: boolean
  /** On a taken email, offer to select the user who has it (`{ existing }`). */
  offerExisting?: boolean
}>(), { verify: true, offerExisting: false })
const emit = defineEmits<{ close: [result: UserCreateResult] }>()

const t = useModuleT('users')
const toast = useToast()
const showError = useErrorToast()
const busy = ref(false)
// The creating staff member's language becomes the new user's (unset without i18n).
const locale = (useNuxtApp().$i18n as { locale?: { value?: string } } | undefined)?.locale?.value || undefined

const schema = z.object({
  name: z.string().trim().min(1, t('admin.nameRequired', 'Enter a name.')).max(120),
  email: z.string().trim().email(t('admin.emailInvalid', 'Enter a valid email address.')),
  phone: z.string().trim().max(USER_PHONE_MAX_LENGTH).regex(USER_PHONE_PATTERN, t('admin.phoneInvalid', 'Enter a phone number of digits, spaces and + - ( ).')).or(z.literal('')),
  emailVerified: z.boolean(),
  sendWelcomeEmail: z.boolean(),
})
type Schema = z.output<typeof schema>

const state = reactive<Schema>({ name: props.initial?.name ?? '', email: props.initial?.email ?? '', phone: props.initial?.phone ?? '', emailVerified: false, sendWelcomeEmail: true })
// The user who already has the typed email (a 409), offered instead of a new one.
const existing = ref<UserPickerOption | null>(null)

type ConflictError = { statusCode?: number, data?: { data?: { field?: string, userId?: number } } }

async function save(event: FormSubmitEvent<Schema>) {
  existing.value = null
  busy.value = true
  try {
    const { phone, emailVerified, ...rest } = event.data
    const created = await $fetch<UserRow>(usersApi.admin.users, {
      method: 'POST',
      body: { ...rest, ...(phone ? { phone } : {}), ...(props.verify ? { emailVerified } : {}), ...(locale ? { locale } : {}) },
    })
    toast.add({ title: t('admin.createdNamed', 'Created {name}', { name: created.name }), color: 'success', icon: 'i-lucide-check' })
    emit('close', created)
  }
  catch (e) {
    const conflict = (e as ConflictError).statusCode === 409 ? (e as ConflictError).data?.data : undefined
    if (props.offerExisting && conflict?.field === 'email' && typeof conflict.userId === 'number') {
      existing.value = { id: conflict.userId, name: null, email: event.data.email.trim().toLowerCase(), avatar: null }
    }
    else {
      showError(e, t('admin.createFailed', 'The user could not be created'))
    }
  }
  finally {
    busy.value = false
  }
}

const chooseExisting = () => {
  if (existing.value) emit('close', { existing: existing.value })
}
</script>

<template>
  <FormSlideover
    form-id="user-create-form"
    :title="t('admin.create', 'Add user')"
    :description="t('admin.createHint', 'They can sign in with the link we email them.')"
    :submit-label="t('admin.createSubmit', 'Add user')"
    :loading="busy"
    @close="emit('close', false)"
  >
    <UForm
      id="user-create-form"
      :schema="schema"
      :state="state"
      class="flex flex-col gap-4"
      @submit="save"
    >
      <UAlert
        v-if="existing"
        color="warning"
        variant="subtle"
        icon="i-lucide-user-check"
        :title="t('admin.emailTaken', 'This email already has an account')"
        :description="t('admin.emailTakenHint', '{email} belongs to an existing user. Select that user instead of creating a new one.', { email: existing.email ?? '' })"
        :actions="[{ label: t('admin.selectExisting', 'Select existing user'), color: 'warning', variant: 'solid', onClick: chooseExisting }]"
        data-existing-user
      />
      <UFormField
        name="name"
        :label="t('admin.name', 'Name')"
        required
      >
        <UInput
          v-model="state.name"
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="email"
        :label="t('admin.email', 'Email')"
        required
      >
        <UInput
          v-model="state.email"
          type="email"
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="phone"
        :label="t('admin.phone', 'Phone')"
        :description="t('admin.createPhoneHelp', 'Optional. Used for text messages.')"
      >
        <UInput
          v-model="state.phone"
          type="tel"
          autocomplete="off"
          class="w-full"
        />
      </UFormField>
      <UCheckbox
        v-if="verify"
        v-model="state.emailVerified"
        :label="t('admin.emailVerified', 'Mark the email address as verified')"
      />
      <UCheckbox
        v-model="state.sendWelcomeEmail"
        :label="t('admin.sendInvite', 'Send invite email')"
        :description="t('admin.sendInviteHelp', 'A single-use link to sign in and verify the address, valid for several days.')"
      />
    </UForm>
  </FormSlideover>
</template>
