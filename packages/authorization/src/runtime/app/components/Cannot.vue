<script lang="ts" setup generic="A extends Ability">
import type { Ability, AbilityArgs } from '../../utils'
import { allows } from '../composables/useAuthorization'
import { ref, watchEffect } from '#imports'

const props = defineProps<{
  ability: A
  args?: AbilityArgs<A>
}>()

const resolve = async () => !(await allows(props.ability, ...((props.args ?? []) as AbilityArgs<A>)))

const cannot = ref(await resolve())

watchEffect(async () => {
  cannot.value = await resolve()
})
</script>

<template>
  <slot v-if="cannot" />
</template>
