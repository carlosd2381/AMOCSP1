import { type ReactNode, useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Card } from '@/components/ui/Card'
import { StatusPill } from '@/components/ui/StatusPill'
import { usePortalContext } from '@/hooks/usePortalContext'
import { useBranding } from '@/contexts/BrandingContext'
import { fetchLatestProposal } from '@/services/proposalService'
import { fetchQuestionnaire, saveQuestionnaire, type QuestionnaireFormValues } from '@/services/questionnaireService'
import {
  fetchQuestionnaireTemplateSettings,
  type QuestionnaireTemplateDefinition,
  type QuestionnaireTemplateField,
} from '@/services/questionnaireTemplateSettingsService'

const EMPTY_VALUES: QuestionnaireFormValues = {
  clientNames: '',
  clientEmail: '',
  plannerName: '',
  plannerEmail: '',
  plannerPhone: '',
  eventTitle: '',
  startDate: '',
  startTime: '',
  endTime: '',
  ceremonyLocation: '',
  receptionLocation: '',
  guestCount: null,
  notes: '',
}

const INPUT_CLASS = 'w-full rounded-2xl border border-border/40 bg-transparent px-3 py-2 text-sm text-white placeholder:text-brand-muted focus:border-brand-primary/60'
const TEXTAREA_CLASS = 'w-full rounded-3xl border border-border/40 bg-transparent px-3 py-3 text-sm text-white placeholder:text-brand-muted focus:border-brand-primary/60'

