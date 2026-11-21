<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import TeamLadderSlideover from '../components/TeamLadderSlideover.vue'
import type { StaffTeam, StaffTeamLadder, StaffTeamMapping, StaffTeamMember } from '../utils/admin-team'
import { teamOwnerText, teamRoleLabel } from '../utils/admin-team'
import { teamsApi } from '../../utils/api'
import { computed, emptyCell, errorMessage, h, navigateTo, ref, resolveComponent, tableUi, useFetch, useFormat, useModuleT, useOverlay, useRoute, useTeamActions, useTeamLinks, useTeamMappingActions, useTeamMemberActions, useTeamsTranslate } from '#imports'

defineOptions({ name: 'TeamsAdminTeamPage' })

const t = useModuleT('teams')
const route = useRoute()
const tr = useTeamsTranslate()
const format = useFormat()
const links = useTeamLinks()
const overlay = useOverlay()
const actions = useTeamActions()
const id = computed(() => String(route.params.id))

const { data: team, error, refresh } = await useFetch<StaffTeam>(() => teamsApi.admin.team(id.value))
const { data: ladders, refresh: refreshLadders } = await useFetch<StaffTeamLadder[]>(teamsApi.admin.ladders, { default: () => [] })
const notFound = computed(() => error.value?.statusCode === 404)
const forbidden = computed(() => error.value?.statusCode === 401 || error.value?.statusCode === 403)

// Mapped members are resolved on demand (every candidate is checked), so they are behind a switch.
const showMapped = ref(false)
const { data: members, status: membersStatus, refresh: refreshMembers } = await useFetch<StaffTeamMember[]>(() => teamsApi.members(id.value), {
  query: computed(() => (showMapped.value ? { include: 'mapped' } : {})),
  default: () => [],
})
const { data: mappings, status: mappingsStatus, refresh: refreshMappings } = await useFetch<StaffTeamMapping[]>(teamsApi.admin.mappings, {
  query: computed(() => ({ teamId: id.value })),
  default: () => [],
})

const owner = computed(() => team.value ? { ownerType: team.value.ownerType, ownerId: team.value.ownerId } : { ownerType: 'platform', ownerId: null })
const memberActions = useTeamMemberActions(() => team.value!, () => ladders.value)
const mappingActions = useTeamMappingActions(() => ({ owner: owner.value, ladders: ladders.value, team: team.value ?? undefined }))
const ladder = computed(() => ladders.value.find(item => item.kind === team.value?.kind))
const roleLabel = (role: string) => teamRoleLabel(ladders.value, team.value?.kind ?? '', role, tr)
const refreshAll = async () => {
  await Promise.all([refresh(), refreshMembers(), refreshMappings()])
}

const facts = computed(() => team.value
  ? [
      { key: 'kind', label: t('admin.kind', 'Kind'), value: team.value.kind },
      { key: 'owner', label: t('admin.ownerType', 'Owner'), value: teamOwnerText(team.value, tr, t('admin.ownerTypes.platform', 'Platform')) },
      { key: 'capacity', label: t('admin.capacity', 'Capacity'), value: team.value.capacity === null ? null : String(team.value.capacity) },
      { key: 'members', label: t('admin.members', 'Members'), value: String(team.value.memberCount) },
      { key: 'leadFrom', label: t('admin.leadFrom', 'Leads from'), value: ladder.value?.leadFrom ? roleLabel(ladder.value.leadFrom) : null },
      { key: 'description', label: t('admin.description', 'Description'), value: tr(team.value.description) || null },
    ]
  : [])

const TableIdentity = resolveComponent('TableIdentity')
const StatusBadge = resolveComponent('StatusBadge')
const RowMenu = resolveComponent('RowMenu')

