<script setup lang="ts">
defineOptions({ name: 'AccountProfilePage' })

const t = useModuleT('account.profile')
const { user } = useUserSession()
const { updateProfileDetails, changeEmailAddress, pending, error } = useAccount()

const name = ref(user.value?.name ?? '')
const avatar = ref(user.value?.avatar ?? undefined)
const email = ref(user.value?.email ?? '')

watch(user, (newUser) => {
  if (!newUser) return
  name.value = newUser.name
  avatar.value = newUser.avatar
  email.value = newUser.email
})

async function onSubmitProfile() {
  await updateProfileDetails({ name: name.value, avatar: avatar.value })
}

// With `verifyEmailChange` the address only changes after the emailed link was followed.
const emailVerificationSent = ref(false)
const route = useRoute()
const emailChanged = computed(() => route.query['email-changed'] === '1')
const emailChangeFailed = computed(() => route.query.error === 'email-change')

async function onSubmitEmail() {
  const result = await changeEmailAddress({ email: email.value })
  emailVerificationSent.value = result.verificationRequired
}
</script>

<template>
  <UContainer>
    <UPage>
      <UPageBody>
        <UPageCard :title="t('title', 'Profile')">
          <UFormField
            :label="t('name.label', 'Name')"
            name="name"
          >
            <UInput v-model="name" />
          </UFormField>
          <UFormField
            :label="t('avatar.url', 'Avatar URL')"
            name="avatar"
          >
            <UInput v-model="avatar" />
          </UFormField>
          <UButton
            class="mt-4"
            :loading="pending"
            :label="t('save', 'Save')"
            @click="onSubmitProfile"
          />
        </UPageCard>
        <UPageCard
          class="mt-4"
          :title="t('email.label', 'Email address')"
        >
          <UFormField
            :label="t('email.label', 'Email')"
            name="email"
          >
            <UInput
              v-model="email"
              type="email"
            />
          </UFormField>
          <UButton
            class="mt-4"
            :loading="pending"
            :label="t('email.change.title', 'Change email')"
            @click="onSubmitEmail"
          />
        </UPageCard>
        <UAlert
          v-if="emailVerificationSent"
          class="mt-4"
          :title="t('email.change.sent.title', 'Check your inbox')"
          :description="t('email.change.sent.description', 'We sent a link to your new address. It takes effect once you confirm it.')"
        />
        <UAlert
          v-if="emailChanged"
          class="mt-4"
          color="success"
          :title="t('email.change.done', 'Your email address was changed.')"
        />
        <UAlert
          v-if="emailChangeFailed"
          class="mt-4"
          color="error"
          :title="t('email.change.failed', 'This confirmation link is invalid or has expired.')"
        />
        <UAlert
          v-if="error"
          class="mt-4"
          color="error"
          :title="error"
        />
      </UPageBody>
    </UPage>
  </UContainer>
</template>
