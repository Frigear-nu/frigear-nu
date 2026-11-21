<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { authApi } from '@frigear-nu/auth/api'
import { teamsApi } from '@frigear-nu/teams/api'
import type { CrewFormOption, CrewLadder, CrewTeamOption, StaffCrewMember, StaffCrewPage, StaffCrewSettings } from '../utils/admin-crew'
import { crewRoleLabel, isEmptyTranslated, localToIso, toLocalInput } from '../utils/admin-crew'
import { crewApi } from '../../utils/api'
import { CREW_STATUSES, CREW_STATUS_LABELS } from '../../utils/status'
import type { CrewInviteDto, CrewStatus, CrewStatusEmails, Translated } from '../../../types'
import { $fetch, computed, emptyCell, errorMessage, h, reactive, ref, resolveComponent, tableUi, useAction, useCopyToClipboard, useCrewActions, useCrewLinks, useCrewTranslate, useFetch, useFormat, useModuleT, useRequestURL, useRuntimeConfig, useTableQuery, useTableSort, watch } from '#imports'

defineOptions({ name: 'CrewOperationTab' })

// The "Crew" tab of the staff operation page (`extendTabs(nuxt, 'admin.operations', ...)`): the applications and the
// crew, the invite links, and how the crew is recruited. The operation page passes its record as `operation`.
const props = defineProps<{ operation?: { id: string, slug?: string } }>()

const t = useModuleT('crew')
const tr = useCrewTranslate()
const format = useFormat()
const links = useCrewLinks()
const actions = useCrewActions()
const { busy: saving, run } = useAction()
const { copy } = useCopyToClipboard()
// The configured site URL, like the emailed links; the request's origin when none is set.
const siteUrl = useRuntimeConfig().public.siteUrl as string | undefined
const origin = (siteUrl ? new URL(siteUrl).origin : useRequestURL().origin)

const operationId = computed(() => props.operation?.id ?? '')
const hasOperation = computed(() => !!operationId.value)

// --- What the other modules know: the operation's teams, the ladders and the forms to apply with ---------------------
const { data: teamsPage } = await useFetch<{ items: CrewTeamOption[] }>(teamsApi.admin.teams, {
  query: computed(() => ({ ownerType: 'operation', ownerId: operationId.value || undefined, pageSize: 100, sort: 'sort', order: 'asc' })),
  immediate: hasOperation.value,
  watch: false,
  key: computed(() => `crew:teams:${operationId.value}`),
  default: () => ({ items: [] }),
})
const { data: ladders } = await useFetch<CrewLadder[]>(teamsApi.admin.ladders, { key: 'crew:ladders', default: () => [] })
// Only the forms an operation can recruit with: crew filters them (signed-in users, stored, not used elsewhere).
const { data: eligibleForms } = await useFetch<CrewFormOption[]>(crewApi.admin.forms, {
  query: computed(() => ({ operationId: operationId.value || undefined })),
  key: computed(() => `crew:forms:${operationId.value}`),
  immediate: hasOperation.value,
  watch: false,
  default: () => [],
})
// What the caller may do: the member form shows the application's answers only with `crew:pii`.
const { data: access } = await useFetch<{ permissions: string[] }>(authApi.me.access, { key: 'crew:access', default: () => ({ permissions: [] }) })
const pii = computed(() => access.value.permissions.includes('crew:pii'))
const teams = computed(() => teamsPage.value?.items ?? [])

// --- Settings -------------------------------------------------------------------------------------------------------
const { data: settings, refresh: refreshSettings } = await useFetch<StaffCrewSettings>(() => crewApi.admin.settings(operationId.value), {
  immediate: hasOperation.value,
  watch: false,
  key: computed(() => `crew:settings:${operationId.value}`),
})

// --- The applications and the crew ---------------------------------------------------------------------------------
const { page, pageSize, search, sort: sortState, query, filters, filtered, reset } = useTableQuery({
  sort: { id: 'appliedAt', desc: true },
  filters: { status: 'all', team: 'all', previous: 'all' },
})
const { sorting, header } = useTableSort(null, sortState)
const { data, status, error, refresh } = await useFetch<StaffCrewPage>(() => crewApi.admin.members(operationId.value), {
  query,
  immediate: hasOperation.value,
  key: computed(() => `crew:members:${operationId.value}`),
})
const rows = computed(() => data.value?.items ?? [])
const pending = computed(() => status.value === 'pending')
const loading = computed(() => pending.value && !data.value)
const refreshing = computed(() => pending.value && !!data.value)

