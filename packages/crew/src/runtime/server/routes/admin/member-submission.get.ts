import { idParams, notFound } from '@frigear-nu/module-kit/server'
import { crewAccess } from '../../../access'
import type { CrewSubmissionDto } from '../../../../types'

// The answers of a person's application, with the form's labels (the version they answered). They are personal data:
// `crew:pii` only, which `crew:*` and `*` never cover.
export default defineEventHandler(async (event): Promise<CrewSubmissionDto> => {
  await authorize(event, crewAccess.permissions.pii)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const entry = await getCrewEntryOr404(id)
  if (!entry.member.submissionId) throw notFound('This person has no stored application.')
  const submission = await findSubmissionById(entry.member.submissionId)
  // The submission must be the person's own: a row that was edited by hand never shows somebody else's answers.
  if (submission.userId !== entry.member.userId) throw notFound('This person has no stored application.')
  return {
    id: submission.id,
    formSlug: submission.formSlug,
    createdAt: submission.createdAt.toISOString(),
    locale: submission.locale,
    answers: renderAnswers(submission.definitionSnapshot, submission.answers, submission.locale),
  }
})