export function PortalQuestionnairePage() {
  const { brand } = useBranding()
  const queryClient = useQueryClient()
  const { data: portal, isLoading: isPortalLoading } = usePortalContext()
  const eventId = portal?.event?.id
  const proposalId = portal?.proposal?.id
  const leadId = portal?.lead?.id
  const step = portal?.steps.find((item) => item.key === 'questionnaire')

  const questionnaireTemplateSettingsQuery = useQuery({
    queryKey: ['settings-questionnaire-templates', brand.slug],
    queryFn: () => fetchQuestionnaireTemplateSettings(brand.slug),
  })

  const proposalQuery = useQuery({
    queryKey: ['portal-selected-questionnaire-template', brand.slug, proposalId, leadId],
    queryFn: () => fetchLatestProposal(brand.slug, proposalId ? { proposalId } : { leadId }),
    enabled: Boolean(proposalId || leadId),
  })

  const selectedTemplate = useMemo(() => {
    const templates = questionnaireTemplateSettingsQuery.data?.templates ?? []
    if (!templates.length) return null

    const selectedTemplateId = proposalQuery.data?.selectedQuestionnaireTemplateId
    if (selectedTemplateId) {
      const matched = templates.find((template) => template.id === selectedTemplateId)
      if (matched) return matched
    }

    if (!questionnaireTemplateSettingsQuery.data?.applyByDefaultWhenMissing) {
      return null
    }

    return templates.find((template) => template.isDefault) ?? templates[0]
  }, [
    questionnaireTemplateSettingsQuery.data?.applyByDefaultWhenMissing,
    questionnaireTemplateSettingsQuery.data?.templates,
    proposalQuery.data?.selectedQuestionnaireTemplateId,
  ])

  const { data: snapshot, isLoading } = useQuery({
    queryKey: ['portal-questionnaire', eventId, selectedTemplate?.id ?? 'no-template'],
    queryFn: () =>
      fetchQuestionnaire(eventId!, {
        clientFallback: { name: portal?.lead?.clientName, email: portal?.lead?.clientEmail },
        template: selectedTemplate,
      }),
    enabled: Boolean(eventId),
  })

  const form = useForm<QuestionnaireFormValues>({
    defaultValues: snapshot?.values ?? EMPTY_VALUES,
  })

  useEffect(() => {
    if (snapshot?.values) {
      form.reset(snapshot.values)
    }
  }, [snapshot, form])

  const mutation = useMutation({
    mutationFn: ({ submit, values }: { submit: boolean; values: QuestionnaireFormValues }) => {
      if (!eventId) {
        throw new Error('Missing event context for questionnaire.')
      }
      return saveQuestionnaire({
        eventId,
        brandSlug: brand.slug,
        leadId: portal?.lead?.id,
        template: selectedTemplate ?? undefined,
        payload: values,
        submit,
      })
    },
    onSuccess: async (_, variables) => {
      toast.success(variables.submit ? 'Questionnaire submitted. Contract is next!' : 'Draft saved.')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['portal-questionnaire', eventId] }),
        queryClient.invalidateQueries({ queryKey: ['portal-context', brand.slug] }),
      ])
    },
    onError: (error) => {
      console.error(error)
      toast.error('Unable to sync questionnaire. Try again in a moment.')
    },
  })

  const submitFinal = form.handleSubmit((values) => {
    if (!eventId) return
    const normalizedValues = normalizeValues(values)
    const requiredMessage = validateTemplateRequirements(selectedTemplate, normalizedValues)
    if (requiredMessage) {
      toast.error(requiredMessage)
      return
    }

    mutation.mutate({ submit: true, values: normalizedValues })
  })

  const saveDraft = form.handleSubmit((values) => {
    if (!eventId) return
    mutation.mutate({ submit: false, values: normalizeValues(values) })
  })

  if (!eventId && !isPortalLoading) {
    return (
      <Card title="Questionnaire">
        <p className="text-sm text-brand-muted">
          We need an event attached to this lead before the questionnaire can be filled out. Please contact your producer.
        </p>
      </Card>
    )
  }

  if (step?.status === 'locked') {
    return (
      <Card title="Questionnaire">
        <p className="text-sm text-brand-muted">{step.lockedReason ?? 'Accept the proposal to unlock this step.'}</p>
      </Card>
    )
  }

  return (
    <Card
      title="Planning questionnaire"
      actions={snapshot ? <StatusPill label={snapshot.status} tone={snapshot.status === 'submitted' ? 'success' : 'brand'} /> : null}
    >
      {isLoading ? (
        <p className="text-sm text-brand-muted">Loading saved answers…</p>
      ) : !snapshot ? (
        <p className="text-sm text-brand-muted">Creating questionnaire shell…</p>
      ) : (
        <form className="space-y-6" onSubmit={submitFinal}>
          {selectedTemplate ? (
            <div className="space-y-4">
              <div className="border border-border/30 bg-surface-muted/20 p-3 text-xs text-brand-muted">
                <p className="font-semibold uppercase tracking-[0.2em]">Template in use</p>
                <p className="mt-1 text-white">{selectedTemplate.name}</p>
                {selectedTemplate.description ? <p className="mt-1">{selectedTemplate.description}</p> : null}
              </div>
              <section className="grid gap-4 md:grid-cols-2">
                {selectedTemplate.fields.map((field) => (
                  <TemplateField key={field.id} field={field} form={form} />
                ))}
              </section>
            </div>
          ) : (
            <p className="text-sm text-brand-muted">
              No questionnaire template could be selected for this proposal. Configure templates in settings or set a default.
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={saveDraft}
              disabled={mutation.isPending}
              className="rounded-2xl border border-border/40 px-5 py-2 text-xs font-semibold uppercase tracking-[0.4em] text-brand-muted disabled:opacity-60"
            >
              Save draft
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="rounded-2xl border border-brand-primary/40 bg-brand-primary/30 px-5 py-2 text-xs font-semibold uppercase tracking-[0.4em] text-white disabled:opacity-60"
            >
              {mutation.isPending ? 'Syncing…' : 'Submit questionnaire'}
            </button>
          </div>
        </form>
      )}
    </Card>
  )
}

function normalizeValues(values: QuestionnaireFormValues): QuestionnaireFormValues {
  const normalized: QuestionnaireFormValues = { ...values }

  for (const [key, value] of Object.entries(normalized)) {
    if (typeof value === 'string') {
      normalized[key] = value.trim()
      continue
    }

    if (Array.isArray(value)) {
      normalized[key] = value
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter(Boolean)
      continue
    }

    if (typeof value === 'number' && Number.isNaN(value)) {
      normalized[key] = null
    }
  }

  return {
    ...normalized,
    guestCount: typeof normalized.guestCount === 'number' && !Number.isNaN(normalized.guestCount)
      ? normalized.guestCount
      : null,
  }
}

function validateTemplateRequirements(
  template: QuestionnaireTemplateDefinition | null,
  values: QuestionnaireFormValues,
): string | null {
  if (!template) return null

  for (const field of template.fields) {
    if (!field.required) continue

    const value = values[field.id]
    const isMissing =
      value === null
      || typeof value === 'undefined'
      || (typeof value === 'string' && !value.trim())
      || (Array.isArray(value) && value.length === 0)

    if (isMissing) {
      return `Please complete required field: ${field.label}`
    }
  }

  return null
}

function TemplateField({
  field,
  form,
}: {
  field: QuestionnaireTemplateField
  form: ReturnType<typeof useForm<QuestionnaireFormValues>>
}) {
  const optionFields = new Set(['multiple_choice', 'dropdown', 'checkboxes', 'radio_buttons'])
  const isOptionField = optionFields.has(field.type)
  const options = field.options?.length ? field.options : ['Option 1']

  return (
    <Field label={field.label} required={field.required} helpText={field.helpText}>
      {field.type === 'paragraph_text' ? (
        <textarea
          rows={5}
          className={TEXTAREA_CLASS}
          placeholder={field.placeholder || 'Enter your answer'}
          {...form.register(field.id)}
        />
      ) : null}

      {field.type === 'date' ? (
        <input type="date" className={INPUT_CLASS} {...form.register(field.id)} />
      ) : null}

      {field.type === 'time' ? (
        <input type="time" className={INPUT_CLASS} {...form.register(field.id)} />
      ) : null}

      {field.type === 'number' ? (
        <input type="number" className={INPUT_CLASS} placeholder={field.placeholder || '0'} {...form.register(field.id, { valueAsNumber: true })} />
      ) : null}

      {field.type === 'email' ? (
        <input type="email" className={INPUT_CLASS} placeholder={field.placeholder || 'name@email.com'} {...form.register(field.id)} />
      ) : null}

      {field.type === 'phone' ? (
        <input type="tel" className={INPUT_CLASS} placeholder={field.placeholder || '+52 555 000 0000'} {...form.register(field.id)} />
      ) : null}

      {field.type === 'single_line_text' ? (
        <input className={INPUT_CLASS} placeholder={field.placeholder || 'Enter your answer'} {...form.register(field.id)} />
      ) : null}

      {isOptionField && field.type === 'dropdown' ? (
        <select className={INPUT_CLASS} {...form.register(field.id)}>
          <option value="">Select one</option>
          {options.map((option) => (
            <option key={`${field.id}-${option}`} value={option}>{option}</option>
          ))}
        </select>
      ) : null}

      {isOptionField && field.type === 'radio_buttons' ? (
        <div className="space-y-2 border border-border/30 bg-surface-muted/20 p-3 text-sm text-white">
          {options.map((option) => (
            <label key={`${field.id}-${option}`} className="flex items-center gap-2">
              <input type="radio" value={option} className="accent-brand-primary" {...form.register(field.id)} />
              <span>{option}</span>
            </label>
          ))}
        </div>
      ) : null}

      {isOptionField && (field.type === 'checkboxes' || field.type === 'multiple_choice') ? (
        <div className="space-y-2 border border-border/30 bg-surface-muted/20 p-3 text-sm text-white">
          {options.map((option) => (
            <label key={`${field.id}-${option}`} className="flex items-center gap-2">
              <input
                type="checkbox"
                value={option}
                className="accent-brand-primary"
                {...form.register(field.id)}
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
      ) : null}
    </Field>
  )
}

function Field({
  label,
  required,
  helpText,
  children,
}: {
  label: string
  required?: boolean
  helpText?: string
  children: ReactNode
}) {
  return (
    <label className="text-xs uppercase tracking-[0.4em] text-brand-muted">
      {label}{required ? ' *' : ''}
      <div className="mt-2">{children}</div>
      {helpText ? <p className="mt-2 normal-case tracking-normal text-brand-muted">{helpText}</p> : null}
    </label>
  )
}