const { data: invites, status: invitesStatus, refresh: refreshInvites } = await useFetch<CrewInviteDto[]>(() => crewApi.admin.invites(operationId.value), {
  immediate: hasOperation.value,
  watch: false,
  key: computed(() => `crew:invites:${operationId.value}`),
  default: () => [],
})

async function refreshAll() {
  await Promise.all([refresh(), refreshSettings(), refreshInvites()])
}

const statusOptions = computed(() => [
  { label: t('admin.allStatuses', 'All statuses'), value: 'all' },
  ...CREW_STATUSES.map(value => ({ label: t(`admin.statuses.${value}`, CREW_STATUS_LABELS[value]), value })),
])
const teamFilterOptions = computed(() => [
  { label: t('admin.allTeams', 'All teams'), value: 'all' },
  ...teams.value.map(team => ({ label: tr(team.name), value: team.id })),
])
const previousOptions = computed(() => [
  { label: t('admin.everyone', 'Everyone'), value: 'all' },
  { label: t('admin.earlierCrew', 'Earlier crew'), value: 'true' },
  { label: t('admin.newPeople', 'New people'), value: 'false' },
])

const menuOptions = computed(() => ({ teams: teams.value, ladders: ladders.value, pii: pii.value, onChanged: refreshAll }))

// Row selection feeds the bulk approval.
const selection = ref<Record<string, boolean>>({})
const selectedIds = computed(() => Object.keys(selection.value).filter(id => selection.value[id]))
watch(() => rows.value.map(row => row.id).join(), () => {
  const present = new Set(rows.value.map(row => row.id))
  selection.value = Object.fromEntries(Object.entries(selection.value).filter(([id]) => present.has(id)))
})
async function approveSelected() {
  const result = await actions.approveMany(operationId.value, selectedIds.value)
  if (!result) return
  selection.value = {}
  await refreshAll()
}

const UCheckbox = resolveComponent('UCheckbox')
const RowMenu = resolveComponent('RowMenu')
const TableIdentity = resolveComponent('TableIdentity')
const StatusBadge = resolveComponent('StatusBadge')
const UIcon = resolveComponent('UIcon')

const columns = computed<TableColumn<StaffCrewMember>[]>(() => [
  {
    id: 'select',
    meta: { class: { th: 'w-0', td: 'w-0' } },
    header: ({ table }) => h(UCheckbox, {
      'modelValue': table.getIsSomePageRowsSelected() ? 'indeterminate' : table.getIsAllPageRowsSelected(),
      'onUpdate:modelValue': (value: boolean | 'indeterminate') => table.toggleAllPageRowsSelected(!!value),
      'aria-label': t('admin.selectAll', 'Select all'),
    }),
    cell: ({ row }) => h(UCheckbox, {
      'modelValue': row.getIsSelected(),
      'onUpdate:modelValue': (value: boolean | 'indeterminate') => row.toggleSelected(!!value),
      'onClick': (event: Event) => event.stopPropagation(),
      'aria-label': t('admin.selectRow', 'Select {name}', { name: row.original.name ?? '' }),
    }),
  },
  {
    id: 'name',
    header: header('name', t('admin.name', 'Name')),
    cell: ({ row }) => h(TableIdentity, { title: row.original.name ?? `#${row.original.userId}`, description: row.original.email ?? null, avatar: row.original.avatar ? { src: row.original.avatar } : undefined }),
  },
  {
    id: 'crewStatus',
    header: header('crewStatus', t('admin.status', 'Status')),
    cell: ({ row }) => h('div', { class: 'flex items-center gap-2' }, [
      h(StatusBadge, { status: row.original.crewStatus, label: t(`admin.statuses.${row.original.crewStatus}`, CREW_STATUS_LABELS[row.original.crewStatus]) }),
      row.original.waitlistPosition ? h('span', { class: 'text-muted text-xs tabular-nums' }, `#${row.original.waitlistPosition}`) : undefined,
    ]),
  },
  {
    id: 'team',
    header: t('admin.team', 'Team'),
    cell: ({ row }) => h('span', { class: 'text-muted' }, tr(row.original.teamName)),
  },
  {
    id: 'role',
    header: header('role', t('admin.role', 'Role')),
    cell: ({ row }) => h('span', {}, crewRoleLabel(ladders.value, teams.value.find(team => team.id === row.original.teamId)?.kind, row.original.role, tr)),
  },
  {
    id: 'previousCrew',
    header: header('previousCrew', t('admin.previousCrew', 'Earlier crew')),
    cell: ({ row }) => row.original.previousCrew
      ? h(UIcon, { 'name': 'i-lucide-history', 'class': 'text-muted size-4', 'aria-label': t('admin.earlierCrew', 'Earlier crew') })
      : emptyCell(),
  },
  {
    id: 'appliedAt',
    header: header('appliedAt', t('admin.applied', 'Applied')),
    cell: ({ row }) => row.original.appliedAt ? h('span', { class: 'text-muted' }, format.dateTime(row.original.appliedAt)) : emptyCell(),
  },
  {
    id: 'actions',
    meta: { class: { th: 'w-0', td: 'w-0' } },
    cell: ({ row }) => h(RowMenu, { items: actions.menu(row.original, menuOptions.value), subject: row.original.name ?? `#${row.original.userId}` }),
  },
])

