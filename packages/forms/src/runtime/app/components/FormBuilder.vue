<script setup lang="ts">
import type { FieldOption, FieldType, FormDefinition, FormField, FormSecretsDto, FormStep } from '../../../types'
import {
  allPhoneCountries, arrayMove, captchaProviders, changeMode, createField, countryName, createStep, defaultPhoneCountry, dropIndex, duplicateField, fieldTypes, insertField, insertStep, moveField, moveStep,
  phoneCountries, removeField, removeStep, renameFieldKey, resolveCaptcha, translate, updateField, updateStep,
} from '../../utils'
import type { FieldPosition } from '../../utils'
import { useConfirmDialog } from '@frigear-nu/ui/composables'
import { captchaDefaultProvider, captchaSiteKey } from '../composables/useCaptcha'
import { useFormsLocale } from '../composables/useForms'

const definition = defineModel<FormDefinition>({ required: true })
/** The saved form; enables per-form secrets (captcha secret key), which are stored right away, not with the definition. */
const props = defineProps<{ formId?: string }>()

const t = useModuleT('forms')
const locale = useFormsLocale()

const typeIcons: Record<FieldType, string> = {
  text: 'i-lucide-text-cursor-input',
  textarea: 'i-lucide-align-left',
  email: 'i-lucide-mail',
  tel: 'i-lucide-phone',
  number: 'i-lucide-hash',
  date: 'i-lucide-calendar',
  select: 'i-lucide-list',
  radio: 'i-lucide-circle-dot',
  checkbox: 'i-lucide-square-check',
  file: 'i-lucide-paperclip',
  markdown: 'i-lucide-type',
  captcha: 'i-lucide-shield-check',
}
const typeNames: Record<FieldType, string> = {
  text: 'Short text',
  textarea: 'Long text',
  email: 'Email',
  tel: 'Phone',
  number: 'Number',
  date: 'Date',
  select: 'Dropdown',
  radio: 'Single choice',
  checkbox: 'Checkbox',
  file: 'File upload',
  markdown: 'Text block',
  captcha: 'Captcha',
}
const typeLabel = (type: FieldType) => t(`builder.types.${type}`, typeNames[type])

const stepped = computed(() => definition.value.mode === 'stepped')
const modeItems = computed(() => [
  { value: 'single', label: t('admin.single', 'Single page'), icon: 'i-lucide-file' },
  { value: 'stepped', label: t('admin.stepped', 'Stepped'), icon: 'i-lucide-layers' },
])

// ---- selection -------------------------------------------------------------------------------

type Selection = { kind: 'field', at: FieldPosition } | { kind: 'step', index: number }
const selection = ref<Selection>()

const selectedField = computed(() =>
  selection.value?.kind === 'field' ? definition.value.steps[selection.value.at.step]?.fields[selection.value.at.index] : undefined)
const selectedStep = computed(() =>
  selection.value?.kind === 'step' ? definition.value.steps[selection.value.index] : undefined)

// A selection can go stale when the definition changes underneath (JSON tab, deletes).
watch(definition, () => {
  if (selection.value && !selectedField.value && !selectedStep.value) selection.value = undefined
})

const isSelected = (step: number, index: number) =>
  selection.value?.kind === 'field' && selection.value.at.step === step && selection.value.at.index === index

// ---- drag and drop ---------------------------------------------------------------------------

type Dragged
  = | { kind: 'field', from: FieldPosition }
    | { kind: 'step', index: number }
type DropSlot = { kind: 'field', step: number, index: number } | { kind: 'step', index: number }

const dragged = ref<Dragged>()
const slot = ref<DropSlot>()

function startDrag(event: DragEvent, payload: Dragged) {
  dragged.value = payload
  if (!event.dataTransfer) return
  event.dataTransfer.effectAllowed = 'move'
  // Firefox does not start a drag without data.
  event.dataTransfer.setData('text/plain', payload.kind)
}

function endDrag() {
  dragged.value = undefined
  slot.value = undefined
}

/** Whether the pointer is in the lower half of the hovered element. */
const lowerHalf = (event: DragEvent) => {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  return event.clientY > rect.top + rect.height / 2
}

function overField(event: DragEvent, step: number, index: number) {
  if (!dragged.value || dragged.value.kind === 'step') return
  event.preventDefault()
  event.stopPropagation()
  slot.value = { kind: 'field', step, index: index + (lowerHalf(event) ? 1 : 0) }
}

function overStepBody(event: DragEvent, step: number) {
  if (!dragged.value || dragged.value.kind === 'step') return
  event.preventDefault()
  // Rows handle their own hover; this is the empty area under/around them.
  if (slot.value?.kind !== 'field' || slot.value.step !== step) {
    slot.value = { kind: 'field', step, index: definition.value.steps[step]?.fields.length ?? 0 }
  }
}

function overStep(event: DragEvent, index: number) {
  if (dragged.value?.kind !== 'step') return
  event.preventDefault()
  slot.value = { kind: 'step', index: index + (lowerHalf(event) ? 1 : 0) }
}

