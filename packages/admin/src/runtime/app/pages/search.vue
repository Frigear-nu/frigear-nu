<script setup lang="ts">
import { adminApi } from '../../utils/api'
import type { AdminSearchReindexDto } from '../../utils/api'
import { ref, useConfirmDialog, useErrorToast, useModuleT, useToast } from '#imports'

defineOptions({ name: 'AdminSearchPage' })

const t = useModuleT('admin.searchIndex')
const confirm = useConfirmDialog()
const toast = useToast()
const showError = useErrorToast()
const busy = ref(false)

// Runs module-kit's `search:reindex` task: every indexed row is read and the rows whose search columns differ are
// rewritten. Safe to repeat; a second run rewrites nothing.
async function rebuild() {
  const ok = await confirm({
    title: t('confirm.title', 'Rebuild search?'),
    description: t('confirm.description', 'Every row of the searchable tables is read again, and its search columns are rewritten where they differ. On large tables it takes a while; search keeps working meanwhile.'),
    confirmText: t('action', 'Rebuild search'),
  })
  if (!ok) return
  busy.value = true
  try {
    const { tables } = await $fetch<AdminSearchReindexDto>(adminApi.search.reindex, { method: 'POST' })
    const updated = tables.reduce((sum, table) => sum + table.updated, 0)
    toast.add({
      title: t('done', 'Search rebuilt: {updated} rows updated', { updated }),
      description: tables
        .map(table => t('table', '{table}: {scanned} read, {updated} updated', { table: table.table, scanned: table.scanned, updated: table.updated }))
        .join(' · '),
      color: 'success',
      icon: 'i-lucide-check',
    })
  }
  catch (error) {
    showError(error, t('error', 'Could not rebuild search.'))
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <PageHeading
      :title="t('title', 'Search')"
      :description="t('description', 'Rebuild the search columns after an update.')"
    />
    <SectionCard :title="t('section', 'Search index')">
      <div class="divide-y divide-default">
        <FormRow
          :label="t('action', 'Rebuild search')"
          :description="t('hint', 'Run it once after a deploy whose notes ask for it, or when a search for a name with æ, ø or å misses records. It changes no data, only the columns search reads.')"
        >
          <UButton
            :label="t('action', 'Rebuild search')"
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="outline"
            :loading="busy"
            @click="rebuild"
          />
        </FormRow>
      </div>
    </SectionCard>
  </div>
</template>
