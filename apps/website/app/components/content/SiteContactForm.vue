<script setup lang='ts'>
import type { FormSubmitEvent, FormErrorEvent } from '@nuxt/ui'
import type { LocationQueryRaw } from 'vue-router'
import { formsApi } from '@frigear-nu/forms/utils'

import {
  contactFormSchema,
  contactSubjectKeys,
  type ContactFormSchema,
  type ContactSubjectKey,
} from '#shared/schema/forms/contact'

const $emits = defineEmits<{
  (e: 'success'): void
}>()

const props = withDefaults(defineProps<{
  mode?: 'slim'
  initial?: ContactFormSchema
}>(), {
  mode: undefined,
})

const isSubmitting = ref(false)
const toast = useToast()
const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()

type PhonePrefixItem = { label: string, value: string }
const phonePrefixes = ref<PhonePrefixItem[]>([
  { label: '+45', value: '+45' },
  { label: '+46', value: '+46' },
  { label: `+47`, value: '+47' },
])

const contactSubjectSelectItems = computed(() => {
  return contactSubjectKeys.map(value => ({
    value,
    label: t(`contact.form.subject.items.${value}`),
  }))
})

const defaultMessagePlaceholderKey = 'contact.form.message.placeholder'

const messagePlaceholder = computed(() => {
  if (!state.subject) {
    return t(defaultMessagePlaceholderKey)
  }

  // attempt getting the custom placeholder for a subject
  const key = `contact.form.message.placeholders.${state.subject}`
  const translated = t(key)

  return translated !== key
    ? translated
    : t(defaultMessagePlaceholderKey)
})

const DEFAULT_STATE: Partial<ContactFormSchema> = {
  name: undefined,
  email: undefined,
  phone: undefined,
  phonePrefix: '+45',
  subject: undefined,
  subjectOther: undefined,
  message: undefined,
}

const state = reactive<typeof DEFAULT_STATE>({ ...DEFAULT_STATE })

watch(() => props.initial, (initial) => {
  if (!initial) return
  Object.assign(state, initial)
}, { immediate: true })

async function onSubmit(event: FormSubmitEvent<ContactFormSchema>) {
  isSubmitting.value = true
  try {
    // Delivered by the `contact` form of @frigear-nu/forms (seeded in forms/contact.ts).
    const { phone, phonePrefix, subjectOther, ...rest } = event.data
    await $fetch(formsApi.submit('contact'), {
      method: 'POST',
      body: {
        locale: locale.value,
        answers: {
          ...rest,
          phone: phone ? `${phonePrefix ?? '+45'} ${phone}` : undefined,
          subjectOther: rest.subject === 'other' ? subjectOther : undefined,
        },
      },
    })

    toast.add({
      icon: 'lucide-check-circle',
      title: 'Whooop!, -Besked fyret afsted!',
      description: 'Vi vender tilbage så snart en frivillig har set den.',
      color: 'success',
    })

    Object.assign(state, DEFAULT_STATE, props.initial)
    $emits('success')
  } catch (err: unknown) {
    let description = 'Ukendt fejl. Prøv lige igen senere.'
    if (typeof err === 'object' && err !== null) {
      // A rejected submission answers 400 with the validation issues in `data.issues`.
      const e = err as { data?: { message?: string, data?: { issues?: { message?: string }[] } }, message?: string }
      const issues = (e.data?.data?.issues ?? []).map(issue => issue.message).filter(Boolean)
      description = issues.length ? issues.join(' ') : e.data?.message ?? e.message ?? description
    }
    toast.add({
      icon: 'lucide-alert-circle',
      title: 'Noget gik galt, -Beskeden blev ikke sendt.',
      description,
      color: 'error',
    })
    throw err
  } finally {
    isSubmitting.value = false
  }
}

function isSubjectKey(v: unknown): v is ContactSubjectKey {
  return typeof v === 'string' && (contactSubjectKeys as readonly string[]).includes(v)
}

watch(
  () => route.query.subject,
  (subject) => {
    if (!isSubjectKey(subject)) return

    state.subject = subject

    const q: LocationQueryRaw = { ...route.query }
    delete q.subject
    router.replace({ query: q })
  },
  { immediate: true },
)

