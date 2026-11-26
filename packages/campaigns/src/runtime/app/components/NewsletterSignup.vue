<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { z } from 'zod'
import type { CampaignChannel, CampaignListPublicDto, CampaignSubscribeResponse, PublicModuleOptions } from '../../../types'
import { campaignsApi } from '../../utils/api'
import { $fetch, computed, reactive, ref, resolveComponent, useCampaignsLocale, useCampaignsTranslate, useErrorToast, useLazyFetch, useModuleT, useRuntimeConfig, watch } from '#imports'

defineOptions({ name: 'NewsletterSignup' })

// The signup of a newsletter: `<NewsletterSignup list="slug" />`, or `::newsletter-signup{list="slug"}` in Nuxt Content.
// Shows the list's name, description and consent text, asks for an email address and/or a phone number (the channels
// the list has), and posts to the subscribe route. With a captcha set on the module it shows forms' captcha widget.
const props = withDefaults(defineProps<{
  /** The list's URL name. */
  list: string
  /** Replaces the list's name as the heading; `false` shows none. */
  title?: string | false
  /** Replaces the list's description. */
  description?: string
}>(), {
  title: undefined,
  description: undefined,
})

const t = useModuleT('campaigns.signup')
const tc = useModuleT('campaigns')
const tr = useCampaignsTranslate()
const locale = useCampaignsLocale()
const showError = useErrorToast()
const config = useRuntimeConfig().public.campaigns as PublicModuleOptions | undefined
const captchaProvider = config?.captcha ?? null
// Forms' widget, when forms is installed (it is required for a captcha).
const FormCaptcha = captchaProvider ? resolveComponent('FormCaptcha') : null

const { data: newsletter, status, error } = useLazyFetch<CampaignListPublicDto>(() => campaignsApi.list(props.list), { key: `campaigns:list:${props.list}` })

const offersEmail = computed(() => newsletter.value?.channels.includes('email') ?? false)
const offersSms = computed(() => newsletter.value?.channels.includes('sms') ?? false)

type State = { name: string, email: string, phone: string, channels: CampaignChannel[], consent: boolean, captcha?: string }
const state = reactive<State>({ name: '', email: '', phone: '', channels: [], consent: false, captcha: undefined })
watch(newsletter, (value) => {
  if (value) state.channels = [...value.channels]
}, { immediate: true })

const schema = computed(() => z.object({
  name: z.string().max(120),
  email: z.string().trim().max(254).refine(value => !value || z.email().safeParse(value).success, t('emailInvalid', 'Write a valid email address.')),
  phone: z.string().trim().max(32).refine(value => !value || /^(?:\+|00)?[\d\s\-.()]{7,20}$/.test(value), t('phoneInvalid', 'Write the phone number with its country code, such as +4512345678.')),
  channels: z.array(z.enum(['email', 'sms'])).min(1, t('channelsRequired', 'Pick how you want to get it.')),
  consent: z.boolean().refine(value => value, t('consentRequired', 'Tick the box to sign up.')),
  captcha: z.string().optional(),
}).superRefine((value, ctx) => {
  if (value.channels.includes('email') && offersEmail.value && !value.email.trim()) ctx.addIssue({ code: 'custom', path: ['email'], message: t('emailRequired', 'Write your email address.') })
  if (value.channels.includes('sms') && offersSms.value && !value.phone.trim()) ctx.addIssue({ code: 'custom', path: ['phone'], message: t('phoneRequired', 'Write your phone number.') })
  if (captchaProvider && !value.captcha) ctx.addIssue({ code: 'custom', path: ['captcha'], message: t('captchaRequired', 'Complete the captcha.') })
}))

const channelItems = computed(() => (newsletter.value?.channels ?? []).map(value => ({ value, label: tc(`channels.${value}`, value === 'sms' ? 'SMS' : 'Email') })))

const busy = ref(false)
const done = ref<CampaignSubscribeResponse>()
const captchaReset = ref(0)

