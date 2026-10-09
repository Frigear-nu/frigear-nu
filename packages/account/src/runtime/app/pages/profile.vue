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

async function onSubmitEmail() {
  await changeEmailAddress({ email: email.value })
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
          v-if="error"
          class="mt-4"
          color="error"
          :title="error"
        />
      </UPageBody>
    </UPage>
  </UContainer>
</template>
