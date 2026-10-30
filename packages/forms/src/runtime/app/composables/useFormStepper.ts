import type { FormDefinition } from '../../../types'
import { buildFormSchema, resolveVisibility } from '../../utils'
import type { Answers, MessageTranslator } from '../../utils'
import { computed, ref, toValue } from '#imports'
import type { MaybeRefOrGetter } from '#imports'

/**
 * State machine for single page and stepped forms. Steps and fields that are hidden by `showIf`
 * are skipped, so `current` always refers to a visible step.
 */
export function useFormStepper(
  definition: MaybeRefOrGetter<FormDefinition>,
  answers: MaybeRefOrGetter<Answers>,
  options: { t?: MaybeRefOrGetter<MessageTranslator | undefined>, locale?: MaybeRefOrGetter<string> } = {},
) {
  const position = ref(0)
  const steps = computed(() => resolveVisibility(toValue(definition), toValue(answers)))
  const index = computed(() => Math.min(position.value, Math.max(steps.value.length - 1, 0)))
  const current = computed(() => steps.value[index.value])
  const isFirst = computed(() => index.value === 0)
  const isLast = computed(() => index.value >= steps.value.length - 1)
  const stepped = computed(() => toValue(definition).mode === 'stepped')

  /** Schema of the current step only (the server validates everything at once). */
  const schema = computed(() => buildFormSchema(toValue(definition), toValue(answers), {
    stepIndex: current.value?.index,
    t: toValue(options.t),
    locale: toValue(options.locale),
  }))

  return {
    steps,
    index,
    current,
    isFirst,
    isLast,
    stepped,
    schema,
    next: () => { if (!isLast.value) position.value = index.value + 1 },
    prev: () => { if (!isFirst.value) position.value = index.value - 1 },
    reset: (to = 0) => { position.value = to },
  }
}
