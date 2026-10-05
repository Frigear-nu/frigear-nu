<script setup lang="ts">
defineOptions({ name: 'AccountProfilePage' })

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
        <UPageCard title="Profile">
          <UFormField
            label="Name"
            name="name"
          >
            <UInput v-model="name" />
          </UFormField>
          <UFormField
            label="Avatar URL"
            name="avatar"
          >
            <UInput v-model="avatar" />
          </UFormField>
          <UButton
            class="mt-4"
            :loading="pending"
            label="Save"
            @click="onSubmitProfile"
          />
        </UPageCard>
        <UPageCard
          class="mt-4"
          title="Email address"
        >
          <UFormField
            label="Email"
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
            label="Change email"
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
