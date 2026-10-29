import type { DropdownMenuItem } from '@nuxt/ui'
import { LazyFormCreateSlideover, LazyFormImportSlideover } from '#components'
import type { FormAdminDto, FormImportResultDto, FormStatus, FormStorage, SubmissionDeliveryDto } from '../../../types'
import { formsApi } from '../../utils'

/** What the actions need to know about a form: a list row or the loaded form fits. */
export interface FormActionTarget {
  id: string
  name: string
  slug: string
  status: FormStatus
  storage?: FormStorage
  submissionCount?: number
}

/** What the submission actions need: the id and the form it belongs to (a list row has no `formId`, so pages add it). */
export interface SubmissionActionTarget {
  id: string
  formId: string
}

/** What importing reports back: slugs that were created and slugs that already existed. */
export type FormImportResult = FormImportResultDto

/** The cache key of the admin form list, so every action can refresh it. */
export const FORMS_LIST_KEY = 'forms:admin:forms'

/** Create, duplicate, archive, import and redeliver for forms, plus the `⋯` menu every list and detail page uses. */
export function useFormActions() {
  const t = useModuleT('forms')
  const paths = useFormsPaths()
  const link = useFormLink()
  const overlay = useOverlay()
  const confirm = useConfirmDialog()
  const toast = useToast()
  const showError = useErrorToast()
  const { busy, run } = useAction()

  const creator = overlay.create(LazyFormCreateSlideover, { destroyOnClose: true })
  const importer = overlay.create(LazyFormImportSlideover, { destroyOnClose: true })

  /** Opens the create form, then the new form's editor. Resolves with the created form, or `false` when cancelled. */
  async function create(): Promise<FormAdminDto | false> {
    const created = await creator.open().result
    if (created) await navigateTo(paths('adminForm', { id: created.id }))
    return created
  }

  /** Copies the form into a new draft and opens it. */
  async function clone(form: Pick<FormActionTarget, 'id'>): Promise<boolean> {
    const copy = await run(
      () => $fetch<FormAdminDto>(formsApi.admin.clone(form.id), { method: 'POST' }),
      { success: t('admin.cloned', 'Form duplicated') },
    )
    if (!copy) return false
    await navigateTo(paths('adminForm', { id: copy.id }))
    return true
  }

  /** Archives after a confirmation (forms are never deleted: their submissions would lose their form). */
  async function remove(form: Pick<FormActionTarget, 'id' | 'name'>): Promise<boolean> {
    const confirmed = await confirm({
      title: t('admin.archiveTitle', 'Archive {name}?', { name: form.name }),
      description: t('admin.archiveBody', 'It stops accepting submissions and disappears from the public site. Its submissions are kept.'),
      confirmText: t('admin.archive', 'Archive form'),
      destructive: true,
    })
    if (!confirmed) return false
    const archived = await run(
      // 204 No Content: `run` resolves with `undefined` on failure, so map success to `true`.
      () => $fetch(formsApi.admin.form(form.id), { method: 'DELETE' }).then(() => true),
      { success: t('admin.archived', 'Form archived') },
    )
    if (!archived) return false
    await refreshNuxtData(FORMS_LIST_KEY)
    return true
  }

  /** Opens the import slideover (pasted JSON), then refreshes the list. Resolves with `false` when cancelled. */
  async function importJson(): Promise<boolean> {
    const result: FormImportResult | false = await importer.open().result
    if (!result) return false
    toast.add({
      title: t('admin.imported', 'Imported {inserted}, skipped {skipped} existing.', { inserted: result.inserted.length, skipped: result.skipped.length }),
      color: 'success',
    })
    await refreshNuxtData(FORMS_LIST_KEY)
    return true
  }

  /** Runs the delivery hooks of a stored submission again. */
  async function redeliver(submissionId: string): Promise<boolean> {
    const result = await run(() => $fetch<SubmissionDeliveryDto>(formsApi.admin.redeliver(submissionId), { method: 'POST' }))
    if (!result) return false
    if (result.deliveryStatus === 'failed') {
      showError(new Error(result.deliveryError ?? ''), t('delivery.failed', 'Delivery failed'))
      return false
    }
    toast.add({ title: t('admin.redelivered', 'Delivered again'), color: 'success', icon: 'i-lucide-check' })
    return true
  }

  /**
   * The row menu: Open (unless `open` is false, as on the detail page), then `extra`, Submissions, Copy link and
   * Duplicate, then Archive in its own group. `onRemoved` runs after the form was archived.
   */
  function menu(form: FormActionTarget, options: { open?: boolean, extra?: DropdownMenuItem[], onRemoved?: () => void | Promise<void> } = {}): DropdownMenuItem[][] {
    const items: DropdownMenuItem[] = []
    if (options.open ?? true) {
      items.push({ label: t('admin.open', 'Open'), icon: 'i-lucide-arrow-right', to: paths('adminForm', { id: form.id }) })
    }
    items.push(...options.extra ?? [])
    if (form.storage === 'db' || (form.submissionCount ?? 0) > 0) {
      items.push({
        label: t('admin.submissionsTitle', 'Submissions'),
        icon: 'i-lucide-inbox',
        to: paths('adminSubmissions', { id: form.id }),
      })
    }
    if (form.status === 'published' && link.enabled.value) {
      items.push({ label: t('admin.copyLink', 'Copy link'), icon: 'i-lucide-link', onSelect: () => link.copy(form.slug) })
    }
    items.push({ label: t('admin.clone', 'Duplicate form'), icon: 'i-lucide-copy', onSelect: () => clone(form) })

    const groups: DropdownMenuItem[][] = [items]
    if (form.status !== 'archived') {
      groups.push([{
        label: t('admin.archive', 'Archive form'),
        icon: 'i-lucide-archive',
        color: 'error',
        onSelect: async () => {
          if (await remove(form)) await options.onRemoved?.()
        },
      }])
    }
    return groups
  }

  /** The `⋯` menu of a submission: Open (unless `open` is false) and Deliver again; `onRedelivered` runs after a successful delivery. */
  function submissionMenu(submission: SubmissionActionTarget, options: { open?: boolean, onRedelivered?: () => void | Promise<void> } = {}): DropdownMenuItem[][] {
    const items: DropdownMenuItem[] = []
    if (options.open ?? true) {
      items.push({
        label: t('admin.open', 'Open'),
        icon: 'i-lucide-arrow-right',
        to: paths('adminSubmission', { id: submission.formId, submissionId: submission.id }),
      })
    }
    items.push({
      label: t('admin.redeliver', 'Deliver again'),
      icon: 'i-lucide-send',
      onSelect: async () => {
        if (await redeliver(submission.id)) await options.onRedelivered?.()
      },
    })
    return [items]
  }

  return { busy, create, clone, remove, importJson, redeliver, menu, submissionMenu }
}
