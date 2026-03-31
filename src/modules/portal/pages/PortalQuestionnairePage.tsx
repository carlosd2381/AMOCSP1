import { type ReactNode, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Card } from '@/components/ui/Card'
import { StatusPill } from '@/components/ui/StatusPill'
import { usePortalContext } from '@/hooks/usePortalContext'
import { useBranding } from '@/contexts/BrandingContext'
import { fetchQuestionnaire, saveQuestionnaire, type QuestionnaireFormValues } from '@/services/questionnaireService'

const QuestionnaireSchema: z.ZodType<QuestionnaireFormValues> = z.object({
  clientNames: z.string().min(3, 'Please share your full names.'),
  clientEmail: z.string().email('Valid email required.'),
  plannerName: z.string().min(3),
  plannerEmail: z.string().email('Enter a planner email.'),
  plannerPhone: z.string().min(8, 'We use this the day of the event.'),
  eventTitle: z.string().min(3),
  startDate: z.string().min(1, 'Select the event date.'),
  startTime: z.string().min(1, 'Start time helps us plan crew call time.'),
  endTime: z.string().optional().default(''),
  ceremonyLocation: z.string().min(3),
  receptionLocation: z.string().optional().default(''),
  guestCount: z.preprocess(
    (value) => (typeof value === 'number' && !Number.isNaN(value) ? value : null),
    z.number().nullable(),
  ),
  notes: z.string().optional().default(''),
})

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
  const step = portal?.steps.find((item) => item.key === 'questionnaire')

  const { data: snapshot, isLoading } = useQuery({
    queryKey: ['portal-questionnaire', eventId],
    queryFn: () =>
      fetchQuestionnaire(eventId!, {
        clientFallback: { name: portal?.lead?.clientName, email: portal?.lead?.clientEmail },
      }),
    enabled: Boolean(eventId),
  })

  const form = useForm<QuestionnaireFormValues>({
    // @ts-expect-error zodResolver typing conflicts with branded form value shape
    resolver: zodResolver(QuestionnaireSchema),
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
    mutation.mutate({ submit: true, values: normalizeValues(values as unknown as QuestionnaireFormValues) })
  })

  const saveDraft = form.handleSubmit((values) => {
    if (!eventId) return
    mutation.mutate({ submit: false, values: normalizeValues(values as unknown as QuestionnaireFormValues) })
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
          <section className="grid gap-4 md:grid-cols-2">
            <Field label="Client names">
              <input className={INPUT_CLASS} placeholder="Couple or company" {...form.register('clientNames')} />
              <FieldError message={form.formState.errors.clientNames?.message} />
            </Field>
            <Field label="Best email">
              <input className={INPUT_CLASS} placeholder="client@email.com" {...form.register('clientEmail')} />
              <FieldError message={form.formState.errors.clientEmail?.message} />
            </Field>
            <Field label="Planner name">
              <input className={INPUT_CLASS} placeholder="Planner or concierge" {...form.register('plannerName')} />
              <FieldError message={form.formState.errors.plannerName?.message} />
            </Field>
            <Field label="Planner email">
              <input className={INPUT_CLASS} placeholder="planner@email.com" {...form.register('plannerEmail')} />
              <FieldError message={form.formState.errors.plannerEmail?.message} />
            </Field>
            <Field label="Planner phone">
              <input className={INPUT_CLASS} placeholder="+52 555 000 0000" {...form.register('plannerPhone')} />
              <FieldError message={form.formState.errors.plannerPhone?.message} />
            </Field>
            <Field label="Guest count">
              <input type="number" className={INPUT_CLASS} {...form.register('guestCount', { valueAsNumber: true })} />
            </Field>
          </section>

          <section className="grid gap-4 md:grid-cols-3">
            <Field label="Event title">
              <input className={INPUT_CLASS} placeholder="Luisa & Diego — Valle" {...form.register('eventTitle')} />
              <FieldError message={form.formState.errors.eventTitle?.message} />
            </Field>
            <Field label="Start date">
              <input type="date" className={INPUT_CLASS} {...form.register('startDate')} />
              <FieldError message={form.formState.errors.startDate?.message} />
            </Field>
            <Field label="Start time">
              <input type="time" className={INPUT_CLASS} {...form.register('startTime')} />
              <FieldError message={form.formState.errors.startTime?.message} />
            </Field>
            <Field label="End time">
              <input type="time" className={INPUT_CLASS} {...form.register('endTime')} />
            </Field>
            <Field label="Ceremony location">
              <input className={INPUT_CLASS} placeholder="Venue or address" {...form.register('ceremonyLocation')} />
              <FieldError message={form.formState.errors.ceremonyLocation?.message} />
            </Field>
            <Field label="Reception location">
              <input className={INPUT_CLASS} placeholder="If different" {...form.register('receptionLocation')} />
            </Field>
          </section>

          <section>
            <Field label="Notes & timeline">
              <textarea rows={5} className={TEXTAREA_CLASS} placeholder="Share planners, timelines, traditions, or special requests." {...form.register('notes')} />
            </Field>
          </section>

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
  return {
    ...values,
    guestCount: typeof values.guestCount === 'number' && !Number.isNaN(values.guestCount) ? values.guestCount : null,
  }
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="text-xs uppercase tracking-[0.4em] text-brand-muted">
      {label}
      <div className="mt-2">{children}</div>
    </label>
  )
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="mt-1 text-xs text-amber-300">{message}</p>
}