function drop(event: DragEvent) {
  event.preventDefault()
  const from = dragged.value
  const to = slot.value
  endDrag()
  if (!from || !to) return

  if (from.kind === 'step' && to.kind === 'step') {
    definition.value = moveStep(definition.value, from.index, from.index < to.index ? to.index - 1 : to.index)
    selection.value = undefined
  }
  else if (to.kind === 'field' && from.kind === 'field') {
    const target = { step: to.step, index: dropIndex(from.from, to) }
    definition.value = moveField(definition.value, from.from, target)
    selection.value = { kind: 'field', at: target }
  }
}

const showLine = (step: number, index: number) =>
  slot.value?.kind === 'field' && slot.value.step === step && slot.value.index === index
const showStepLine = (index: number) => slot.value?.kind === 'step' && slot.value.index === index

// ---- edits -----------------------------------------------------------------------------------

/** Inserts a new field of `type` at exactly `at` and selects it. */
function addField(type: FieldType, at: FieldPosition) {
  const field = createField(definition.value, type)
  const next = insertField(definition.value, at, field)
  definition.value = next
  // `definition` is a v-model: reading it straight after assigning still gives the old value, so look the
  // new field up in `next` (by its unique key) to select exactly the one that was just added.
  const index = next.steps[at.step]?.fields.findIndex(candidate => candidate.key === field.key) ?? -1
  if (index >= 0) selection.value = { kind: 'field', at: { step: at.step, index } }
}

/** Inserts a new, empty step before `index` (or at the end) and selects it. */
function addStep(index = definition.value.steps.length) {
  const next = insertStep(definition.value, index, createStep(definition.value))
  definition.value = next
  selection.value = { kind: 'step', index: Math.min(index, next.steps.length - 1) }
}

/** Menu items for the "+" insertion rows: one entry per field type. */
const insertItems = (at: FieldPosition) => [fieldTypes.map(type => ({
  label: typeLabel(type),
  icon: typeIcons[type],
  onSelect: () => addField(type, at),
}))]

function removeAtField(at: FieldPosition) {
  definition.value = removeField(definition.value, at)
  selection.value = undefined
}

function copyField(at: FieldPosition) {
  definition.value = duplicateField(definition.value, at)
  selection.value = { kind: 'field', at: { step: at.step, index: at.index + 1 } }
}

/** Keyboard/touch alternative to dragging: one position up or down, crossing into the neighbouring step. */
function nudge(at: FieldPosition, delta: -1 | 1) {
  const steps = definition.value.steps
  let target: FieldPosition = { step: at.step, index: at.index + delta }
  if (target.index < 0) target = at.step > 0 ? { step: at.step - 1, index: steps[at.step - 1]!.fields.length } : at
  else if (target.index >= steps[at.step]!.fields.length) {
    target = at.step < steps.length - 1 ? { step: at.step + 1, index: 0 } : at
  }
  if (target === at) return
  definition.value = moveField(definition.value, at, target)
  selection.value = { kind: 'field', at: target }
}

function nudgeStep(index: number, delta: -1 | 1) {
  if (index + delta < 0 || index + delta >= definition.value.steps.length) return
  definition.value = moveStep(definition.value, index, index + delta)
  selection.value = { kind: 'step', index: index + delta }
}

function deleteStep(index: number) {
  const hasFields = !!definition.value.steps[index]?.fields.length
  definition.value = removeStep(definition.value, index, { keepFields: hasFields })
  selection.value = undefined
}

function patchField(patch: Partial<FormField>) {
  if (selection.value?.kind !== 'field') return
  definition.value = updateField(definition.value, selection.value.at, patch)
}

// Renaming a key also rewrites conditions, routing, reply-to and resubmit entries that point at it.
function renameKey(key: string) {
  if (selection.value?.kind !== 'field') return
  definition.value = renameFieldKey(definition.value, selection.value.at, key)
}

function patchStep(patch: Partial<FormStep>) {
  if (selection.value?.kind !== 'step') return
  definition.value = updateStep(definition.value, selection.value.index, patch)
}

function moveToStep(step: number) {
  if (selection.value?.kind !== 'field' || step === selection.value.at.step) return
  const target = { step, index: definition.value.steps[step]!.fields.length }
  definition.value = moveField(definition.value, selection.value.at, target)
  selection.value = { kind: 'field', at: target }
}

function setOption(index: number, patch: Partial<FieldOption>) {
  const options = [...(selectedField.value?.options ?? [])]
  options[index] = { ...options[index]!, ...patch }
  patchField({ options })
}

function addOption() {
  const options = selectedField.value?.options ?? []
  patchField({ options: [...options, { value: `option_${options.length + 1}`, label: `Option ${options.length + 1}` }] })
}

function moveOption(index: number, delta: -1 | 1) {
  patchField({ options: arrayMove(selectedField.value?.options ?? [], index, index + delta) })
}

const confirm = useConfirmDialog()

