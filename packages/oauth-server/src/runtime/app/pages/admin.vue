<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { AdminApplicationDto } from '../../../types'
import { oauthApplicationsApi } from '../composables/useOAuthApplications'

type Application = AdminApplicationDto

defineOptions({ name: 'OAuthAdminPage' })

const t = useModuleT('oauthServer')
const route = useRoute()
const { page, pageSize, search, sort: sortState, query, filtered, reset } = useTableQuery({
  sort: { id: 'createdAt', desc: true },
})
const sort = useTableSort(null, sortState)
const { sorting } = sort
const { applications, total, data, status, error, loading, refreshing, refresh } = await useOAuthApplications(query)
const actions = useOAuthApplicationActions()

const forbidden = computed(() => error.value?.statusCode === 401 || error.value?.statusCode === 403)
const failed = computed(() => !!error.value && !forbidden.value && !data.value)

const columns = computed<TableColumn<Application>[]>(() => [
  { accessorKey: 'name', header: sort.header('name', t('admin.application', 'Application')) },
  { id: 'access', header: t('admin.access', 'Access') },
  { id: 'grants', accessorFn: row => row.activeGrants ?? 0, header: t('admin.signedIn', 'Signed in'), meta: numericColumn },
  { id: 'actions', header: '', meta: { class: { th: 'w-0', td: 'w-0' } } },
])

// Deep link: `?application=<id>` opens that application's form (`actions.edit` sets and clears the parameter itself).
// The application may be on another page of the list, so it is loaded when it is not on this one.
// Client only: an overlay cannot open during server rendering, so the first look happens once mounted.
async function openFromQuery() {
  const id = route.query.application
  if (typeof id !== 'string' || !id) return
  const application = applications.value.find(item => item.id === id) ?? await oauthApplicationsApi.get(id).catch(() => undefined)
  if (application) void actions.edit(application)
}
onMounted(openFromQuery)
watch(() => route.query.application, openFromQuery)
</script>

<template>
  <div class="flex flex-col gap-4">
    <PageHeading
      :title="t('admin.title', 'OAuth applications')"
      :description="t('admin.description', 'The applications users can sign in to with their account.')"
    >
      <template
        v-if="!forbidden"
        #actions
      >
        <UButton
          icon="i-lucide-plus"
          :label="t('admin.new', 'Add application')"
          @click="actions.create()"
        />
      </template>
    </PageHeading>

    <UEmpty
      v-if="forbidden"
      icon="i-lucide-lock"
      :title="t('admin.forbiddenTitle', 'You are not allowed to manage OAuth applications')"
      :description="t('admin.forbiddenDescription', 'Ask an administrator for access.')"
    />
    <UEmpty
      v-else-if="failed"
      icon="i-lucide-circle-alert"
      :title="t('admin.loadFailed', 'OAuth applications could not be loaded')"
      :description="errorMessage(error, '')"
      :actions="[{ label: t('admin.tryAgain', 'Try again'), icon: 'i-lucide-rotate-ccw', color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
    />
    <template v-else>
      <PageToolbar>
        <UInput
          v-model="search"
          class="w-full max-w-sm"
          icon="i-lucide-search"
          :loading="status === 'pending'"
          :placeholder="t('admin.search', 'Search name or client ID...')"
        />
      </PageToolbar>

      <TableCard
        :loading="loading"
        :refreshing="refreshing"
      >
        <UTable
          v-model:sorting="sorting"
          :data="applications"
          :columns="columns"
          :sorting-options="{ manualSorting: true }"
          :ui="tableUi()"
          @select="(_event, row) => actions.edit(row.original)"
        >
          <template #name-cell="{ row }">
            <TableIdentity
              :title="row.original.name"
              :description="row.original.websiteUrl"
              :avatar="{ icon: row.original.icon || 'i-lucide-globe' }"
            >
              <template #badges>
                <UBadge
                  v-if="row.original.clientType === 'public'"
                  color="info"
                  variant="subtle"
                  size="sm"
                  :label="t('admin.public', 'Public')"
                />
                <UBadge
                  v-if="!row.original.isActive"
                  color="neutral"
                  variant="subtle"
                  size="sm"
                  :label="t('admin.disabled', 'Disabled')"
                />
              </template>
            </TableIdentity>
          </template>
          <template #access-cell="{ row }">
            <div class="flex flex-wrap gap-1">
              <UBadge
                v-for="role in row.original.allowedRoles"
                :key="role"
                variant="subtle"
                :label="role"
              />
              <UBadge
                v-if="!row.original.allowedRoles.length"
                color="neutral"
                variant="subtle"
                :label="t('admin.everyone', 'Every signed-in user')"
              />
            </div>
          </template>
          <template #grants-cell="{ row }">
            {{ row.original.activeGrants ?? 0 }}
          </template>
          <template #actions-cell="{ row }">
            <RowMenu
              :items="actions.menu(row.original)"
              :subject="row.original.name"
            />
          </template>
          <template #empty>
            <UEmpty
              v-if="filtered"
              variant="naked"
              icon="i-lucide-search"
              :title="t('admin.noMatches', 'No applications match')"
              :actions="[{ label: t('admin.clearSearch', 'Clear search'), color: 'neutral', variant: 'outline', onClick: reset }]"
            />
            <UEmpty
              v-else
              variant="naked"
              icon="i-lucide-app-window"
              :title="t('admin.emptyTitle', 'No applications yet')"
              :description="t('admin.emptyDescription', 'Add an application to let users sign in to it with their account.')"
              :actions="[{ label: t('admin.new', 'Add application'), icon: 'i-lucide-plus', onClick: () => actions.create() }]"
            />
          </template>
        </UTable>
        <template #footer>
          <TablePagination
            v-model:page="page"
            v-model:page-size="pageSize"
            :total="total"
          />
        </template>
      </TableCard>
    </template>
  </div>
</template>
