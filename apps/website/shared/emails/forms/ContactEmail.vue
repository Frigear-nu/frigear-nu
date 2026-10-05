<script setup lang="ts">
import {
  Container,
  Section,
  Heading,
  Text,
  Preview,
  Hr,
} from '@vue-email/components'
import { contactSubjectLabels } from '#shared/schema/forms/contact'
import type { ContactFormSchema } from '#shared/schema/forms/contact'
import EmailHeader from '../components/EmailHeader.vue'
import EmailWrapper from '#shared/emails/components/EmailWrapper.vue'

const props = defineProps<{
  form: ContactFormSchema
}>()

const subjectLabel = contactSubjectLabels[props.form.subject]

const subjectLine
  = props.form.subject === 'other' && props.form.subjectOther?.trim()
    ? `${subjectLabel}: ${props.form.subjectOther.trim()}`
    : subjectLabel
</script>

<template>
  <EmailWrapper>
    <Preview>
      New contact request — {{ subjectLine }}
    </Preview>

    <Container class="max-w-lg mx-auto p-4">
      <Section class="bg-white rounded-lg shadow p-6">
        <EmailHeader />

        <Heading
          level="2"
          class="text-xl font-bold mb-4"
        >
          New Contact Form Submission
        </Heading>

        <Hr class="border-t border-gray-200 my-4" />

        <Text class="text-gray-700 mb-2">
          <strong>Name:</strong> {{ form.name }}
        </Text>

        <Text class="text-gray-700 mb-2">
          <strong>Email:</strong> {{ form.email }}
        </Text>

        <Text
          v-if="form.phone"
          class="text-gray-700 mb-2"
        >
          <strong>Phone:</strong>
          {{ form.phonePrefix }} {{ form.phone }}
        </Text>

        <Text class="text-gray-700 mb-4">
          <strong>Subject:</strong> {{ subjectLine }}
        </Text>

        <Hr class="border-t border-gray-200 my-4" />

        <Text class="text-gray-700 font-semibold mb-2">
          Message
        </Text>

        <Section class="bg-gray-50 border border-gray-200 rounded p-4 mb-4">
          <Text class="whitespace-pre-wrap text-gray-800">
            {{ form.message }}
          </Text>
        </Section>

        <Hr class="border-t border-gray-200 my-4" />

        <Text class="text-xs text-gray-400">
          Replying to this email will respond directly to {{ form.email }}.
        </Text>
      </Section>
    </Container>
  </EmailWrapper>
</template>
