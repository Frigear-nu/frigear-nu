<script setup lang="ts">
import type { StaffOperation } from '../../../../src/runtime/app/utils/admin-operation'

defineOptions({ name: 'OperationsTestTab' })

// A tab another module adds to `admin.operations`: it receives the `operation` of the page's context.
defineProps<{ operation: StaffOperation }>()
</script>

<template>
  <SectionCard title="Extra section">
    <p data-test="extra-tab">
      Added by another module for {{ operation.slug }}
    </p>
  </SectionCard>
</template>
