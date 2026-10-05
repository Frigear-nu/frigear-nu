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

const props = withDefaults(defineProps<{
  mode?: 'verify' | 'verify-change'
  url: string
}>(), {
  mode: 'verify',
})

const isVerify = props.mode === 'verify'
</script>

<template>
  <EmailWrapper>
    <Preview>
      {{ isVerify ? 'Verify your email address' : 'Confirm your new email address' }}
    </Preview>

    <Container class="max-w-lg mx-auto p-4">
      <Section class="bg-white rounded-lg shadow p-6">
        <EmailHeader />

        <Heading
          level="2"
          class="text-xl font-bold mb-4"
        >
          {{ isVerify ? 'Verify your email address' : 'Confirm your new email address' }}
        </Heading>

        <Hr class="border-t border-gray-200 my-4" />

        <Text class="mb-4 text-gray-700">
          <template v-if="isVerify">
            Please confirm your email address by clicking the button below.
          </template>
          <template v-else>
            You requested to change the email address associated with your account.
          </template>
        </Text>

        <Text class="mb-4 text-gray-700">
          <template v-if="isVerify">
            This helps us ensure your account security.
          </template>
          <template v-else>
            Please confirm the new email address to complete the change.
          </template>
        </Text>

        <Button
          :href="url"
          class="bg-blue-600 text-white font-semibold py-2 px-4 rounded mb-4 inline-block"
        >
          {{ isVerify ? 'Verify email' : 'Confirm email change' }}
        </Button>

        <Text class="break-words text-sm text-gray-500 mb-4">
          Or copy this link to your browser: {{ url }}
        </Text>

        <Hr class="border-t border-gray-200 my-4" />

        <Text class="mb-4 text-gray-700">
          <template v-if="isVerify">
            If you didn’t create an account or request this verification, you can safely ignore this email.
          </template>
          <template v-else>
            If you didn’t request this change, your account may be at risk. We recommend reviewing your security settings.
          </template>
        </Text>

        <Hr class="border-t border-gray-200 my-4" />

        <Text class="text-xs text-gray-400">
          This email was sent automatically for security reasons.
        </Text>
      </Section>
    </Container>
  </EmailWrapper>
</template>
