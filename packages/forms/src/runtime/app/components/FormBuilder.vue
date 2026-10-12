<script setup lang="ts">
import type { FieldOption, FieldType, FormDefinition, FormField, FormStep } from '../../../types'
import {
  arrayMove, changeMode, createField, createStep, dropIndex, duplicateField, fieldTypes, insertField, moveField, moveStep,
  removeField, removeStep, translate, updateField, updateStep,
} from '../../utils'
import type { FieldPosition } from '../../utils'
import { useFormsLocale } from '../composables/useForms'

const definition = defineModel<FormDefinition>({ required: true })

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
}
const typeLabel = (type: FieldType) => t(`builder.types.${type}`, typeNames[type])

const stepped = computed(() => definition.value.mode === 'stepped')

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
    | { kind: 'new', type: FieldType }
type DropSlot = { kind: 'field', step: number, index: number } | { kind: 'step', index: number }

const dragged = ref<Dragged>()
const slot = ref<DropSlot>()

function startDrag(event: DragEvent, payload: Dragged) {
  dragged.value = payload
  if (!event.dataTransfer) return
  event.dataTransfer.effectAllowed = payload.kind === 'new' ? 'copy' : 'move'
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
  else if (to.kind === 'field' && from.kind === 'new') {
    addField(from.type, { step: to.step, index: to.index })
  }
}

const showLine = (step: number, index: number) =>
  slot.value?.kind === 'field' && slot.value.step === step && slot.value.index === index
const showStepLine = (index: number) => slot.value?.kind === 'step' && slot.value.index === index

// ---- edits -----------------------------------------------------------------------------------

function addField(type: FieldType, at?: FieldPosition) {
  const stepIndex = at?.step
    ?? (selection.value?.kind === 'field' ? selection.value.at.step : selection.value?.kind === 'step' ? selection.value.index : definition.value.steps.length - 1)
  const target = at ?? { step: stepIndex, index: definition.value.steps[stepIndex]?.fields.length ?? 0 }
  definition.value = insertField(definition.value, target, createField(definition.value, type))
  selection.value = { kind: 'field', at: target }
}

function addStep() {
  definition.value = { ...definition.value, steps: [...definition.value.steps, createStep(definition.value)] }
  selection.value = { kind: 'step', index: definition.value.steps.length - 1 }
}

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

function setMode(mode: FormDefinition['mode']) {
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
    si > step ? [] : s.fields.slice(0, si === step ? index : undefined).filter(f => f.type !== 'markdown').map(f => f.key))
}

const hasOptions = computed(() => selectedField.value?.type === 'select' || selectedField.value?.type === 'radio')
const hasPlaceholder = computed(() => !!selectedField.value && ['text', 'email', 'tel', 'number', 'textarea', 'select'].includes(selectedField.value.type))
const hasLength = computed(() => !!selectedField.value && ['text', 'email', 'tel', 'textarea'].includes(selectedField.value.type))

const summary = (field: FormField) =>
  translate(field.type === 'markdown' ? field.content : field.label, locale.value) || field.key
</script>

