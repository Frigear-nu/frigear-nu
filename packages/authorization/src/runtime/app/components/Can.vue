<script lang="ts" setup generic="A extends Ability">
import type { Ability, AbilityArgs } from '../../utils'
import { allows } from '../composables/useAuthorization'
import { ref, watchEffect } from '#imports'

const props = defineProps<{
  /** One ability, or several that must all pass. */
  ability: A | A[]
  /** Arguments for the ability (an array of argument arrays when `ability` is an array). */
  args?: AbilityArgs<A> | AbilityArgs<A>[]
}>()

async function resolve() {
  if (Array.isArray(props.ability)) {
    const results = await Promise.all(props.ability.map((ability, index) => allows(ability, ...((props.args as unknown[][] | undefined)?.[index] ?? []) as AbilityArgs<A>)))
    return results.every(Boolean)
  }
  return allows(props.ability, ...((props.args ?? []) as AbilityArgs<A>))
}

const can = ref(await resolve())

// `watchEffect` does not run on the server, hence the initial value above.
watchEffect(async () => {
  can.value = await resolve()
})
</script>

<template>
  <slot v-if="can" />
  <slot
    v-else
    name="fallback"
  />
</template>