async function openMember(member: StaffCrewMember) {
  if (await actions.open(member, menuOptions.value)) await refreshAll()
}

const applyLink = computed(() => props.operation?.slug ? `${origin}${links.apply(props.operation.slug)}` : null)

// --- Invites --------------------------------------------------------------------------------------------------------
const inviteColumns = computed<TableColumn<CrewInviteDto>[]>(() => [
  {
    id: 'team',
    header: t('admin.team', 'Team'),
    cell: ({ row }) => h(TableIdentity, { title: row.original.teamName ? tr(row.original.teamName) : row.original.teamId, description: `${row.original.prefix}…` }),
  },
  {
    id: 'role',
    header: t('admin.role', 'Role'),
    cell: ({ row }) => h('span', {}, crewRoleLabel(ladders.value, teams.value.find(team => team.id === row.original.teamId)?.kind, row.original.role, tr)),
  },
  {
    id: 'uses',
    header: t('admin.uses', 'Uses'),
    cell: ({ row }) => h('span', { class: 'tabular-nums' }, `${row.original.uses} / ${row.original.maxUses}`),
  },
  {
    id: 'expiresAt',
    header: t('admin.expires', 'Expires'),
    cell: ({ row }) => row.original.expiresAt ? h('span', { class: 'text-muted' }, format.dateTime(row.original.expiresAt)) : emptyCell(),
  },
  {
    id: 'status',
    header: t('admin.status', 'Status'),
    cell: ({ row }) => h(StatusBadge, { status: row.original.status, label: t(`admin.inviteStatuses.${row.original.status}`, row.original.status) }),
  },
  {
    id: 'actions',
    meta: { class: { th: 'w-0', td: 'w-0' } },
    cell: ({ row }) => row.original.status === 'active' || row.original.status === 'used'
      ? h(RowMenu, {
          items: [[{
            label: t('admin.revokeInviteAction', 'Revoke invite'),
            icon: 'i-lucide-ban',
            color: 'error',
            onSelect: async () => {
              if (await actions.revokeInvite(row.original)) await refreshInvites()
            },
          }]],
          subject: t('admin.inviteSubject', 'invite {prefix}', { prefix: row.original.prefix }),
        })
      : undefined,
  },
])

async function createInvite() {
  if (await actions.createInvite(operationId.value, { teams: teams.value, ladders: ladders.value })) await refreshInvites()
}

// --- The settings form ----------------------------------------------------------------------------------------------
const NONE = '__none'
type EmailForm = Record<CrewStatus, { enabled: boolean, subject?: Translated, body?: Translated }>
const form = reactive({
  formId: NONE,
  defaultTeamId: NONE,
  capacity: undefined as number | undefined,
  waitlist: true,
  previousCrewFirst: false,
  opensAt: '',
  closesAt: '',
  presets: true,
  emails: {} as EmailForm,
})
const emailsOpen = ref(false)