// Going from steps to a single page merges every step into one and drops step titles and conditions, and
// switching back does not restore them, so ask first when there is more than one step to lose.
async function setMode(mode: FormDefinition['mode']) {
  if (mode === definition.value.mode) return
  if (mode === 'single' && definition.value.steps.length > 1) {
    const ok = await confirm({
      title: t('builder.singleConfirmTitle', 'Switch to a single page?'),
      description: t('builder.singleConfirmDescription', 'All steps are merged into one page. Step titles, descriptions and step conditions are lost, and switching back to steps will not restore them.'),
      confirmText: t('builder.singleConfirmButton', 'Switch to single page'),
    })
    if (!ok) return
  }
  definition.value = changeMode(definition.value, mode)
  selection.value = undefined
}

function setValidation(key: 'minLength' | 'maxLength' | 'min' | 'max', value: number | null | undefined) {
  const { [key]: _old, ...rest } = selectedField.value?.validation ?? {}
  const validation = value === null || value === undefined || Number.isNaN(value) ? rest : { ...rest, [key]: value }
  patchField({ validation: Object.keys(validation).length ? validation : undefined })
}

/** Fields a condition at the given position may look at: input fields before it, in definition order. */
function conditionFields(step: number, index: number) {
  return definition.value.steps.flatMap((s, si) =>
    si > step ? [] : s.fields.slice(0, si === step ? index : undefined).filter(f => f.type !== 'markdown' && f.type !== 'captcha').map(f => f.key))
}

const hasOptions = computed(() => selectedField.value?.type === 'select' || selectedField.value?.type === 'radio')
const hasPlaceholder = computed(() => !!selectedField.value && ['text', 'email', 'tel', 'number', 'textarea', 'select'].includes(selectedField.value.type))
const hasLength = computed(() => !!selectedField.value && ['text', 'email', 'tel', 'textarea'].includes(selectedField.value.type))

const phoneModeItems = computed(() => [
  { value: 'simple', label: t('builder.phoneSimple', 'Single input') },
  { value: 'country', label: t('builder.phoneCountry', 'Country code + number') },
])
const phoneCountryItems = computed(() => allPhoneCountries.map(({ code, dial, flag }) => ({
  value: code,
  label: `${flag} ${countryName(code, locale.value)} (+${dial})`,
})))
const offeredCountries = computed(() => new Set(phoneCountries(selectedField.value?.phone).map(country => country.code)))

function patchPhone(patch: Partial<NonNullable<FormField['phone']>>) {
  const next = Object.fromEntries(Object.entries({ ...selectedField.value?.phone, ...patch }).filter(([, value]) => value !== undefined))
  // Drop a default country that the narrowed allow-list no longer offers.
  const countries = next.countries as string[] | undefined
  if (countries && next.defaultCountry && !countries.includes(next.defaultCountry as string)) delete next.defaultCountry
  patchField({ phone: Object.keys(next).length ? next : undefined })
}

function setPhoneMode(mode: 'simple' | 'country') {
  patchField({ phone: mode === 'country' ? { ...selectedField.value?.phone, mode } : undefined })
}

const captchaProviderItems = computed(() => captchaProviders.map(value => ({ value, label: t(`captcha.providers.${value}`, value) })))
const captchaThemeItems = computed(() => [
  { value: 'auto', label: t('captcha.themes.auto', 'Automatic') },
  { value: 'light', label: t('captcha.themes.light', 'Light') },
  { value: 'dark', label: t('captcha.themes.dark', 'Dark') },
])
const captchaSizeItems = computed(() => [
  { value: 'normal', label: t('captcha.sizes.normal', 'Normal') },
  { value: 'compact', label: t('captcha.sizes.compact', 'Compact') },
])
const selectedCaptcha = computed(() => selectedField.value?.type === 'captcha' ? resolveCaptcha(selectedField.value, captchaDefaultProvider()) : undefined)
const captchaKeyMissing = computed(() => selectedField.value?.type === 'captcha' && !captchaSiteKey(selectedField.value))

// --- Captcha secret key (write-only, saved immediately through the admin secrets API) -------------
const toast = useToast()
const secrets = ref<FormSecretsDto>()
const secretsUrl = computed(() => props.formId ? `/api/forms/admin/forms/${props.formId}/secrets` : undefined)
const secretValue = ref('')
const savingSecret = ref(false)
const secretSource = computed(() => selectedCaptcha.value ? secrets.value?.captcha[selectedCaptcha.value.provider]?.source : undefined)
const secretStatusLabel = computed(() => ({
  form: t('captcha.secretForm', 'Configured via form'),
  env: t('captcha.secretEnv', 'Configured via environment'),
  unset: t('captcha.secretUnset', 'Not set'),
})[secretSource.value ?? 'unset'])

async function loadSecrets() {
  if (!secretsUrl.value) return
  try {
    secrets.value = await $fetch<FormSecretsDto>(secretsUrl.value)
  }
  catch {
    secrets.value = undefined
  }
}
onMounted(loadSecrets)
watch(() => selectedCaptcha.value?.provider, () => {
  secretValue.value = ''
})

