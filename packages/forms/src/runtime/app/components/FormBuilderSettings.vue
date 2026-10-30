<script setup lang="ts">
import type { FormDefinition } from '../../../types'
import {
  availableVariables, composeEmail, emailFieldKeys, patchEmailDelivery, renderAnswers, routableFields, sampleAnswers, setEmailRecipients, setRoute,
  setRouteField, setStorage, storageWarnings, translate, unknownBodyVariables,
} from '../../utils'
import { useFormsLocale } from '../composables/useForms'
import { computed, ref, useModuleT } from '#imports'

const definition = defineModel<FormDefinition>({ required: true })

const t = useModuleT('forms')
const locale = useFormsLocale()

const email = computed(() => definition.value.delivery?.email)
const warnings = computed(() => storageWarnings(definition.value))
const replyToFields = computed(() => emailFieldKeys(definition.value))
const routable = computed(() => routableFields(definition.value))
const routeField = computed(() => routable.value.find(field => field.key === email.value?.routes?.field))

const unknownVariables = computed(() => unknownBodyVariables(definition.value))
const variables = computed(() => availableVariables(definition.value))
// Shown as help text; kept out of the i18n files, where braces mean interpolation.
const answersExample = '{{answers}}'
const variableLabel = (name: string) => `{{${name}}}`

const bodyEditor = ref<HTMLElement>()
let lastTextarea: HTMLTextAreaElement | undefined
function rememberTextarea(event: FocusEvent) {
  if (event.target instanceof HTMLTextAreaElement) lastTextarea = event.target
}

/** Inserts `{{name}}` at the cursor of the body textarea that was edited last (the first one if none was). */
function insertVariable(name: string) {
  const textarea = lastTextarea?.isConnected ? lastTextarea : bodyEditor.value?.querySelector('textarea')
  if (!textarea) return
  const text = variableLabel(name)
  const start = textarea.selectionStart ?? textarea.value.length
  const end = textarea.selectionEnd ?? start
  textarea.value = textarea.value.slice(0, start) + text + textarea.value.slice(end)
  textarea.dispatchEvent(new Event('input', { bubbles: true }))
  textarea.focus()
  textarea.setSelectionRange(start + text.length, start + text.length)
}

const preview = computed(() => {
  if (!email.value) return ''
  const answers = sampleAnswers(definition.value)
  return composeEmail(email.value, {
    form: { name: 'Form name', slug: 'form-slug', version: 1 },
    submission: { id: 'sub_example', createdAt: new Date().toISOString(), locale: locale.value },
    answers: renderAnswers(definition.value, answers, locale.value),
    files: [],
    replyTo: 'name@example.com',
  }).text
})

const NONE = '__none__'
const replyToItems = computed(() => [
  { value: NONE, label: t('delivery.replyToNone', 'None') },
  ...replyToFields.value.map(value => ({ value, label: value })),
])
const routeFieldItems = computed(() => [
  { value: NONE, label: t('delivery.routingNone', 'No routing') },
  ...routable.value.map(field => ({ value: field.key, label: translate(field.label, locale.value) || field.key })),
])
</script>