// Help users with autofill to strip the Country Code.
// todo: for the future we might want to implement a proper phone input component like here:
//   https://github.com/roiLeo/nuxtUI-PhoneNumberInput/blob/main/app/components/PhoneNumberInput.vue
watch(() => state.phone, (phone) => {
  if (!phone) return
  // FIXME: This feature only works for scandinavian numbers!
  const selected = phonePrefixes.value.find((p) => {
    // first, attempt to extract with +12
    if (phone.startsWith('+') && phone.startsWith(p.label)) {
      const inferredPlus = phone.substring(0, 3).trim()
      if (inferredPlus === p.label) {
        return true
      }
    } else if (phone.startsWith('00') && phone.length === 12) {
      // secondly, attempt to extract with 0012
      const plusInsteadOfZero = phone.substring(0, 4).replace('00', '+')
      if (p.label === plusInsteadOfZero) {
        return true
      }
    }

    // lastly, attempt by the already selected item.
    return p && p.value === state.phonePrefix && phone.startsWith(p.label)
  })

  if (!selected) return

  // prefill countryCode if different from set.
  if (selected.value !== state.phonePrefix) {
    state.phonePrefix = selected.value
  }

  const isPlusPrefix = phone.startsWith(selected.label)
  const isZeroPrefix = phone.startsWith('00')

  if (!isPlusPrefix && !isZeroPrefix) return

  // [ +45 | 0045 ]-12345678 = 11-12 chars
  if (phone.length <= 10) return

  if (isPlusPrefix) {
    state.phone = phone.replace(selected.label, '')
  } else if (isZeroPrefix && phone.length === 12) {
    state.phone = phone.substring(4)
  }
})

function onError(event: FormErrorEvent) {
  const [error] = event.errors
  if (!error || !error.id) return
  const el = document.getElementById(error.id)
  el?.focus()
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}
</script>

<template>
  <UPageCard
    class="w-full"
    :variant="mode === 'slim' ? 'naked' : undefined"
  >
    <template
      v-if="!mode"
      #title
    >
      {{ $t('contact.title') }}
    </template>
    <UForm
      :schema="contactFormSchema"
      :state="state"
      class="flex flex-col gap-2"
      :loading-auto="true"
      @submit="onSubmit"
      @error="onError"
    >
      <UFormField
        :label="t('contact.form.name.label')"
        name="name"
        autocomplete="name"
      >
        <UInput
          v-model="state.name"
          class="w-full"
          :placeholder="t('contact.form.name.placeholder')"
        />
      </UFormField>

      <UFormField
        :label="t('contact.form.email.label')"
        name="email"
      >
        <UInput
          v-model="state.email"
          class="w-full"
          :placeholder="t('contact.form.email.placeholder')"
          autocomplete="email"
        />
      </UFormField>

      <UFormField
        :label="t('contact.form.phone.label')"
        name="phone"
      >
        <UFieldGroup class="flex content-stretch">
          <USelect
            v-model="state.phonePrefix"
            :items="phonePrefixes"
            class="w-4/12 sm:w-3/12"
          />
          <UInput
            v-model="state.phone"
            :placeholder="t('contact.form.phone.placeholder')"
            autocomplete="tel"
            class="w-8/12 sm:w-9/12"
          />
        </UFieldGroup>
        <template #help>
          <div class="text-xs text-dimmed mt-1">
            {{ t('contact.form.phone.hint') }}
          </div>
        </template>
      </UFormField>

      <UFormField
        :label="t('contact.form.subject.label')"
        name="subject"
      >
        <USelect
          v-model="state.subject"
          class="w-full"
          :placeholder="t('contact.form.subject.placeholder')"
          :items="contactSubjectSelectItems"
        />
      </UFormField>

      <UFormField
        v-show="state.subject === 'other'"
        :label="t('contact.form.subjectOther.label')"
        name="subjectOther"
        class="w-full"
      >
        <UInput
          v-model="state.subjectOther"
          class="w-full"
          :placeholder="t('contact.form.subjectOther.placeholder')"
        />
      </UFormField>

      <UFormField
        :label="t('contact.form.message.label')"
        name="message"
      >
        <UTextarea
          v-model="state.message"
          :placeholder="messagePlaceholder"
          class="w-full"
        />
      </UFormField>
      <UButton
        type="submit"
        class="justify-center flex"
        size="xl"
      >
        {{ t('contact.form.submit.label') }}
      </UButton>
    </UForm>
  </UPageCard>
</template>
