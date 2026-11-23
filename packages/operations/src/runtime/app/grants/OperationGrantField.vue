<script setup lang="ts">
import { computed, useFetch, useModuleT } from '#imports'
import { operationsApi } from '../../utils/api'
import { useOperationsTranslate } from '../composables/useOperationsTranslate'
import type { AdminOperationDto, OperationGrant } from '../../../types'

defineOptions({ name: 'OperationGrantField' })

// The field of the `operation` grant kind in `<GrantsEditor>`: the people who take part in one operation. The options
// come from the staff list (`GET /api/admin/operations`, `operations:manage`), so only operations managers can pick an
// operation: anyone else editing grants (`faq:manage`, say) gets an empty list, and an existing grant keeps its id. This
// is on purpose: who takes part in which operation is the operations staff's call. The first 100 operations are listed.
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
