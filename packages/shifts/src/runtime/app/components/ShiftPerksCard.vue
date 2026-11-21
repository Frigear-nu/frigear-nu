<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { ShiftsTeamOption } from '../utils/admin-shifts'
import { shiftsApi } from '../../utils/api'
import type { ShiftPerkDto } from '../../../types'
import { computed, h, resolveComponent, tableUi, useFetch, useModuleT, useShiftsActions, useShiftsTranslate } from '#imports'

defineOptions({ name: 'ShiftPerksCard' })

// The perks of an operation (meal and drink vouchers) in the Shifts tab: what each is, for which team, its allowance and
// how often it was redeemed.
const props = defineProps<{ operationId: string, teams: ShiftsTeamOption[] }>()

const t = useModuleT('shifts')
const tr = useShiftsTranslate()
const actions = useShiftsActions()

const { data: perks, status, refresh } = await useFetch<ShiftPerkDto[]>(() => shiftsApi.admin.perks(props.operationId), {
  key: computed(() => `shifts:perks:${props.operationId}`),
  default: () => [],
})

async function add() {
  if (await actions.createPerk(props.operationId, props.teams)) await refresh()
}

const RowMenu = resolveComponent('RowMenu')
const kindLabel = (kind: ShiftPerkDto['kind']) => t(`perks.kinds.${kind}`, kind === 'meal' ? 'Meal' : kind === 'drink' ? 'Drink' : 'Other')
const teamName = (id: string | null) => {
  const team = id ? props.teams.find(item => item.id === id) : undefined
  return team ? tr(team.name) : t('admin.allTeams', 'All teams')
}
const columns = computed<TableColumn<ShiftPerkDto>[]>(() => [
  { accessorKey: 'name', header: t('admin.name', 'Name'), cell: ({ row }) => h('span', { class: 'text-highlighted font-medium' }, tr(row.original.name)) },
  { accessorKey: 'kind', header: t('perks.kind', 'Kind'), cell: ({ row }) => kindLabel(row.original.kind) },
  { accessorKey: 'teamId', header: t('admin.team', 'Team'), cell: ({ row }) => teamName(row.original.teamId) },
  {
    id: 'allowance',
    header: t('perks.allowance', 'Allowance'),
    cell: ({ row }) => row.original.perShift != null
      ? t('perks.allowancePerShift', '{count} per shift', { count: row.original.perShift })
      : t('perks.allowancePerPerson', '{count} per person', { count: row.original.perPerson ?? 0 }),
  },
  { accessorKey: 'redeemed', header: t('perks.redeemed', 'Redeemed'), cell: ({ row }) => String(row.original.redeemed ?? 0) },
  {
    id: 'actions',
    meta: { class: { th: 'w-0', td: 'w-0' } },
    cell: ({ row }) => h(RowMenu, { items: actions.perkMenu(row.original, { teams: props.teams, changed: refresh }), subject: tr(row.original.name) }),
  },
])
</script>

<template>
  <TableCard
    :title="t('perks.title', 'Perks')"
    :description="t('perks.cardDescription', 'Meal and drink vouchers. A lead hands one out by scanning the volunteer\'s check-in pass in redeem mode.')"
    :loading="status === 'pending' && !perks.length"
  >
    <template #actions>
      <UButton
        icon="i-lucide-plus"
        :label="t('perks.create', 'Add perk')"
        @click="add"
      />
    </template>
    <UTable
      :data="perks"
      :columns="columns"
      :ui="tableUi()"
    >
      <template #empty>
        <UEmpty
          icon="i-lucide-utensils"
          :title="t('perks.empty', 'No perks yet')"
          :description="t('perks.emptyDescription', 'Add a meal voucher, for example one per shift.')"
          :actions="[{ label: t('perks.create', 'Add perk'), icon: 'i-lucide-plus', onClick: add }]"
        />
      </template>
    </UTable>
  </TableCard>
</template>
