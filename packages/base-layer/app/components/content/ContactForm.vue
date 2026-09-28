<script lang="ts" setup>
import type { FormSubmitEvent } from '@nuxt/ui'
import {
  contactFormSchema, contactFormSubjectOptions,
  contactFormSubjectSelectItems,
  type ContactSchema,
} from '../../../shared/schema/forms'

const DEFAULT_STATE: Partial<ContactSchema> = {
  name: undefined,
  email: undefined,
  phone: undefined,
  subject: undefined,
  subjectOther: undefined,
  message: undefined,
}

const form = useTemplateRef('form')
const isSubmitting = ref(false)
const state = reactive({ ...DEFAULT_STATE })

const toast = useToast()

async function onSubmit(event: FormSubmitEvent<ContactSchema>) {
  isSubmitting.value = true
  try {
    await $fetch(['', 'api', '_submit'].join('/'), {
      method: 'POST',
      body: event.data,
    })

    toast.add({
      icon: 'lucide-check-circle',
      title: 'Beskjed sendt!',
      description: 'Vi tar kontak med deg så snart som mulig.',
      color: 'success',
    })

    Object.assign(state, DEFAULT_STATE)
  } catch (err: unknown) {
    toast.add({
      icon: 'lucide-alert-circle',
      title: 'Noe gikk galt',
      description: (err as Error)?.message || 'Ukjent feil.',
      color: 'error',
    })

    // Since we might encounter unknown things we want to know about...
    throw err
  } finally {
    isSubmitting.value = false
  }
}

// we want to pre-fill the form for the subject if it matches an available one
const route = useRoute()
const router = useRouter()
if (import.meta.client) {
  watch(() => route.query, (nextParams) => {
    if (!nextParams || !nextParams.subject) return
    if (!contactFormSubjectOptions[nextParams.subject as keyof typeof contactFormSubjectOptions]) return

    nextTick(() => {
      state.subject = nextParams.subject as keyof typeof contactFormSubjectOptions
      router.replace({ query: {} })
    })
  }, { immediate: true })
}
</script>

<template>
  <div class="flex flex-row mt-8 items-center justify-center">
    <UPageCard
      title="Send oss en beskjed"
      class="space-y-4 min-w-sm"
    >
      <UForm
        ref="form"
        :schema="contactFormSchema"
        :state="state"
        class="space-y-4 min-w-fit"
        :loading-auto="true"
        @submit="onSubmit"
      >
        <UFormField
          label="Navn"
          name="name"
          required
        >
          <UInput
            v-model="state.name"
            class="w-full"
          />
        </UFormField>

        <UFormField
          label="E-post"
          name="email"
          required
        >
          <UInput
            v-model="state.email"
            class="w-full"
          />
        </UFormField>

        <UFormField
          label="Telefon"
          name="phone"
        >
          <UInput
            v-model="state.phone"
            class="w-full"
          />
        </UFormField>

        <UFormField
          label="Tjeneste/Emne"
          name="subject"
          required
        >
          <USelect
            v-model="state.subject"
            placeholder="Velg tjeneste/emne"
            class="w-full"
            :items="contactFormSubjectSelectItems"
          />
        </UFormField>

        <UFormField
          v-if="state.subject === 'other'"
          label="Annet"
          name="subjectOther"
        >
          <UInput
            v-model="state.subjectOther"
            class="w-full"
          />
        </UFormField>

        <UFormField
          label="Beskjed"
          name="message"
          required
        >
          <UTextarea
            v-model="state.message"
            class="w-full"
          />
        </UFormField>

        <UButton
          type="submit"
          loading-auto
        >
          Send beskjed
        </UButton>
      </UForm>
    </UPageCard>
  </div>
</template>
