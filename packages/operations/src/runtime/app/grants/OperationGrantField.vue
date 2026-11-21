<script setup lang="ts">
import { computed, useFetch, useModuleT } from '#imports'
import { operationsApi } from '../../utils/api'
import { useOperationsTranslate } from '../composables/useOperationsTranslate'
import type { AdminOperationDto, OperationGrant } from '../../../types'

defineOptions({ name: 'OperationGrantField' })

// The field of the `operation` grant kind in `<GrantsEditor>`: the people who take part in one operation.
defineProps<{ disabled?: boolean }>()
const model = defineModel<OperationGrant>({ required: true })
const t = useModuleT('operations')
const tr = useOperationsTranslate()

const { data } = useFetch<{ items: AdminOperationDto[] }>(operationsApi.admin.operations, {
  key: 'operations:grant-options',
  query: { pageSize: 100 },
  server: false,
  lazy: true,
  default: () => ({ items: [] }),
})
// A stored operation that is not in the list (deleted, or past the first 100) stays selectable by its id.
const items = computed(() => {
  const known = (data.value?.items ?? []).map(operation => ({ label: tr(operation.name), value: operation.id }))
  const current = model.value.operationId
  return current && !known.some(item => item.value === current) ? [...known, { label: current, value: current }] : known
})
</script>

<template>
  <USelectMenu
    :model-value="model.operationId"
    :items="items"
    value-key="value"
    class="w-full"
    :disabled="disabled"
    :placeholder="t('grants.choose', 'Choose an operation')"
    @update:model-value="(value: string) => (model = { kind: 'operation', operationId: value })"
  />
</template>
