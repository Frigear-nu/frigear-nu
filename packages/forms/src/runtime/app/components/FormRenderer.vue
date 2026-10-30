<script setup lang="ts">
import type { FormDefinition, PublicFormDto } from '../../../types'
import { previewPayload, translate } from '../../utils'
import { emptyAnswers, submissionIssues, submitAnswers, useFormsLocale } from '../composables/useForms'
import { useFormStepper } from '../composables/useFormStepper'
import { computed, getCurrentInstance, navigateTo, reactive, ref, useForm, useModuleT, useTemplateRef, useToast, watch } from '#imports'

type FormShape = Pick<PublicFormDto, 'slug' | 'definition'> & { definition: Omit<FormDefinition, 'delivery'> }

const props = defineProps<{
  /** Slug of a published form (loaded from the API). */
  slug?: string
  /** A definition to render directly (admin preview, tests). */
  form?: FormShape
  /** Shared password of a password-protected form (sent as `x-form-password`). */
  password?: string
  /** Validates and steps like normal, but never posts. */
  preview?: boolean
  /** Overrides the locale of translated form content (defaults to the app's locale). */
  locale?: string
}>()
const emit = defineEmits<{ submitted: [id: string | null], previewed: [answers: Record<string, unknown>] }>()
const listening = !!getCurrentInstance()?.vnode.props?.onPreviewed

const t = useModuleT('forms')
const appLocale = useFormsLocale()
const locale = computed(() => props.locale || appLocale.value)
const toast = useToast()

const loaded = props.slug ? await useForm(props.slug, () => props.password) : undefined
const form = computed<FormShape | undefined>(() => props.form ?? loaded?.data.value ?? undefined)
const definition = computed(() => form.value?.definition as FormDefinition)

const state = reactive<Record<string, unknown>>(form.value ? emptyAnswers(form.value.definition) : {})
watch(() => form.value?.definition, (next) => {
  if (!next) return
  for (const [key, value] of Object.entries(emptyAnswers(next))) if (!(key in state)) state[key] = value
})

const stepper = useFormStepper(definition, state, { t: () => t, locale })
const formRef = useTemplateRef<{ setErrors: (errors: { name: string, message: string }[]) => void }>('formRef')
const submitting = ref(false)
const captchaResetKey = ref(0)
const done = ref(false)

const submitSettings = computed(() => definition.value?.submit)
const title = (value: Parameters<typeof translate>[0]) => translate(value, locale.value)

async function onSubmit() {
  if (!stepper.isLast.value) return stepper.next()
  if (props.preview) {
    if (listening) emit('previewed', previewPayload(definition.value, state))
    else toast.add({ title: t('preview.notSent', 'Preview: nothing was sent.'), color: 'info' })
    return
  }
  submitting.value = true
  try {
    const result = await submitAnswers(form.value!.slug, definition.value, state, locale.value, props.password)
    done.value = true
    emit('submitted', result.id)
    const redirect = submitSettings.value?.redirect
    if (redirect) await navigateTo(redirect)
  }
  catch (error) {
    const issues = submissionIssues(error)
    if (issues.length) {
      formRef.value?.setErrors(issues.map(issue => ({ name: String(issue.path[0] ?? ''), message: issue.message })))
      toast.add({ title: t('error.invalid', 'Please check the highlighted fields.'), color: 'error' })
    }
    else {
      toast.add({ title: t('error.generic', 'Something went wrong. Please try again.'), color: 'error' })
    }
  }
  finally {
    // A captcha token is single use: every attempt needs a fresh one.
    captchaResetKey.value++
    submitting.value = false
  }
}

function sendAnother() {
  const keep = new Set(submitSettings.value?.allowResubmit?.keep ?? [])
  const fresh = emptyAnswers(definition.value)
  for (const key of Object.keys(state)) state[key] = keep.has(key) ? state[key] : fresh[key]
  stepper.reset()
  done.value = false
}
</script>

<template>
  <UAlert
    v-if="!form"
    color="error"
    variant="subtle"
    :title="t('error.notFound', 'This form could not be found.')"
  />

  <UEmpty
    v-else-if="done"
    icon="i-lucide-circle-check"
    :title="title(submitSettings?.successMessage) || t('success.title', 'Thank you!')"
    :description="title(submitSettings?.successMessage) ? undefined : t('success.description', 'Your answers have been sent.')"
    :actions="submitSettings?.allowResubmit ? [{ label: t('actions.sendAnother', 'Send another'), onClick: sendAnother }] : []"
  />

  <UForm
    v-else
    ref="formRef"
    :schema="stepper.schema.value"
    :state="state"
    class="space-y-6"
    @submit="onSubmit"
  >
    <template v-if="stepper.current.value">
      <div
        v-if="stepper.stepped.value && stepper.steps.value.length > 1"
        class="space-y-2"
      >
        <p class="text-sm text-muted">
          {{ t('step.progress', 'Step {current} of {total}', { current: stepper.index.value + 1, total: stepper.steps.value.length }) }}
        </p>
        <UProgress
          :model-value="stepper.index.value + 1"
          :max="stepper.steps.value.length"
          size="sm"
        />
      </div>

      <div
        v-if="stepper.current.value.step.title || stepper.current.value.step.description"
        class="space-y-1"
      >
        <h2
          v-if="stepper.current.value.step.title"
          class="text-xl font-semibold"
        >
          {{ title(stepper.current.value.step.title) }}
        </h2>
        <p
          v-if="stepper.current.value.step.description"
          class="text-muted"
        >
          {{ title(stepper.current.value.step.description) }}
        </p>
      </div>

      <FormField
        v-for="field in stepper.current.value.fields"
        :key="field.key"
        v-model="state[field.key]"
        :field="field"
        :locale="locale"
        :preview="preview"
        :captcha-reset-key="captchaResetKey"
      />
    </template>

    <div class="flex justify-between gap-2">
      <UButton
        v-if="stepper.stepped.value && !stepper.isFirst.value"
        type="button"
        color="neutral"
        variant="outline"
        :label="t('actions.back', 'Back')"
        @click="stepper.prev()"
      />
      <span v-else />
      <UButton
        type="submit"
        :loading="submitting"
        :label="stepper.isLast.value
          ? title(submitSettings?.label) || t('actions.submit', 'Submit')
          : t('actions.next', 'Next')"
      />
    </div>
  </UForm>
</template>