async function submit(event: FormSubmitEvent<State>) {
  busy.value = true
  const data = event.data
  try {
    done.value = await $fetch<CampaignSubscribeResponse>(campaignsApi.subscribe(props.list), {
      method: 'POST',
      body: {
        name: data.name || undefined,
        email: data.channels.includes('email') ? data.email || undefined : undefined,
        phone: data.channels.includes('sms') ? data.phone || undefined : undefined,
        channels: data.channels,
        consent: true,
        locale: locale.value,
        captcha: data.captcha,
      },
    })
  }
  catch (e) {
    showError(e, t('failed', 'You could not be signed up'))
    captchaReset.value++
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div
      v-if="status === 'pending' && !newsletter"
      class="flex flex-col gap-3"
    >
      <USkeleton class="h-6 w-1/2" />
      <USkeleton class="h-10 w-full" />
      <USkeleton class="h-10 w-32" />
    </div>
    <UAlert
      v-else-if="error || !newsletter"
      color="neutral"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="t('unavailable', 'This signup is not available')"
    />
    <template v-else>
      <div v-if="title !== false || description || newsletter.description">
        <h3
          v-if="title !== false"
          class="text-highlighted text-lg font-semibold"
        >
          {{ title || tr(newsletter.name) }}
        </h3>
        <p
          v-if="description || tr(newsletter.description)"
          class="text-muted text-sm"
        >
          {{ description || tr(newsletter.description) }}
        </p>
      </div>

      <UAlert
        v-if="done"
        color="success"
        variant="subtle"
        icon="i-lucide-mail-check"
        :title="done.confirm ? t('checkInbox', 'Check your inbox') : t('signedUp', 'You are signed up')"
        :description="done.confirm ? t('checkInboxDescription', 'We sent you a link. Confirm, and the newsletter starts coming to you.') : t('signedUpDescription', 'Thank you for signing up.')"
      />

      <UForm
        v-else
        :schema="schema"
        :state="state"
        class="flex flex-col gap-4"
        @submit="submit"
      >
        <UFormField
          name="name"
          :label="t('name', 'Name')"
        >
          <UInput
            v-model="state.name"
            autocomplete="name"
            class="w-full"
          />
        </UFormField>
        <UFormField
          v-if="channelItems.length > 1"
          name="channels"
          :label="t('channels', 'Get it by')"
        >
          <UCheckboxGroup
            v-model="state.channels"
            :items="channelItems"
            orientation="horizontal"
          />
        </UFormField>
        <UFormField
          v-if="offersEmail && state.channels.includes('email')"
          name="email"
          :label="t('email', 'Email')"
          required
        >
          <UInput
            v-model="state.email"
            type="email"
            autocomplete="email"
            class="w-full"
          />
        </UFormField>
        <UFormField
          v-if="offersSms && state.channels.includes('sms')"
          name="phone"
          :label="t('phone', 'Phone number')"
          :description="t('phoneHelp', 'With the country code, such as +45.')"
          required
        >
          <UInput
            v-model="state.phone"
            type="tel"
            autocomplete="tel"
            class="w-full"
          />
        </UFormField>
        <UFormField name="consent">
          <UCheckbox
            v-model="state.consent"
            :label="tr(newsletter.consentText) || t('consentDefault', 'Yes, send me this newsletter.')"
          />
        </UFormField>
        <UFormField
          v-if="FormCaptcha && typeof FormCaptcha !== 'string'"
          name="captcha"
        >
          <component
            :is="FormCaptcha"
            v-model="state.captcha"
            :field="{ key: 'captcha', type: 'captcha', captcha: { provider: captchaProvider } }"
            :reset-key="captchaReset"
          />
        </UFormField>
        <div>
          <UButton
            type="submit"
            :loading="busy"
            icon="i-lucide-send"
            :label="t('submit', 'Sign up')"
          />
        </div>
      </UForm>
    </template>
  </div>
</template>