function fillForm(value: StaffCrewSettings | null | undefined) {
  if (!value) return
  form.formId = value.formId ?? NONE
  form.defaultTeamId = value.defaultTeamId ?? NONE
  form.capacity = value.capacity ?? undefined
  form.waitlist = value.waitlist
  form.previousCrewFirst = value.previousCrewFirst
  form.opensAt = toLocalInput(value.opensAt)
  form.closesAt = toLocalInput(value.closesAt)
  form.presets = value.presets
  form.emails = Object.fromEntries(CREW_STATUSES.map(key => [key, {
    enabled: value.statusEmails[key]?.enabled !== false,
    subject: value.statusEmails[key]?.subject,
    body: value.statusEmails[key]?.body,
  }])) as EmailForm
}
watch(settings, fillForm, { immediate: true })

const formOptions = computed(() => {
  const items = (eligibleForms.value ?? []).map(item => ({ label: item.name, value: item.id }))
  const current = settings.value?.formId
  if (current && !items.some(item => item.value === current)) items.push({ label: current, value: current })
  return [{ label: t('admin.noForm', 'No form (applications closed)'), value: NONE }, ...items]
})
const teamSettingOptions = computed(() => [
  { label: t('admin.automaticTeam', 'Automatic (the first team)'), value: NONE },
  ...teams.value.map(team => ({ label: tr(team.name), value: team.id })),
])

function statusEmailsBody(): CrewStatusEmails {
  const result: CrewStatusEmails = {}
  for (const key of CREW_STATUSES) {
    const entry = form.emails[key]
    if (!entry) continue
    const custom = {
      ...(entry.enabled ? {} : { enabled: false }),
      ...(isEmptyTranslated(entry.subject) ? {} : { subject: entry.subject }),
      ...(isEmptyTranslated(entry.body) ? {} : { body: entry.body }),
    }
    if (Object.keys(custom).length) result[key] = custom
  }
  return result
}

async function saveSettings() {
  const saved = await run(
    () => $fetch<StaffCrewSettings>(crewApi.admin.settings(operationId.value), {
      method: 'PUT',
      body: {
        formId: form.formId === NONE ? null : form.formId,
        defaultTeamId: form.defaultTeamId === NONE ? null : form.defaultTeamId,
        capacity: form.capacity ?? null,
        waitlist: form.waitlist,
        previousCrewFirst: form.previousCrewFirst,
        opensAt: localToIso(form.opensAt, settings.value?.opensAt),
        closesAt: localToIso(form.closesAt, settings.value?.closesAt),
        statusEmails: statusEmailsBody(),
        presets: form.presets,
      },
    }),
    { success: t('admin.settingsSaved', 'Saved the crew settings') },
  )
  if (saved) await refreshAll()
}

