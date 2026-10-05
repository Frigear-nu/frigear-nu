<script setup lang="ts">
import {
  Container,
  Section,
  Heading,
  Text,
  Button,
  Preview,
  Hr,
  Link,
} from '@vue-email/components'
import EmailHeader from '../components/EmailHeader.vue'
import EmailWrapper from '#shared/emails/components/EmailWrapper.vue'

withDefaults(defineProps<{
  name?: string
  verifyUrl?: string
  magicLinkUrl?: string
  requireEmailVerification?: boolean
  gdprUrl?: string
}>(), {
  requireEmailVerification: false,
})
</script>

<template>
  <EmailWrapper>
    <Preview>
      {{ name ? `Welcome to Frigear, ${name}!` : 'Welcome to Frigear!' }}
    </Preview>

    <Container class="max-w-lg mx-auto p-4">
      <Section class="bg-white rounded-lg shadow p-6">
        <EmailHeader />

        <Heading
          level="2"
          class="text-xl font-bold mb-4"
        >
          {{ name ? `Welcome to Frigear, ${name}!` : 'Welcome to Frigear!' }}
        </Heading>

        <Hr class="border-t border-gray-200 my-4" />

        <Text class="mb-4 text-gray-700">
          Your account has been created.
        </Text>

        <template v-if="requireEmailVerification && verifyUrl">
          <Text class="mb-4 text-gray-700">
            You need to verify your email address before you can log in. Click the button below to verify your email
            address.
          </Text>

          <Button
            :href="verifyUrl"
            class="bg-blue-600 text-white font-semibold py-2 px-4 rounded mb-4 inline-block"
          >
            Verify Email Address
          </Button>

          <Text class="break-words text-sm text-gray-500 mb-4">
            Or copy this link to your browser: {{ verifyUrl }}
          </Text>
        </template>

        <template v-if="requireEmailVerification && magicLinkUrl">
          <Text class="mb-4 text-gray-700">
            Since you signed up with magic link, you will have to sign in with one too :)
          </Text>

          <Button
            :href="magicLinkUrl"
            class="bg-blue-600 text-white font-semibold py-2 px-4 rounded mb-4 inline-block"
          >
            Sign in
          </Button>

          <Text class="break-words text-sm text-gray-500 mb-4">
            Or copy this link to your browser: {{ magicLinkUrl }}
          </Text>
        </template>

        <Hr class="border-t border-gray-200 my-4" />

        <Text class="mb-4 text-gray-700">
          If you didn’t request this email, you can safely ignore it. No action is required - the account will be
          deleted in accordance with our <component
            :is="gdprUrl ? Link : 'span'"
            :href="gdprUrl"
          >
            GDPR policy
          </component>.
        </Text>

        <Hr class="border-t border-gray-200 my-4" />

        <Text class="text-xs text-gray-400">
          This email was sent automatically for security reasons.
        </Text>
      </Section>
    </Container>
  </EmailWrapper>
</template>