<template>
  <div class="flex flex-col gap-4">
    <SectionCard :title="t('delivery.storageTitle', 'Storage')">
      <div class="flex flex-col gap-4">
        <FormRow
          :label="t('delivery.storeTitle', 'Store submissions')"
          :description="t('delivery.storeHint', 'Keep submissions in the database so they can be reviewed under Submissions.')"
        >
          <USwitch
            :model-value="definition.storage === 'db'"
            @update:model-value="definition = setStorage(definition, $event ? 'db' : 'none')"
          />
        </FormRow>
        <UAlert
          v-if="warnings.files"
          color="warning"
          variant="subtle"
          :title="t('delivery.filesWarning', 'This form has file upload fields, which need stored submissions. Remove them or keep storing.')"
        />
        <UAlert
          v-if="warnings.lost"
          color="warning"
          variant="subtle"
          :title="t('delivery.lostWarning', 'Submissions are neither stored nor emailed. Add recipients or keep storing, or answers are lost unless something handles forms:submitted.')"
        />
      </div>
    </SectionCard>

    <SectionCard :title="t('delivery.emailTitle', 'Email notification')">
      <div class="flex flex-col divide-y divide-default">
        <FormRow
          :label="t('delivery.recipients', 'Recipients')"
          :description="t('delivery.recipientsHint', 'Press Enter after each address. Leave empty to turn email off.')"
        >
          <UInputTags
            :model-value="email?.to ?? []"
            type="email"
            class="w-full sm:max-w-sm"
            @update:model-value="definition = setEmailRecipients(definition, $event)"
          />
        </FormRow>

        <p
          v-if="!email"
          class="pt-4 text-sm text-muted"
        >
          {{ t('delivery.needRecipients', 'Add recipients first to set the subject, reply-to and routing.') }}
        </p>

        <template v-else>
          <FormRow
            :label="t('delivery.subject', 'Subject')"
            :description="t('delivery.subjectHint', 'Variables from the list below work here too.')"
          >
            <FormBuilderText
              :model-value="email.subject"
              class="sm:max-w-sm"
              @update:model-value="definition = patchEmailDelivery(definition, { subject: $event })"
            />
          </FormRow>

          <FormRow
            :label="t('delivery.body', 'Email body')"
            :description="t('delivery.bodyHint', 'Optional. Leave empty to email the list of all answers. Variables are replaced with the submitted values.')"
          >
            <div
              ref="bodyEditor"
              class="space-y-2"
              @focusin="rememberTextarea"
            >
              <FormBuilderText
                :model-value="email.body"
                multiline
                :preview="false"
                @update:model-value="definition = patchEmailDelivery(definition, { body: $event })"
              />
              <div class="space-y-1">
                <p class="text-xs text-muted">
                  {{ t('delivery.bodyVariables', 'Click a variable to insert it at the cursor. The full list of answers is') }}
                  <code>{{ answersExample }}</code>.
                </p>
                <div class="flex max-h-28 flex-wrap gap-1 overflow-y-auto">
                  <UButton
                    v-for="name in variables"
                    :key="name"
                    type="button"
                    color="neutral"
                    variant="subtle"
                    size="xs"
                    class="font-mono"
                    :label="variableLabel(name)"
                    @click="insertVariable(name)"
                  />
                </div>
              </div>
              <UAlert
                v-if="unknownVariables.length"
                color="warning"
                variant="subtle"
                :title="t('delivery.bodyUnknown', 'Unknown variables are left empty: {names}', { names: unknownVariables.map(variableLabel).join(', ') })"
              />
              <div
                v-if="email.body"
                class="space-y-1"
              >
                <p class="text-xs font-medium text-muted">
                  {{ t('delivery.bodyPreview', 'Preview with sample answers') }}
                </p>
                <pre class="max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-default bg-elevated/50 p-2 text-xs">{{ preview }}</pre>
                <UButton
                  type="button"
                  color="neutral"
                  variant="link"
                  size="xs"
                  icon="i-lucide-rotate-ccw"
                  :label="t('delivery.bodyReset', 'Reset to the default body')"
                  @click="definition = patchEmailDelivery(definition, { body: undefined })"
                />
              </div>
            </div>
          </FormRow>

          <FormRow
            :label="t('delivery.replyTo', 'Reply to')"
            :description="t('delivery.replyToHint', 'The answer of this email field becomes the Reply-To.')"
          >
            <USelect
              :model-value="email.replyToField ?? NONE"
              :items="replyToItems"
              :disabled="!replyToFields.length"
              class="w-full sm:max-w-sm"
              @update:model-value="definition = patchEmailDelivery(definition, { replyToField: $event === NONE ? undefined : String($event) })"
            />
          </FormRow>

          <FormRow
            v-if="routable.length"
            :label="t('delivery.routing', 'Route by answer')"
            :description="t('delivery.routingHint', 'Send to other recipients depending on the answer. Others get the default recipients.')"
          >
            <USelect
              :model-value="email.routes?.field ?? NONE"
              :items="routeFieldItems"
              class="w-full sm:max-w-sm"
              @update:model-value="definition = setRouteField(definition, $event === NONE ? undefined : String($event))"
            />
          </FormRow>

          <template v-if="routeField">
            <FormRow
              v-for="option in routeField.options"
              :key="option.value"
              :label="t('delivery.routeTo', 'Recipients for “{value}”', { value: translate(option.label, locale) || option.value })"
            >
              <UInputTags
                :model-value="email.routes?.to[option.value] ?? []"
                type="email"
                class="w-full sm:max-w-sm"
                @update:model-value="definition = setRoute(definition, option.value, $event)"
              />
            </FormRow>
          </template>
        </template>
      </div>
    </SectionCard>
  </div>
</template>
