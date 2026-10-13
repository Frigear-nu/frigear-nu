import type { FormDefinition, FormField, FormStep, FieldType } from '../../../types'
import type { FieldPosition } from '../../utils'
import {
  changeMode, createField, createStep, dropIndex, duplicateField, insertField, insertStep, moveField, moveStep,
  removeField, removeStep, renameFieldKey, updateField, updateStep,
} from '../../utils'
import { useConfirmDialog } from '@frigear-nu/ui/composables'

export type BuilderSelection = { kind: 'field', at: FieldPosition } | { kind: 'step', index: number }

type Dragged
  = | { kind: 'field', from: FieldPosition }
    | { kind: 'step', index: number }
type DropSlot = { kind: 'field', step: number, index: number } | { kind: 'step', index: number }

/**
 * State and edit actions of the form builder: what is selected, drag and drop reordering and every change to
 * the definition. All edits go through the `definition` model, so the builder stays a pure v-model component.
 */
export function useFormBuilderEditor(definition: Ref<FormDefinition>) {
  const t = useModuleT('forms')
  const confirm = useConfirmDialog()

  // ---- selection -----------------------------------------------------------------------------

  const selection = ref<BuilderSelection>()

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
  const isStepSelected = (index: number) => selection.value?.kind === 'step' && selection.value.index === index

  const selectField = (at: FieldPosition) => {
    selection.value = { kind: 'field', at }
  }
  const selectStep = (index: number) => {
    selection.value = { kind: 'step', index }
  }

  // ---- drag and drop -------------------------------------------------------------------------

  const dragged = ref<Dragged>()
  const slot = ref<DropSlot>()

  function startFieldDrag(event: DragEvent, from: FieldPosition) {
    startDrag(event, { kind: 'field', from })
  }

  function startStepDrag(event: DragEvent, index: number) {
    startDrag(event, { kind: 'step', index })
  }

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

  /** Dragging a step over an "add step" button targets the slot right before (or at the end of) the steps. */
  function overStepSlot(event: DragEvent, index: number) {
    if (dragged.value?.kind !== 'step') return
    event.preventDefault()
    slot.value = { kind: 'step', index }
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

  const isFieldDragged = (step: number, index: number) =>
    dragged.value?.kind === 'field' && dragged.value.from.step === step && dragged.value.from.index === index
  const isStepDragged = (index: number) => dragged.value?.kind === 'step' && dragged.value.index === index
  const showLine = (step: number, index: number) =>
    slot.value?.kind === 'field' && slot.value.step === step && slot.value.index === index
  const showStepLine = (index: number) => slot.value?.kind === 'step' && slot.value.index === index

  // ---- edits ---------------------------------------------------------------------------------

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

  /** Fields a condition at the given position may look at: input fields before it, in definition order. */
  function conditionFields(step: number, index: number) {
    return definition.value.steps.flatMap((s, si) =>
      si > step ? [] : s.fields.slice(0, si === step ? index : undefined).filter(f => f.type !== 'markdown' && f.type !== 'captcha').map(f => f.key))
  }

  return {
    selection, selectedField, selectedStep, isSelected, isStepSelected, selectField, selectStep,
    dragged, slot, startFieldDrag, startStepDrag, endDrag, overField, overStepBody, overStep, overStepSlot, drop,
    isFieldDragged, isStepDragged, showLine, showStepLine,
    addField, addStep, removeAtField, copyField, nudge, nudgeStep, deleteStep, patchField, renameKey, patchStep, moveToStep,
    setMode, conditionFields,
  }
}