function jumpToSettings() {
  document.getElementById('crew-settings')?.scrollIntoView({ behavior: 'smooth' })
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <UEmpty
      v-if="!hasOperation"
      icon="i-lucide-circle-alert"
      :title="t('admin.noOperation', 'Open this tab from an operation page.')"
    />

    <template v-else>
      <div class="flex flex-col gap-3">
        <PageToolbar>
          <UInput
            v-model="search"
            icon="i-lucide-search"
            :loading="pending"
            :placeholder="t('admin.search', 'Search people')"
            :aria-label="t('admin.search', 'Search people')"
            class="w-full sm:max-w-xs"
          />
          <USelect
            v-model="filters.status"
            :items="statusOptions"
            :aria-label="t('admin.status', 'Status')"
            class="w-44"
          />
          <USelect
            v-model="filters.team"
            :items="teamFilterOptions"
            :aria-label="t('admin.team', 'Team')"
            class="w-44"
          />
          <USelect
            v-model="filters.previous"
            :items="previousOptions"
            :aria-label="t('admin.previousCrew', 'Earlier crew')"
            class="w-40"
          />
          <UButton
            v-if="filtered"
            variant="ghost"
            color="neutral"
            icon="i-lucide-x"
            :label="t('admin.clearFilters', 'Clear filters')"
            @click="reset"
          />
        </PageToolbar>

        <UEmpty
          v-if="error && !data"
          icon="i-lucide-circle-alert"
          :title="t('admin.loadFailed', 'The crew could not be loaded')"
          :description="errorMessage(error, '')"
          :actions="[{ label: t('tryAgain', 'Try again'), icon: 'i-lucide-rotate-ccw', color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
        />

        <TableCard
          v-else
          :title="t('admin.applications', 'Applications and crew')"
          :loading="loading"
          :refreshing="refreshing"
        >
          <template #actions>
            <UButton
              v-if="selectedIds.length"
              icon="i-lucide-user-check"
              size="sm"
              :label="t('admin.approveSelected', 'Approve {count} selected', { count: selectedIds.length })"
              @click="approveSelected"
            />
          </template>
          <UTable
            v-model:sorting="sorting"
            v-model:row-selection="selection"
            :data="rows"
            :columns="columns"
            :get-row-id="(row: StaffCrewMember) => row.id"
            :sorting-options="{ manualSorting: true }"
            :ui="tableUi()"
            @select="(_: Event, row: { original: StaffCrewMember }) => openMember(row.original)"
          >
            <template #empty>
              <UEmpty
                v-if="filtered"
                variant="naked"
                icon="i-lucide-search"
                :title="t('admin.noMatches', 'Nobody matches your search')"
                :actions="[{ label: t('admin.clearFilters', 'Clear filters'), color: 'neutral', variant: 'outline', onClick: reset }]"
              />
              <UEmpty
                v-else-if="!settings?.formId"
                variant="naked"
                icon="i-lucide-clipboard-list"
                :title="t('admin.notSetUp', 'Applications are not set up yet')"
                :description="t('admin.notSetUpDescription', 'Choose the form people apply with in the settings below.')"
                :actions="[{ label: t('admin.openSettings', 'Open settings'), icon: 'i-lucide-settings', onClick: jumpToSettings }]"
              />
              <UEmpty
                v-else
                variant="naked"
                icon="i-lucide-hand-heart"
                :title="t('admin.empty', 'No applications yet')"
                :description="t('admin.emptyDescription', 'Share the apply page. People who apply show up here.')"
                :actions="applyLink ? [{ label: t('admin.copyApplyLink', 'Copy apply link'), icon: 'i-lucide-link', onClick: () => copy(applyLink!) }] : []"
              />
            </template>
          </UTable>
          <template #footer>
            <TablePagination
              v-model:page="page"
              v-model:page-size="pageSize"
              :total="data?.total ?? 0"
            />
          </template>
        </TableCard>
      </div>

      <TableCard
        :title="t('admin.invites', 'Invite links')"
        :description="t('admin.invitesDescription', 'A link adds whoever opens it to a team, approved, without an application.')"
        :loading="invitesStatus === 'pending' && !invites.length"
      >
        <template #actions>
          <UButton
            icon="i-lucide-plus"
            size="sm"
            :label="t('admin.createInvite', 'Create invite')"
            :disabled="!teams.length"
            @click="createInvite"
          />
        </template>
        <UTable
          :data="invites"
          :columns="inviteColumns"
          :ui="tableUi()"
        >
          <template #empty>
            <UEmpty
              variant="naked"
              icon="i-lucide-link"
              :title="t('admin.noInvites', 'No invite links yet')"
              :description="teams.length ? t('admin.noInvitesDescription', 'Invite a BA or a friend of the crew straight onto a team.') : t('admin.noInviteTeams', 'Save the settings once to create the first team.')"
              :actions="teams.length ? [{ label: t('admin.createInvite', 'Create invite'), icon: 'i-lucide-plus', onClick: createInvite }] : []"
            />
          </template>
        </UTable>
      </TableCard>

      <SectionCard
        id="crew-settings"
        :title="t('admin.settings', 'Settings')"
        :description="t('admin.settingsDescription', 'How people apply, how many you need and which emails they get.')"
      >
        <form
          id="crew-settings-form"
          class="flex flex-col divide-y divide-default"
          @submit.prevent="saveSettings"
        >
          <FormRow
            name="formId"
            :label="t('admin.form', 'Application form')"
            :description="t('admin.formHelp', 'It must ask people to sign in and store its submissions. An operation uses its own form.')"
          >
            <USelect
              v-model="form.formId"
              :items="formOptions"
              class="w-full sm:max-w-sm"
            />
          </FormRow>
          <FormRow
            name="defaultTeamId"
            :label="t('admin.defaultTeam', 'Team for applications')"
            :description="t('admin.defaultTeamHelp', 'Applications land here. Staff move people to other teams.')"
          >
            <USelect
              v-model="form.defaultTeamId"
              :items="teamSettingOptions"
              class="w-full sm:max-w-sm"
            />
          </FormRow>
          <FormRow
            name="capacity"
            :label="t('admin.capacity', 'Capacity')"
            :description="t('admin.capacityHelp', 'How many people you need. Empty means no limit. {approved} approved now.', { approved: settings?.approved ?? 0 })"
          >
            <UInputNumber
              v-model="form.capacity"
              :min="0"
              class="w-full sm:max-w-sm"
            />
          </FormRow>
          <FormRow
            name="waitlist"
            :label="t('admin.waitlist', 'Waiting list')"
            :description="t('admin.waitlistHelp', 'Applications over the capacity wait on a list, and move up when a place frees.')"
          >
            <USwitch v-model="form.waitlist" />
          </FormRow>
          <FormRow
            name="previousCrewFirst"
            :label="t('admin.previousCrewFirst', 'Earlier crew first')"
            :description="t('admin.previousCrewFirstHelp', 'People who worked an earlier operation move up the waiting list first.')"
          >
            <USwitch v-model="form.previousCrewFirst" />
          </FormRow>
          <FormRow
            name="opensAt"
            :label="t('admin.opensAt', 'Opens')"
            :description="t('admin.opensAtHelp', 'Leave empty to open at once.')"
          >
            <UInput
              v-model="form.opensAt"
              type="datetime-local"
              class="w-full sm:max-w-sm"
            />
          </FormRow>
          <FormRow
            name="closesAt"
            :label="t('admin.closesAt', 'Closes')"
            :description="t('admin.closesAtHelp', 'Leave empty to keep applications open.')"
          >
            <UInput
              v-model="form.closesAt"
              type="datetime-local"
              class="w-full sm:max-w-sm"
            />
          </FormRow>
          <FormRow
            name="presets"
            :label="t('admin.presets', 'Role presets')"
            :description="t('admin.presetsHelp', 'Added once, when the settings are first saved: a global bar manager is a BA and global crew a bartender on every team. Turning this off later removes nothing; edit the rules in Teams.')"
          >
            <USwitch
              v-model="form.presets"
              :disabled="settings?.source === 'stored'"
            />
          </FormRow>
          <FormRow
            name="emails"
            :label="t('admin.emails', 'Status emails')"
            :description="t('admin.emailsHelp', 'People are emailed when their status changes. Turn an email off or write your own text.')"
          >
            <UButton
              type="button"
              color="neutral"
              variant="outline"
              :icon="emailsOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
              :label="emailsOpen ? t('admin.hideEmails', 'Hide emails') : t('admin.customizeEmails', 'Customize emails')"
              @click="emailsOpen = !emailsOpen"
            />
          </FormRow>
          <template v-if="emailsOpen">
            <FormRow
              v-for="key in CREW_STATUSES"
              :key="key"
              :name="`emails.${key}`"
              :label="t(`admin.statuses.${key}`, CREW_STATUS_LABELS[key])"
            >
              <div
                v-if="form.emails[key]"
                class="flex flex-col gap-3"
              >
                <USwitch
                  v-model="form.emails[key].enabled"
                  :label="t('admin.sendEmail', 'Send this email')"
                />
                <template v-if="form.emails[key].enabled">
                  <TranslatedInput
                    v-model="form.emails[key].subject"
                    :placeholder="t('admin.emailSubject', 'Subject (leave empty for the built-in text)')"
                    class="sm:max-w-sm"
                  />
                  <TranslatedInput
                    v-model="form.emails[key].body"
                    multiline
                    :rows="4"
                    :placeholder="t('admin.emailBody', 'Message (leave empty for the built-in text). You can use {variables}.', { variables: '{{name}}, {{operation}}, {{team}}, {{role}}' })"
                  />
                </template>
              </div>
            </FormRow>
          </template>
        </form>
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton
              type="submit"
              form="crew-settings-form"
              :loading="saving"
              :label="t('admin.saveSettings', 'Save settings')"
            />
          </div>
        </template>
      </SectionCard>
    </template>
  </div>
</template>