<template>
  <div class="grid items-start gap-4 lg:grid-cols-[14rem_minmax(20rem,26rem)_minmax(0,1fr)]">
    <!-- Palette -->
    <aside class="space-y-4 lg:sticky lg:top-4">
      <h2 class="text-sm font-semibold">
        {{ t('builder.paletteTitle', 'Add fields') }}
      </h2>
      <div class="space-y-1">
        <h3 class="text-xs font-semibold uppercase tracking-wide text-muted">
          {{ t('builder.layout', 'Layout') }}
        </h3>
        <div class="grid gap-1">
          <UButton
            :variant="stepped ? 'outline' : 'solid'"
            color="neutral"
            size="sm"
            icon="i-lucide-file"
            :label="t('admin.single', 'Single page')"
            @click="setMode('single')"
          />
          <UButton
            :variant="stepped ? 'solid' : 'outline'"
            color="neutral"
            size="sm"
            icon="i-lucide-layers"
            :label="t('admin.stepped', 'Stepped')"
            @click="setMode('stepped')"
          />
        </div>
      </div>

      <div class="space-y-1">
        <h3 class="text-xs font-semibold uppercase tracking-wide text-muted">
          {{ t('builder.fields', 'Fields') }}
        </h3>
        <p class="text-xs text-muted">
          {{ t('builder.paletteHint', 'Drag a field onto the form, or click to add it.') }}
        </p>
        <div class="grid grid-cols-2 gap-1 lg:grid-cols-1">
          <button
            v-for="type in fieldTypes"
            :key="type"
            type="button"
            draggable="true"
            class="flex cursor-grab items-center gap-2 rounded-md border border-default bg-default px-2.5 py-1.5 text-left text-sm hover:border-primary hover:bg-elevated active:cursor-grabbing"
            @dragstart="startDrag($event, { kind: 'new', type })"
            @dragend="endDrag"
            @click="addField(type)"
          >
            <UIcon
              :name="typeIcons[type]"
              class="size-4 shrink-0 text-muted"
            />
            {{ typeLabel(type) }}
          </button>
        </div>
      </div>
    </aside>

    <!-- Fields being edited: the list, then the settings of the selected one -->
    <div class="grid min-w-0 gap-4">
      <h2 class="text-sm font-semibold">
        {{ t('builder.fieldsTitle', 'Form fields') }}
      </h2>
      <!-- Canvas -->
      <div
        class="space-y-3"
        @dragover.prevent
        @drop="drop"
      >
        <div
          v-for="(step, stepIndex) in definition.steps"
          :key="step.id"
        >
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

            <div
              class="min-h-16 space-y-1 p-2"
              @dragover="overStepBody($event, stepIndex)"
            >
              <template
                v-for="(field, fieldIndex) in step.fields"
                :key="fieldIndex"
              >
                <div
                  v-if="showLine(stepIndex, fieldIndex)"
                  class="h-1 rounded bg-primary"
                />
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
              </template>
              <div
                v-if="showLine(stepIndex, step.fields.length)"
                class="h-1 rounded bg-primary"
              />
              <p
                v-if="!step.fields.length && !showLine(stepIndex, 0)"
                class="rounded-md border border-dashed border-default py-5 text-center text-sm text-muted"
              >
                {{ t('builder.emptyStep', 'Drop fields here') }}
              </p>
            </div>
          </section>
        </div>
        <div
          v-if="stepped && showStepLine(definition.steps.length)"
          class="h-1 rounded bg-primary"
        />

        <UButton
          v-if="stepped"
          color="neutral"
          variant="outline"
          icon="i-lucide-plus"
          block
          :label="t('builder.addStep', 'Add step')"
          @click="addStep"
          @dragover="dragged?.kind === 'step' && ($event.preventDefault(), slot = { kind: 'step', index: definition.steps.length })"
        />
      </div>

      <!-- Inspector -->
      <h2 class="text-sm font-semibold">
        {{ t('builder.settingsTitle', 'Settings') }}
      </h2>
      <aside class="space-y-4 rounded-lg border border-default p-4">
        <template v-if="selectedField && selection?.kind === 'field'">
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
              @update:model-value="patchField({ key: String($event) })"
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
        </template>

        <template v-else-if="selectedStep && selection?.kind === 'step'">
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
        </template>

        <p
          v-else
          class="text-sm text-muted"
        >
          {{ t('builder.selectHint', 'Select a field or step to edit its settings.') }}
        </p>
      </aside>
    </div>

    <!-- Live preview -->
    <div class="min-w-0 space-y-2 lg:sticky lg:top-4">
      <h2 class="text-sm font-semibold">
        {{ t('admin.preview', 'Preview') }}
      </h2>
      <div class="rounded-lg border border-default p-6">
        <slot name="preview" />
      </div>
    </div>
  </div>
</template>
