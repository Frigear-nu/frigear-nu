<script setup lang="ts">
import DetailsTab from '../tabs/Details.vue'
import type { StaffOperation } from '../utils/admin-operation'
import { operationsApi } from '../../utils/api'
import { OPERATION_STATUS_LABELS } from '../../utils/status'
import { computed, errorMessage, navigateTo, resolveComponent, useFetch, useFormat, useModuleT, useOperationActions, useOperationLinks, useOperationsTranslate, useRoute, useRuntimeConfig } from '#imports'

defineOptions({ name: 'OperationsAdminOperationPage' })

const t = useModuleT('operations')
const route = useRoute()
const tr = useOperationsTranslate()
const format = useFormat()
const links = useOperationLinks()
const actions = useOperationActions()
const hasPublicPage = !!useRuntimeConfig().public.operations?.pages?.public
const id = computed(() => String(route.params.id))

const { data: operation, error, refresh } = await useFetch<StaffOperation>(() => operationsApi.admin.operation(id.value))
const notFound = computed(() => error.value?.statusCode === 404)
const forbidden = computed(() => error.value?.statusCode === 401 || error.value?.statusCode === 403)

// The tabs below the key facts are the `admin.operations` area: modules add tabs with
// `extendTabs(nuxt, 'admin.operations', ...)` and each tab component receives the `operation` and may emit `refresh`.
// `@frigear-nu/widget` is optional; without it the built-in tab renders on its own.
const Tabs = resolveComponent('WidgetTabs')
const tabs = typeof Tabs === 'string' ? undefined : Tabs

// What staff look at first, read-only: the operation has one form, in the "Details" tab.
const facts = computed(() => operation.value
  ? [
      { key: 'startsAt', label: t('admin.starts', 'Starts'), value: format.dateTime(operation.value.startsAt) },
      { key: 'endsAt', label: t('admin.ends', 'Ends'), value: operation.value.endsAt ? format.dateTime(operation.value.endsAt) : null },
      { key: 'location', label: t('admin.location', 'Location'), value: tr(operation.value.location?.name) },
      { key: 'host', label: t('admin.hostName', 'Host'), value: operation.value.hostName },
      { key: 'visibility', label: t('admin.visibility', 'Visibility'), value: operation.value.public ? t('admin.visibilityPublic', 'Public') : t('admin.visibilityPrivate', 'Participants only') },
      { key: 'slug', label: t('admin.slug', 'URL name'), value: operation.value.slug },
    ]
  : [])
</script>

<template>
  <div class="flex flex-col gap-4">
    <template v-if="operation">
      <PageHeading
        :title="tr(operation.name)"
        :breadcrumb="[{ label: t('admin.title', 'Operations'), to: links.admin() }, { label: tr(operation.name) }]"
      >
        <template #badge>
          <StatusBadge
            :status="operation.status"
            :label="t(`admin.statuses.${operation.status}`, OPERATION_STATUS_LABELS[operation.status])"
          />
        </template>
        <template #actions>
          <UButton
            v-if="operation.public && hasPublicPage"
            :to="links.operation(operation.slug)"
            variant="outline"
            color="neutral"
            icon="i-lucide-external-link"
            :label="t('admin.viewPublic', 'View public page')"
          />
          <RowMenu
            variant="outline"
            :subject="tr(operation.name)"
            :items="actions.menu(operation, { open: false, viewPublic: false, onChanged: refresh, onRemoved: () => navigateTo(links.admin()) })"
          />
        </template>
      </PageHeading>

      <SectionCard :title="t('admin.keyFacts', 'Operation')">
        <DescriptionList :items="facts" />
      </SectionCard>

      <component
        :is="tabs"
        v-if="tabs"
        name="admin.operations"
        :context="{ operation }"
        @refresh="refresh"
      />
      <DetailsTab
        v-else
        :operation="operation"
        @refresh="refresh"
      />
    </template>

    <UEmpty
      v-else-if="forbidden"
      icon="i-lucide-lock"
      :title="t('admin.forbidden', 'You do not have access to operations')"
      :actions="[{ label: t('admin.allOperations', 'All operations'), to: links.admin(), color: 'neutral', variant: 'outline' }]"
    />
    <UEmpty
      v-else-if="notFound || !error"
      icon="i-lucide-tent"
      :title="t('notFound', 'Operation not found')"
      :actions="[{ label: t('admin.allOperations', 'All operations'), to: links.admin(), color: 'neutral', variant: 'outline' }]"
    />
    <UEmpty
      v-else
      icon="i-lucide-circle-alert"
      :title="t('admin.operationLoadFailed', 'The operation could not be loaded')"
      :description="errorMessage(error, '')"
      :actions="[{ label: t('tryAgain', 'Try again'), icon: 'i-lucide-rotate-ccw', color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
    />
  </div>
</template>