const memberColumns = computed<TableColumn<StaffTeamMember>[]>(() => [
  {
    id: 'member',
    header: t('admin.member', 'Member'),
    cell: ({ row }) => h(TableIdentity, {
      title: row.original.name ?? `#${row.original.userId}`,
      description: row.original.email ?? null,
      avatar: { src: row.original.avatar ?? undefined, alt: row.original.name ?? undefined },
    }),
  },
  {
    accessorKey: 'role',
    header: t('admin.role', 'Role'),
    cell: ({ row }) => roleLabel(row.original.role),
  },
  {
    accessorKey: 'source',
    header: t('admin.source', 'Source'),
    cell: ({ row }) => h(StatusBadge, {
      status: row.original.source,
      label: row.original.source === 'mapped' ? t('admin.sources.mapped', 'Mapped') : t('admin.sources.explicit', 'Added'),
      colors: { explicit: 'primary', mapped: 'neutral' },
    }),
  },
  {
    // Set by consumers such as crew: anything but `active` keeps the member listed without a role.
    accessorKey: 'status',
    header: t('admin.status', 'Status'),
    cell: ({ row }) => row.original.status ? h(StatusBadge, { status: row.original.status }) : emptyCell(),
  },
  {
    accessorKey: 'addedAt',
    header: t('admin.addedAt', 'Added'),
    cell: ({ row }) => row.original.addedAt ? h('span', { class: 'tabular-nums' }, format.date(row.original.addedAt)) : emptyCell(),
  },
  {
    id: 'actions',
    meta: { class: { th: 'w-0', td: 'w-0' } },
    cell: ({ row }) => h(RowMenu, { items: memberActions.menu(row.original, { onChanged: refreshAll }), subject: row.original.name ?? '' }),
  },
])

const mappingColumns = computed<TableColumn<StaffTeamMapping>[]>(() => [
  {
    id: 'match',
    header: t('admin.matchType', 'Who'),
    cell: ({ row }) => {
      const match = row.original.match
      return 'plan' in match
        ? t('admin.matchPlanValue', 'Plan {plan}', { plan: match.plan })
        : t('admin.matchRoleValue', 'Global role {role}', { role: match.role })
    },
  },
  {
    accessorKey: 'teamRole',
    header: t('admin.teamRole', 'Team role'),
    cell: ({ row }) => roleLabel(row.original.teamRole),
  },
  {
    id: 'scope',
    header: t('admin.scope', 'Teams'),
    cell: ({ row }) => h('span', { class: 'text-muted' }, row.original.teamId ? t('admin.scopeTeam', 'This team only') : t('admin.scopeOwner', 'Every team of the owner')),
  },
  {
    accessorKey: 'priority',
    header: t('admin.priority', 'Priority'),
    cell: ({ row }) => h('span', { class: 'tabular-nums' }, String(row.original.priority)),
  },
  {
    id: 'actions',
    meta: { class: { th: 'w-0', td: 'w-0' } },
    cell: ({ row }) => h(RowMenu, { items: mappingActions.menu(row.original, { onChanged: refreshAll }), subject: row.original.teamRole }),
  },
])

