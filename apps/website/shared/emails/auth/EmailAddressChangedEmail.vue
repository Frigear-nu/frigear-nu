<script setup lang="ts">
import {
  Container,
  Section,
  Heading,
  Text,
  Button,
  Preview,
  Hr,
} from '@vue-email/components'
import EmailHeader from '../components/EmailHeader.vue'
import EmailWrapper from '#shared/emails/components/EmailWrapper.vue'

defineProps<{
  accountSettingsUrl: string
  revertUrl?: string
}>()
</script>

<template>
  <EmailWrapper>
    <Preview>
      Alert: Your email address was changed
    </Preview>

    <Container class="max-w-lg mx-auto p-4">
      <Section class="bg-white rounded-lg shadow p-6">
        <EmailHeader />

        <Heading
          level="2"
          class="text-xl font-bold mb-4 text-red-600"
        >
          Email Address Changed
        </Heading>

        <Hr class="border-t border-gray-200 my-4" />

        <Text class="mb-4 text-gray-700">
          This is a security alert. Your account email address was recently changed.
        </Text>

        <Text class="mb-4 text-gray-700">
          If you made this change, no further action is required.
          You can review your account settings by clicking the button below.
        </Text>
        <Button
          v-if="revertUrl"
          :href="revertUrl"
          class="bg-blue-600 text-white font-semibold py-2 px-4 rounded mb-4 inline-block"
        >
          I DID NOT PERFORM THIS CHANGE
        </Button>
        <Button
          :href="accountSettingsUrl"
          class="bg-red-600 text-white font-semibold py-2 px-4 rounded mb-4 inline-block"
        >
          Review Account Settings
        </Button>

        <Text class="break-words text-sm text-gray-500 mb-4">
          Or copy this link to your browser: {{ accountSettingsUrl }}
        </Text>

        <Hr class="border-t border-gray-200 my-4" />

        <Text class="mb-4 text-gray-700">
          If you did not change your email, we recommend you secure your account immediately by resetting your password.
        </Text>

        <Hr class="border-t border-gray-200 my-4" />

        <Text class="text-xs text-gray-400">
          This email was sent automatically for security reasons. Do not reply to this email.
        </Text>
      </Section>
    </Container>
  </EmailWrapper>
</template>
