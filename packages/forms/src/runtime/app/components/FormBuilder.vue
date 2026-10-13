<script setup lang="ts">
import type { FormDefinition } from '../../../types'
import { fieldTypes } from '../../utils'
import type { FieldPosition } from '../../utils'
import { useCaptchaSecrets } from '../composables/useCaptchaSecrets'
import { useFormBuilderEditor } from '../composables/useFormBuilderEditor'
import { fieldTypeIcons, useFormBuilderLabels } from '../composables/useFormBuilderLabels'

const definition = defineModel<FormDefinition>({ required: true })
/** The saved form; enables per-form secrets (captcha secret key), which are stored right away, not with the definition. */
const props = defineProps<{ formId?: string }>()

const t = useModuleT('forms')
const { typeLabel } = useFormBuilderLabels()

const {
  selection, selectedField, selectedStep, isSelected, isStepSelected, selectField, selectStep,
  startFieldDrag, startStepDrag, endDrag, overField, overStepBody, overStep, overStepSlot, drop,
  isFieldDragged, isStepDragged, showLine, showStepLine,
  addField, addStep, removeAtField, copyField, nudge, nudgeStep, deleteStep, patchField, renameKey, patchStep, moveToStep,
  setMode, conditionFields,
} = useFormBuilderEditor(definition)
const secrets = useCaptchaSecrets(() => props.formId, selectedField)

const stepped = computed(() => definition.value.mode === 'stepped')
const modeItems = computed(() => [
  { value: 'single', label: t('admin.single', 'Single page'), icon: 'i-lucide-file' },
  { value: 'stepped', label: t('admin.stepped', 'Stepped'), icon: 'i-lucide-layers' },
])

/** Menu items for the "+" insertion rows: one entry per field type. */
const insertItems = (at: FieldPosition) => [fieldTypes.map(type => ({
  label: typeLabel(type),
  icon: fieldTypeIcons[type],
  onSelect: () => addField(type, at),
}))]
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
          <FormBuilderInsertRow
            v-if="stepped"
            :label="t('builder.addStep', 'Add step')"
            @click="addStep(stepIndex)"
            @dragover="overStepSlot($event, stepIndex)"
          />
          <div class="min-w-0">
            <div
              v-if="stepped && showStepLine(stepIndex)"
              class="mb-2 h-1 rounded bg-primary"
            />
            <section
              class="rounded-lg border bg-default"
              :class="[
                isStepSelected(stepIndex) ? 'border-primary ring-1 ring-primary' : 'border-default',
                isStepDragged(stepIndex) ? 'opacity-40' : '',
              ]"
              @dragover="overStep($event, stepIndex)"
            >
              <FormBuilderStepHeader
                v-if="stepped"
                :step="step"
                :index="stepIndex"
                :is-first="stepIndex === 0"
                :is-last="stepIndex === definition.steps.length - 1"
                :is-only="definition.steps.length === 1"
                @select="selectStep(stepIndex)"
                @dragstart="startStepDrag($event, stepIndex)"
                @dragend="endDrag"
                @up="nudgeStep(stepIndex, -1)"
                @down="nudgeStep(stepIndex, 1)"
                @remove="deleteStep(stepIndex)"
              />

              <FormBuilderStepSettings
                v-if="stepped && selectedStep && selection?.kind === 'step' && selection.index === stepIndex"
                :step="selectedStep"
                :condition-fields="conditionFields(selection.index, 0)"
                @patch="patchStep"
              />

              <div
                class="min-h-12 p-2"
                @dragover="overStepBody($event, stepIndex)"
              >
                <template
                  v-for="(field, fieldIndex) in step.fields"
                  :key="fieldIndex"
                >
                  <FormBuilderInsertRow
                    dot
                    :items="insertItems({ step: stepIndex, index: fieldIndex })"
                    :aria-label="t('builder.insertField', 'Insert field here')"
                    :line="showLine(stepIndex, fieldIndex)"
                  />
                  <FormBuilderFieldRow
                    :field="field"
                    :selected="isSelected(stepIndex, fieldIndex)"
                    :dragging="isFieldDragged(stepIndex, fieldIndex)"
                    @select="selectField({ step: stepIndex, index: fieldIndex })"
                    @dragstart="startFieldDrag($event, { step: stepIndex, index: fieldIndex })"
                    @dragend="endDrag"
                    @dragover="overField($event, stepIndex, fieldIndex)"
                    @up="nudge({ step: stepIndex, index: fieldIndex }, -1)"
                    @down="nudge({ step: stepIndex, index: fieldIndex }, 1)"
                    @duplicate="copyField({ step: stepIndex, index: fieldIndex })"
                    @remove="removeAtField({ step: stepIndex, index: fieldIndex })"
                  />
                  <FormBuilderFieldSettings
                    v-if="selectedField && isSelected(stepIndex, fieldIndex) && selection?.kind === 'field'"
                    :field="selectedField"
                    :at="selection.at"
                    :steps="stepped ? definition.steps : undefined"
                    :condition-fields="conditionFields(selection.at.step, selection.at.index)"
                    :form-id="formId"
                    :secrets="secrets"
                    @patch="patchField"
                    @rename="renameKey"
                    @move-to-step="moveToStep"
                  />
                </template>
                <FormBuilderInsertRow
                  :dot="step.fields.length > 0"
                  :visible="step.fields.length === 0"
                  :items="insertItems({ step: stepIndex, index: step.fields.length })"
                  :aria-label="t('builder.insertField', 'Insert field here')"
                  :label="step.fields.length ? undefined : t('builder.addField', 'Add field')"
                  :line="showLine(stepIndex, step.fields.length)"
                />
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
            @dragover="overStepSlot($event, definition.steps.length)"
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
