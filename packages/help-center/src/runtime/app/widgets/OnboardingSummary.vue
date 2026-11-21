<script setup lang="ts">
import { helpCenterApi } from '../../utils/api'
import type { HelpChecklistDto } from '../../../types'
import { computed, useHelpCenterPaths, useLazyFetch, useModuleT } from '#imports'

defineOptions({ name: 'HelpCenterOnboardingSummary' })

// "Your onboarding" for the `account.overview` widget area of the account area (`@frigear-nu/account`): how many of the
// required articles of the person's checklists they have read. It renders nothing while loading and when the person has
// no checklist, so the overview does not show an empty card for people with nothing to do.
const t = useModuleT('helpCenter.widget')
const paths = useHelpCenterPaths()

const { data, status } = useLazyFetch<HelpChecklistDto[]>(helpCenterApi.me.checklists, {
  key: 'help-center:widget:checklists',
  default: () => [],
  server: false,
  onResponseError: () => {},
})

const checklists = computed(() => data.value ?? [])
const required = computed(() => checklists.value.reduce((sum, checklist) => sum + checklist.requiredCount, 0))
const read = computed(() => checklists.value.reduce((sum, checklist) => sum + checklist.requiredReadCount, 0))
const finished = computed(() => required.value > 0 && read.value >= required.value)
</script>

<template>
  <StatCard
    v-if="status === 'pending' || checklists.length"
    :label="t('label', 'Your onboarding')"
    icon="i-lucide-list-checks"
    :to="paths.signedIn.index()"
    :loading="status === 'pending'"
    :value="finished ? t('done', 'All read') : t('progress', '{read} of {total} read', { read, total: required })"
    :hint="finished ? undefined : t('hint', 'Articles to read before you start')"
  />
</template>
