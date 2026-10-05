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
  signInUrl: string
}>()
</script>

<template>
  <EmailWrapper>
    <Preview>
      Your secure sign-in link
    </Preview>

    <Container class="max-w-lg mx-auto p-4">
      <Section class="bg-white rounded-lg shadow p-6">
        <EmailHeader />

        <Heading
          level="2"
          class="text-xl font-bold mb-4"
        >
          Your Magic Link
        </Heading>

        <Hr class="border-t border-gray-200 my-4" />

        <Text class="mb-4 text-gray-700">
          You requested a secure sign-in link. Click the button below to sign in to your account.
        </Text>

        <Text class="mb-4 text-gray-700">
          This link will expire shortly and can only be used once.
        </Text>

        <Button
          :href="signInUrl"
          class="bg-blue-600 text-white font-semibold py-2 px-4 rounded mb-4 inline-block"
        >
          Sign in
        </Button>

        <Text class="break-words text-sm text-gray-500 mb-4">
          Or copy this link to your browser: {{ signInUrl }}
        </Text>

        <Hr class="border-t border-gray-200 my-4" />

        <Text class="mb-4 text-gray-700">
          If you didn’t request this email, you can safely ignore it. No action is required.
        </Text>

        <Hr class="border-t border-gray-200 my-4" />

        <Text class="text-xs text-gray-400">
          This email was sent automatically for security reasons.
        </Text>
      </Section>
    </Container>
  </EmailWrapper>
</template>