async function saveSecret() {
  if (!secretsUrl.value || !selectedCaptcha.value || !secretValue.value.trim()) return
  savingSecret.value = true
  try {
    secrets.value = await $fetch<FormSecretsDto>(secretsUrl.value, { method: 'PUT', body: { key: `captcha.${selectedCaptcha.value.provider}.secretKey`, value: secretValue.value.trim() } })
    secretValue.value = ''
    toast.add({ title: t('captcha.secretSaved', 'Secret key saved.'), color: 'success' })
  }
  catch {
    toast.add({ title: t('captcha.secretFailed', 'The secret key could not be saved.'), color: 'error' })
  }
  finally {
    savingSecret.value = false
  }
}

async function removeSecret() {
  if (!secretsUrl.value || !selectedCaptcha.value) return
  try {
    secrets.value = await $fetch<FormSecretsDto>(`${secretsUrl.value}/captcha.${selectedCaptcha.value.provider}.secretKey`, { method: 'DELETE' })
    toast.add({ title: t('captcha.secretRemoved', 'Secret key removed.'), color: 'success' })
  }
  catch {
    toast.add({ title: t('captcha.secretFailed', 'The secret key could not be saved.'), color: 'error' })
  }
}

function patchCaptcha(patch: Partial<NonNullable<FormField['captcha']>>) {
  const next = Object.fromEntries(Object.entries({ ...selectedField.value?.captcha, ...patch }).filter(([, value]) => value !== undefined && value !== ''))
  patchField({ captcha: next })
}