async function addMember() {
  if (await memberActions.add()) await refreshAll()
}
async function addMapping() {
  if (await mappingActions.create()) await refreshAll()
}
async function editLadder() {
  if (!ladder.value) return
  const saved = await overlay.create(TeamLadderSlideover, { destroyOnClose: true, props: { ladder: ladder.value } }).open()
  if (saved) await Promise.all([refreshLadders(), refreshMembers()])
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <template v-if="team">
      <PageHeading
        :title="tr(team.name)"
        :breadcrumb="[{ label: t('admin.title', 'Teams'), to: links.admin() }, { label: tr(team.name) }]"
      >
        <template #actions>
          <UButton
            icon="i-lucide-user-plus"
            :label="t('admin.addMember', 'Add member')"
            @click="addMember"
          />
          <RowMenu
            variant="outline"
            :subject="tr(team.name)"
            :items="actions.menu(team, { open: false, onChanged: refresh, onRemoved: () => navigateTo(links.admin()) })"
          />
        </template>
      </PageHeading>

      <SectionCard :title="t('admin.keyFacts', 'Team')">
        <DescriptionList :items="facts" />
      </SectionCard>

      <TableCard
        :title="t('admin.members', 'Members')"
        :loading="membersStatus === 'pending' && !members.length"
      >
        <template #actions>
          <USwitch
            v-model="showMapped"
            :label="t('admin.showMapped', 'Show mapped members')"
          />
        </template>
        <UTable
          :data="members"
          :columns="memberColumns"
          :ui="tableUi({ tr: '' })"
        >
          <template #empty>
            <UEmpty
              variant="naked"
              icon="i-lucide-users-round"
              :title="t('admin.noMembers', 'No members yet')"
              :description="t('admin.noMembersDescription', 'Add people by hand, or add a mapping rule so people with a role or a plan join on their own.')"
              :actions="[{ label: t('admin.addMember', 'Add member'), icon: 'i-lucide-user-plus', onClick: addMember }]"
            />
          </template>
        </UTable>
      </TableCard>

      <TableCard
        :title="t('admin.mappings', 'Role mapping rules')"
        :description="t('admin.mappingsDescription', 'People who meet a rule hold its team role here without being added. Explicit members always keep their own role.')"
        :loading="mappingsStatus === 'pending' && !mappings.length"
      >
        <template #actions>
          <UButton
            icon="i-lucide-plus"
            color="neutral"
            variant="outline"
            size="sm"
            :label="t('admin.addMapping', 'Add mapping rule')"
            @click="addMapping"
          />
        </template>
        <UTable
          :data="mappings"
          :columns="mappingColumns"
          :ui="tableUi({ tr: '' })"
        >
          <template #empty>
            <UEmpty
              variant="naked"
              icon="i-lucide-git-merge"
              :title="t('admin.noMappings', 'No mapping rules')"
              :description="t('admin.noMappingsDescription', 'For example: everyone with a given global role holds a given team role here.')"
              :actions="[{ label: t('admin.addMapping', 'Add mapping rule'), icon: 'i-lucide-plus', onClick: addMapping }]"
            />
          </template>
        </UTable>
      </TableCard>

      <SectionCard
        v-if="ladder"
        :title="t('admin.ladderTitle', 'The {kind} ladder', { kind: ladder.kind })"
        :description="t('admin.ladderDescription', 'The roles of every {kind} team, lowest first. It is shared by all teams of this kind.', { kind: ladder.kind })"
      >
        <template #actions>
          <UButton
            icon="i-lucide-pencil"
            color="neutral"
            variant="outline"
            size="sm"
            :label="t('admin.editLadderAction', 'Edit ladder')"
            @click="editLadder"
          />
        </template>
        <ol class="flex flex-wrap items-center gap-2">
          <li
            v-for="(role, index) in ladder.roles"
            :key="role.key"
            class="flex items-center gap-2"
          >
            <UBadge
              :color="ladder.leadFrom && ladder.roles.findIndex(item => item.key === ladder!.leadFrom) <= index ? 'primary' : 'neutral'"
              variant="subtle"
              :label="tr(role.label) || role.key"
            />
            <UIcon
              v-if="index < ladder.roles.length - 1"
              name="i-lucide-chevron-right"
              class="text-dimmed"
            />
          </li>
        </ol>
      </SectionCard>
    </template>

    <UEmpty
      v-else-if="forbidden"
      icon="i-lucide-lock"
      :title="t('admin.forbidden', 'You do not have access to teams')"
      :actions="[{ label: t('admin.allTeams', 'All teams'), to: links.admin(), color: 'neutral', variant: 'outline' }]"
    />
    <UEmpty
      v-else-if="notFound || !error"
      icon="i-lucide-users-round"
      :title="t('notFound', 'Team not found')"
      :actions="[{ label: t('admin.allTeams', 'All teams'), to: links.admin(), color: 'neutral', variant: 'outline' }]"
    />
    <UEmpty
      v-else
      icon="i-lucide-circle-alert"
      :title="t('admin.teamLoadFailed', 'The team could not be loaded')"
      :description="errorMessage(error, '')"
      :actions="[{ label: t('tryAgain', 'Try again'), icon: 'i-lucide-rotate-ccw', color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
    />
  </div>
</template>