// One short line for the canvas: markdown blocks can be paragraphs long.
const summary = (field: FormField) => {
  const text = translate(field.type === 'markdown' ? field.content : field.label, locale.value)
    || (field.type === 'captcha' ? typeLabel('captcha') : field.key)
  const line = text.replace(/[*_`#>~[]|\]\([^)]*\)/g, '').replace(/\s+/g, ' ').trim()
  return line.length > 80 ? `${line.slice(0, 80).trimEnd()}…` : line
}
</script>

<template>
  <div class="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
    <!-- Canvas -->
    <div class="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-sm font-semibold">
          {{ t('builder.fieldsTitle', 'Form fields') }}
        </h2>
        <UFieldGroup size="xs">
          <UButton
            v-for="item in modeItems"
            :key="item.value"
            color="neutral"
            :variant="definition.mode === item.value ? 'solid' : 'outline'"
            :icon="item.icon"
            :label="item.label"
            :aria-label="`${t('builder.layout', 'Layout')}: ${item.label}`"
            @click="setMode(item.value as FormDefinition['mode'])"
          />
        </UFieldGroup>
      </div>

      <div
        class="space-y-3"
        @dragover.prevent
        @drop="drop"
      >
        <template
          v-for="(step, stepIndex) in definition.steps"
          :key="step.id"
        >
          <div
            v-if="stepped"
            class="insert-row"
          >
            <UButton
              class="insert-button"
              color="neutral"
              variant="soft"
              size="xs"
              icon="i-lucide-plus"
              :label="t('builder.addStep', 'Add step')"
              @click="addStep(stepIndex)"
              @dragover="dragged?.kind === 'step' && ($event.preventDefault(), slot = { kind: 'step', index: stepIndex })"
            />
          </div>
          <div class="min-w-0">
            <div
              v-if="stepped && showStepLine(stepIndex)"
              class="mb-2 h-1 rounded bg-primary"
            />
            <section
              class="rounded-lg border bg-default"
              :class="[
                selection?.kind === 'step' && selection.index === stepIndex ? 'border-primary ring-1 ring-primary' : 'border-default',
                dragged?.kind === 'step' && dragged.index === stepIndex ? 'opacity-40' : '',
              ]"
              @dragover="overStep($event, stepIndex)"
            >
              <header
                v-if="stepped"
                class="flex cursor-pointer items-center gap-2 border-b border-default px-3 py-2"
                @click="selection = { kind: 'step', index: stepIndex }"
              >
                <span
                  draggable="true"
                  class="cursor-grab text-muted active:cursor-grabbing"
                  :title="t('builder.dragStep', 'Drag to reorder steps')"
                  @dragstart.stop="startDrag($event, { kind: 'step', index: stepIndex })"
                  @dragend="endDrag"
                >
                  <UIcon
                    name="i-lucide-grip-vertical"
                    class="size-4"
                  />
                </span>
                <span class="flex-1 truncate text-sm font-semibold">
                  {{ stepIndex + 1 }}. {{ translate(step.title, locale) || step.id }}
                </span>
                <UBadge
                  v-if="step.showIf"
                  color="neutral"
                  variant="subtle"
                  size="sm"
                  :label="t('builder.conditionalBadge', 'Conditional')"
                />
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  icon="i-lucide-chevron-up"
                  :disabled="stepIndex === 0"
                  :aria-label="t('builder.moveUp', 'Move up')"
                  @click.stop="nudgeStep(stepIndex, -1)"
                />
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  icon="i-lucide-chevron-down"
                  :disabled="stepIndex === definition.steps.length - 1"
                  :aria-label="t('builder.moveDown', 'Move down')"
                  @click.stop="nudgeStep(stepIndex, 1)"
                />
                <UButton
                  color="error"
                  variant="ghost"
                  size="xs"
                  icon="i-lucide-trash-2"
                  :disabled="definition.steps.length === 1"
                  :aria-label="t('builder.deleteStep', 'Delete step')"
                  @click.stop="deleteStep(stepIndex)"
                />
              </header>

              <aside
                v-if="stepped && selectedStep && selection?.kind === 'step' && selection.index === stepIndex"
                class="space-y-4 border-b border-default bg-elevated/40 p-3"
              >
                <h3 class="font-semibold">
                  {{ t('builder.step', 'Step') }}
                </h3>
                <UFormField :label="t('builder.stepTitle', 'Title')">
                  <FormBuilderText
                    :model-value="selectedStep.title"
                    @update:model-value="patchStep({ title: $event })"
                  />
                </UFormField>
                <UFormField :label="t('builder.description', 'Help text')">
                  <FormBuilderText
                    :model-value="selectedStep.description"
                    @update:model-value="patchStep({ description: $event })"
                  />
                </UFormField>
                <FormBuilderCondition
                  :model-value="selectedStep.showIf"
                  :fields="conditionFields(selection.index, 0)"
                  @update:model-value="patchStep({ showIf: $event })"
                />
              </aside>

              <div
                class="min-h-12 p-2"
                @dragover="overStepBody($event, stepIndex)"
              >
                <template
                  v-for="(field, fieldIndex) in step.fields"
                  :key="fieldIndex"
                >
                  <div class="insert-row">
                    <UDropdownMenu
                      :items="insertItems({ step: stepIndex, index: fieldIndex })"
                      :content="{ align: 'center' }"
                    >
                      <UButton
                        class="insert-button insert-dot"
                        color="neutral"
                        variant="soft"
                        size="xs"
                        icon="i-lucide-plus"
                        :aria-label="t('builder.insertField', 'Insert field here')"
                      />
                    </UDropdownMenu>
                    <div
                      v-if="showLine(stepIndex, fieldIndex)"
                      class="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded bg-primary"
                    />
                  </div>
                  <div
                    draggable="true"
                    class="group flex cursor-pointer items-center gap-2 rounded-md border px-2 py-2 hover:bg-elevated"
                    :class="[
                      isSelected(stepIndex, fieldIndex) ? 'border-primary bg-elevated' : 'border-default',
                      dragged?.kind === 'field' && dragged.from.step === stepIndex && dragged.from.index === fieldIndex ? 'opacity-40' : '',
                    ]"
                    @click="selection = { kind: 'field', at: { step: stepIndex, index: fieldIndex } }"
                    @dragstart.stop="startDrag($event, { kind: 'field', from: { step: stepIndex, index: fieldIndex } })"
                    @dragend="endDrag"
                    @dragover="overField($event, stepIndex, fieldIndex)"
                  >
                    <UIcon
                      name="i-lucide-grip-vertical"
                      class="size-4 shrink-0 cursor-grab text-muted"
                    />
                    <UIcon
                      :name="typeIcons[field.type]"
                      class="size-4 shrink-0 text-muted"
                    />
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-sm font-medium">
                        {{ summary(field) }}<span
                          v-if="field.required"
                          class="text-error"
                        > *</span>
                      </p>
                      <p class="truncate text-xs text-muted">
                        {{ typeLabel(field.type) }} · {{ field.key }}
                      </p>
                    </div>
                    <UBadge
                      v-if="field.showIf"
                      color="neutral"
                      variant="subtle"
                      size="sm"
                      :label="t('builder.conditionalBadge', 'Conditional')"
                    />
                    <div class="flex shrink-0 opacity-0 focus-within:opacity-100 group-hover:opacity-100">
                      <UButton
                        color="neutral"
                        variant="ghost"
                        size="xs"
                        icon="i-lucide-chevron-up"
                        :aria-label="t('builder.moveUp', 'Move up')"
                        @click.stop="nudge({ step: stepIndex, index: fieldIndex }, -1)"
                      />
                      <UButton
                        color="neutral"
                        variant="ghost"
                        size="xs"
                        icon="i-lucide-chevron-down"
                        :aria-label="t('builder.moveDown', 'Move down')"
                        @click.stop="nudge({ step: stepIndex, index: fieldIndex }, 1)"
                      />
                      <UButton
                        color="neutral"
                        variant="ghost"
                        size="xs"
                        icon="i-lucide-copy"
                        :aria-label="t('builder.duplicate', 'Duplicate')"
                        @click.stop="copyField({ step: stepIndex, index: fieldIndex })"
                      />
                      <UButton
                        color="error"
                        variant="ghost"
                        size="xs"
                        icon="i-lucide-trash-2"
                        :aria-label="t('builder.delete', 'Delete')"
                        @click.stop="removeAtField({ step: stepIndex, index: fieldIndex })"
                      />
                    </div>
                  </div>
                  <aside
                    v-if="selectedField && isSelected(stepIndex, fieldIndex) && selection?.kind === 'field'"
                    class="my-1 space-y-4 rounded-md border border-primary/40 bg-elevated/40 p-3"
                  >
                    <h3 class="font-semibold">
                      {{ typeLabel(selectedField.type) }}
                    </h3>

                    <UFormField
                      v-if="selectedField.type === 'markdown'"
                      :label="t('builder.content', 'Text (Markdown)')"
                    >
                      <FormBuilderText
                        :model-value="selectedField.content"
                        multiline
                        @update:model-value="patchField({ content: $event })"
                      />
                    </UFormField>
                    <template v-else-if="selectedField.type === 'captcha' && selectedCaptcha">
                      <UFormField :label="t('captcha.provider', 'Provider')">
                        <USelect
                          :model-value="selectedCaptcha.provider"
                          :items="captchaProviderItems"
                          class="w-full"
                          @update:model-value="patchCaptcha({ provider: $event })"
                        />
                      </UFormField>
                      <UAlert
                        v-if="captchaKeyMissing"
                        color="warning"
                        variant="subtle"
                        icon="i-lucide-triangle-alert"
                        :title="t('captcha.missingKey', 'The {provider} captcha has no site key configured.', { provider: t(`captcha.providers.${selectedCaptcha.provider}`, selectedCaptcha.provider) })"
                        :ui="{ description: 'break-words' }"
                        :description="t('captcha.missingKeyHint', 'Set the site key below or the NUXT_PUBLIC_FORMS_CAPTCHA_PROVIDER_SITE_KEY environment variable. Submissions also need the matching secret key on the server.')"
                      />
                      <UFormField
                        :label="t('captcha.siteKey', 'Site key')"
                        :description="t('captcha.siteKeyHint', 'Public key of this site. Leave empty to use the one configured for the provider.')"
                      >
                        <UInput
                          :model-value="selectedCaptcha.siteKey"
                          class="w-full font-mono"
                          @update:model-value="patchCaptcha({ siteKey: String($event).trim() })"
                        />
                      </UFormField>
                      <UFormField
                        v-if="formId"
                        :label="t('captcha.secretLabel', 'Secret key')"
                        :description="t('captcha.secretHint', 'Server-side key used to verify this form. Stored encrypted and never shown again. Without one, the environment variable is used.')"
                      >
                        <p
                          class="mb-2 flex gap-1 text-sm"
                          data-testid="captcha-secret-status"
                        >
                          <span class="text-muted">{{ t('captcha.secretStatus', 'Secret key') }}:</span>
                          <span :class="secretSource === 'unset' ? 'text-warning' : 'text-success'">{{ secretStatusLabel }}</span>
                        </p>
                        <UAlert
                          v-if="secrets?.unreadable"
                          color="warning"
                          variant="subtle"
                          icon="i-lucide-triangle-alert"
                          class="mb-2"
                          :title="t('captcha.secretUnreadable', 'The stored secrets of this form cannot be decrypted because the encryption key changed. Enter them again.')"
                        />
                        <form
                          class="flex gap-2"
                          @submit.prevent="saveSecret"
                        >
                          <UInput
                            v-model="secretValue"
                            type="password"
                            autocomplete="new-password"
                            class="min-w-0 flex-1 font-mono"
                            :placeholder="secretSource === 'form' ? t('captcha.secretPlaceholderSet', 'Enter a new secret key to replace it') : t('captcha.secretPlaceholder', 'Paste the secret key')"
                          />
                          <UButton
                            type="submit"
                            :loading="savingSecret"
                            :disabled="!secretValue.trim()"
                            :label="t('captcha.secretSave', 'Save secret')"
                          />
                          <UButton
                            v-if="secretSource === 'form'"
                            type="button"
                            color="error"
                            variant="outline"
                            :label="t('captcha.secretRemove', 'Remove')"
                            @click="removeSecret"
                          />
                        </form>
                        <p class="mt-1 text-xs text-muted">
                          {{ t('captcha.secretImmediate', 'Saved immediately, independent of the form Save.') }}
                        </p>
                      </UFormField>
                      <div class="grid grid-cols-2 gap-2">
                        <UFormField :label="t('captcha.theme', 'Theme')">
                          <USelect
                            :model-value="selectedCaptcha.theme ?? 'auto'"
                            :items="captchaThemeItems"
                            class="w-full"
                            @update:model-value="patchCaptcha({ theme: $event === 'auto' ? undefined : $event })"
                          />
                        </UFormField>
                        <UFormField :label="t('captcha.size', 'Size')">
                          <USelect
                            :model-value="selectedCaptcha.size ?? 'normal'"
                            :items="captchaSizeItems"
                            class="w-full"
                            @update:model-value="patchCaptcha({ size: $event === 'normal' ? undefined : $event })"
                          />
                        </UFormField>
                      </div>
                      <p class="text-sm text-muted">
                        {{ t('captcha.hint', 'Always required while visible. The token is checked on the server and never stored. Submissions with an API token skip it.') }}
                      </p>
                    </template>
                    <template v-else>
                      <UFormField :label="t('builder.label', 'Label')">
                        <FormBuilderText
                          :model-value="selectedField.label"
                          @update:model-value="patchField({ label: $event })"
                        />
                      </UFormField>
                      <UFormField :label="t('builder.description', 'Help text')">
                        <FormBuilderText
                          :model-value="selectedField.description"
                          @update:model-value="patchField({ description: $event })"
                        />
                      </UFormField>
                      <UFormField
                        v-if="hasPlaceholder"
                        :label="t('builder.placeholder', 'Placeholder')"
                      >
                        <FormBuilderText
                          :model-value="selectedField.placeholder"
                          @update:model-value="patchField({ placeholder: $event })"
                        />
                      </UFormField>
                      <USwitch
                        :model-value="!!selectedField.required"
                        :label="t('builder.required', 'Required')"
                        @update:model-value="patchField({ required: $event === true || undefined })"
                      />
                      <template v-if="selectedField.type === 'tel'">
                        <UFormField :label="t('builder.phoneMode', 'Phone input')">
                          <USelect
                            :model-value="selectedField.phone?.mode ?? 'simple'"
                            :items="phoneModeItems"
                            class="w-full"
                            @update:model-value="setPhoneMode($event as 'simple' | 'country')"
                          />
                        </UFormField>
                        <template v-if="selectedField.phone?.mode === 'country'">
                          <UFormField
                            :label="t('builder.phoneCountries', 'Allowed countries')"
                            :description="t('builder.phoneCountriesHint', 'Leave empty to allow all countries.')"
                          >
                            <USelectMenu
                              :model-value="selectedField.phone?.countries ?? []"
                              :items="phoneCountryItems"
                              value-key="value"
                              multiple
                              class="w-full"
                              @update:model-value="patchPhone({ countries: ($event as string[]).length ? $event as string[] : undefined })"
                            />
                          </UFormField>
                          <UFormField :label="t('builder.phoneDefaultCountry', 'Default country')">
                            <USelectMenu
                              :model-value="defaultPhoneCountry(selectedField.phone)"
                              :items="phoneCountryItems.filter(item => offeredCountries.has(item.value))"
                              value-key="value"
                              class="w-full"
                              @update:model-value="patchPhone({ defaultCountry: $event as string })"
                            />
                          </UFormField>
                        </template>
                      </template>
                      <USwitch
                        v-if="selectedField.type === 'file'"
                        :model-value="!!selectedField.multiple"
                        :label="t('builder.multiple', 'Allow several files')"
                        @update:model-value="patchField({ multiple: $event === true || undefined })"
                      />
                    </template>

                    <UFormField
                      :label="t('builder.key', 'Key')"
                      :description="t('builder.keyHint', 'Identifies the answer. Letters, digits and underscores.')"
                    >
                      <UInput
                        :model-value="selectedField.key"
                        class="w-full font-mono"
                        @update:model-value="renameKey(String($event))"
                      />
                    </UFormField>

                    <div
                      v-if="hasOptions"
                      class="space-y-2"
                    >
                      <h4 class="text-sm font-medium">
                        {{ t('builder.options', 'Options') }}
                      </h4>
                      <div
                        v-for="(option, optionIndex) in selectedField.options"
                        :key="optionIndex"
                        class="space-y-1 rounded-md border border-default p-2"
                      >
                        <FormBuilderText
                          :model-value="option.label"
                          :placeholder="t('builder.label', 'Label')"
                          @update:model-value="setOption(optionIndex, { label: $event ?? '' })"
                        />
                        <UInput
                          :model-value="option.value"
                          :placeholder="t('builder.value', 'Value')"
                          class="w-full font-mono"
                          @update:model-value="setOption(optionIndex, { value: String($event) })"
                        />
                        <div class="flex justify-end">
                          <UButton
                            color="neutral"
                            variant="ghost"
                            size="xs"
                            icon="i-lucide-chevron-up"
                            :disabled="optionIndex === 0"
                            :aria-label="t('builder.moveUp', 'Move up')"
                            @click="moveOption(optionIndex, -1)"
                          />
                          <UButton
                            color="neutral"
                            variant="ghost"
                            size="xs"
                            icon="i-lucide-chevron-down"
                            :disabled="optionIndex === (selectedField.options?.length ?? 0) - 1"
                            :aria-label="t('builder.moveDown', 'Move down')"
                            @click="moveOption(optionIndex, 1)"
                          />
                          <UButton
                            color="error"
                            variant="ghost"
                            size="xs"
                            icon="i-lucide-x"
                            :aria-label="t('builder.delete', 'Delete')"
                            @click="patchField({ options: selectedField.options?.filter((_, i) => i !== optionIndex) })"
                          />
                        </div>
                      </div>
                      <UButton
                        color="neutral"
                        variant="outline"
                        size="xs"
                        icon="i-lucide-plus"
                        :label="t('builder.addOption', 'Add option')"
                        @click="addOption"
                      />
                    </div>

                    <div
                      v-if="hasLength || selectedField.type === 'number'"
                      class="grid grid-cols-2 gap-2"
                    >
                      <template v-if="selectedField.type === 'number'">
                        <UFormField :label="t('builder.min', 'Minimum')">
                          <UInputNumber
                            :model-value="selectedField.validation?.min"
                            class="w-full"
                            @update:model-value="setValidation('min', $event)"
                          />
                        </UFormField>
                        <UFormField :label="t('builder.max', 'Maximum')">
                          <UInputNumber
                            :model-value="selectedField.validation?.max"
                            class="w-full"
                            @update:model-value="setValidation('max', $event)"
                          />
                        </UFormField>
                      </template>
                      <template v-else>
                        <UFormField :label="t('builder.minLength', 'Min length')">
                          <UInputNumber
                            :model-value="selectedField.validation?.minLength"
                            :min="0"
                            class="w-full"
                            @update:model-value="setValidation('minLength', $event)"
                          />
                        </UFormField>
                        <UFormField :label="t('builder.maxLength', 'Max length')">
                          <UInputNumber
                            :model-value="selectedField.validation?.maxLength"
                            :min="1"
                            class="w-full"
                            @update:model-value="setValidation('maxLength', $event)"
                          />
                        </UFormField>
                      </template>
                    </div>

                    <UFormField
                      v-if="stepped"
                      :label="t('builder.step', 'Step')"
                    >
                      <USelect
                        :model-value="selection.at.step"
                        :items="definition.steps.map((s, i) => ({ value: i, label: `${i + 1}. ${translate(s.title, locale) || s.id}` }))"
                        class="w-full"
                        @update:model-value="moveToStep(Number($event))"
                      />
                    </UFormField>

                    <FormBuilderCondition
                      :model-value="selectedField.showIf"
                      :fields="conditionFields(selection.at.step, selection.at.index)"
                      @update:model-value="patchField({ showIf: $event })"
                    />
                  </aside>
                </template>
                <div class="insert-row">
                  <UDropdownMenu
                    :items="insertItems({ step: stepIndex, index: step.fields.length })"
                    :content="{ align: 'center' }"
                  >
                    <UButton
                      class="insert-button"
                      :class="step.fields.length ? 'insert-dot' : 'insert-button-visible'"
                      color="neutral"
                      variant="soft"
                      size="xs"
                      icon="i-lucide-plus"
                      :aria-label="t('builder.insertField', 'Insert field here')"
                      :label="step.fields.length ? undefined : t('builder.addField', 'Add field')"
                    />
                  </UDropdownMenu>
                  <div
                    v-if="showLine(stepIndex, step.fields.length)"
                    class="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded bg-primary"
                  />
                </div>
              </div>
            </section>
          </div>
        </template>
        <div
          v-if="stepped && showStepLine(definition.steps.length)"
          class="h-1 rounded bg-primary"
        />

        <div
          v-if="stepped"
          class="flex justify-center"
        >
          <UButton
            color="neutral"
            variant="soft"
            size="xs"
            icon="i-lucide-plus"
            :label="t('builder.addStep', 'Add step')"
            @click="addStep()"
            @dragover="dragged?.kind === 'step' && ($event.preventDefault(), slot = { kind: 'step', index: definition.steps.length })"
          />
        </div>
      </div>

      <p
        v-if="!selection"
        class="text-center text-xs text-muted"
      >
        {{ t('builder.selectHint', 'Select a field or step to edit its settings.') }}
      </p>
    </div>

    <!-- Live preview -->
    <div class="min-w-0 space-y-2 lg:sticky lg:top-4">
      <h2 class="text-sm font-semibold">
        {{ t('admin.preview', 'Preview') }}
      </h2>
      <slot name="preview" />
    </div>
  </div>
</template>

<style scoped>
.insert-row {
  position: relative;
  display: flex;
  width: 100%;
  height: 1rem;
  align-items: center;
  justify-content: center;
}
.insert-row::before {
  content: '';
  position: absolute;
  inset-inline: 0;
  top: 50%;
  border-top: 1px dashed var(--ui-border-accented);
  opacity: 0;
  transition: opacity 0.15s;
}
.insert-button {
  position: relative;
  opacity: 0.35;
  transition: opacity 0.15s;
}
/* Small round dot that grows a little when pointed at. */
.insert-dot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 1rem;
  height: 1rem;
  min-width: 0;
  padding: 0;
  gap: 0;
  line-height: 0;
  border-radius: 9999px;
  transition: opacity 0.15s, transform 0.15s;
}
.insert-dot :deep(.iconify) {
  display: block;
  flex: none;
  width: 0.75rem;
  height: 0.75rem;
  margin: 0;
}
/* Touch / small screens: a bigger target that is always clearly visible. */
@media (hover: none), (pointer: coarse), (max-width: 640px) {
  .insert-row { height: 2rem; }
  .insert-dot { width: 1.75rem; height: 1.75rem; opacity: 1; }
  .insert-dot :deep(.iconify) { width: 1rem; height: 1rem; }
  .insert-dot:hover, .insert-dot:focus-visible { transform: scale(1.15); }
}
.insert-dot:hover,
.insert-dot:focus-visible {
  transform: scale(1.6);
}
.insert-row:hover::before,
.insert-row:focus-within::before {
  opacity: 1;
}
.insert-row:hover .insert-button,
.insert-row:focus-within .insert-button,
.insert-button-visible {
  opacity: 1;
}
@media (hover: none) {
  .insert-row::before { opacity: 1; }
  .insert-button { opacity: 1; }
}
</style>
