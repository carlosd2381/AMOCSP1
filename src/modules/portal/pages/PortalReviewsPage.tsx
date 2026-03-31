import { useEffect } from 'react'
import { useForm, type UseFormRegister } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Card } from '@/components/ui/Card'
import { StatusPill } from '@/components/ui/StatusPill'
import { usePortalContext } from '@/hooks/usePortalContext'
import { useBranding } from '@/contexts/BrandingContext'
import { fetchReview, submitReview, type ReviewFormValues } from '@/services/reviewService'

const ReviewSchema: z.ZodType<ReviewFormValues> = z.object({
  ratingOverall: z.number().min(1).max(5),
  ratingStaff: z.number().min(1).max(5),
  ratingMedia: z.number().min(1).max(5),
  comments: z.string().min(10, 'Share a bit more detail for our team.'),
  testimonial: z.string().optional().default(''),
  clientEmail: z.string().email(),
})

const DEFAULT_VALUES: ReviewFormValues = {
  ratingOverall: 5,
  ratingStaff: 5,
  ratingMedia: 5,
  comments: '',
  testimonial: '',
  clientEmail: '',
}

export function PortalReviewsPage() {
  const { brand } = useBranding()
  const queryClient = useQueryClient()
  const { data: portal, isLoading: isPortalLoading } = usePortalContext()
  const eventId = portal?.event?.id
  const step = portal?.steps.find((item) => item.key === 'reviews')
  const unlocksAt = portal?.review?.unlocksAt

  const { data: snapshot, isLoading } = useQuery({
    queryKey: ['portal-review', eventId],
    queryFn: () => fetchReview(eventId!, { clientEmail: portal?.lead?.clientEmail }),
    enabled: Boolean(eventId) && step?.status !== 'locked',
  })

  const form = useForm<ReviewFormValues>({
    // @ts-expect-error zodResolver typing conflicts with branded form value shape
    resolver: zodResolver(ReviewSchema),
    defaultValues: snapshot?.values ?? DEFAULT_VALUES,
  })

  useEffect(() => {
    if (snapshot?.values) {
      form.reset(snapshot.values)
    }
  }, [snapshot, form])

  const mutation = useMutation({
    mutationFn: (values: ReviewFormValues) => {
      if (!eventId) {
        throw new Error('Missing event context for reviews.')
      }
      return submitReview({ eventId, brandSlug: brand.slug, payload: values })
    },
    onSuccess: async () => {
      toast.success('Thanks for sharing your experience!')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['portal-review', eventId] }),
        queryClient.invalidateQueries({ queryKey: ['portal-context', brand.slug] }),
      ])
    },
    onError: (error) => {
      console.error(error)
      toast.error('Unable to submit your feedback right now.')
    },
  })

  const submit = form.handleSubmit((values) => {
    if (!eventId) return
    mutation.mutate(values as unknown as ReviewFormValues)
  })

  if (step?.status === 'locked') {
    return (
      <Card title="Reviews">
        <p className="text-sm text-brand-muted">
          {step.lockedReason ?? 'We will unlock reviews 24 hours after your celebration ends.'}
        </p>
        {unlocksAt && (
          <p className="mt-2 text-xs text-brand-muted">Opens {new Date(unlocksAt).toLocaleDateString('es-MX', { dateStyle: 'medium' })}.</p>
        )}
      </Card>
    )
  }

  if (!eventId && !isPortalLoading) {
    return (
      <Card title="Reviews">
        <p className="text-sm text-brand-muted">We will open this page once your event is scheduled.</p>
      </Card>
    )
  }

  return (
    <Card
      title="Share your experience"
      actions={snapshot ? <StatusPill label={snapshot.status} tone={snapshot.status === 'submitted' ? 'success' : 'brand'} /> : null}
    >
      {isLoading ? (
        <p className="text-sm text-brand-muted">Preparing review form…</p>
      ) : !snapshot ? (
        <p className="text-sm text-brand-muted">We could not load the review form. Please try again later.</p>
      ) : (
        <form className="space-y-5" onSubmit={submit}>
          <RatingRow label="Overall experience" name="ratingOverall" register={form.register} error={form.formState.errors.ratingOverall?.message} />
          <RatingRow label="Staff & direction" name="ratingStaff" register={form.register} error={form.formState.errors.ratingStaff?.message} />
          <RatingRow label="Media quality" name="ratingMedia" register={form.register} error={form.formState.errors.ratingMedia?.message} />

          <label className="block text-xs uppercase tracking-[0.35em] text-brand-muted">
            Direct feedback
            <textarea
              rows={4}
              className="mt-2 w-full rounded-3xl border border-border/40 bg-transparent px-3 py-3 text-sm text-white focus:border-brand-primary/60"
              placeholder="Tell us about moments we should repeat or improve."
              {...form.register('comments')}
            />
            <FieldError message={form.formState.errors.comments?.message} />
          </label>

          <label className="block text-xs uppercase tracking-[0.35em] text-brand-muted">
            Optional public testimonial
            <textarea
              rows={3}
              className="mt-2 w-full rounded-3xl border border-border/40 bg-transparent px-3 py-3 text-sm text-white focus:border-brand-primary/60"
              placeholder="What should future couples know about AMO/CSP?"
              {...form.register('testimonial')}
            />
          </label>

          <label className="block text-xs uppercase tracking-[0.35em] text-brand-muted">
            Confirmation email
            <input
              className="mt-2 w-full rounded-2xl border border-border/40 bg-transparent px-3 py-2 text-sm text-white focus:border-brand-primary/60"
              {...form.register('clientEmail')}
            />
            <FieldError message={form.formState.errors.clientEmail?.message} />
          </label>

          <button
            type="submit"
            disabled={mutation.isPending}
            className="rounded-2xl border border-brand-primary/40 bg-brand-primary/30 px-5 py-2 text-xs font-semibold uppercase tracking-[0.35em] text-white disabled:opacity-60"
          >
            {mutation.isPending ? 'Sharing…' : snapshot.status === 'submitted' ? 'Update review' : 'Submit review'}
          </button>
        </form>
      )}
    </Card>
  )
}

interface RatingRowProps {
  label: string
  name: keyof Pick<ReviewFormValues, 'ratingOverall' | 'ratingStaff' | 'ratingMedia'>
  register: UseFormRegister<ReviewFormValues>
  error?: string
}

function RatingRow({ label, name, register, error }: RatingRowProps) {
  return (
    <label className="block text-xs uppercase tracking-[0.35em] text-brand-muted">
      {label}
      <select
        className="mt-2 w-full rounded-2xl border border-border/40 bg-transparent px-3 py-2 text-sm text-white focus:border-brand-primary/60"
        {...register(name, { valueAsNumber: true })}
      >
        {[5, 4, 3, 2, 1].map((score) => (
          <option key={score} value={score}>
            {score} — {score === 5 ? 'Exceptional' : score === 4 ? 'Great' : score === 3 ? 'Good' : score === 2 ? 'Fair' : 'Needs love'}
          </option>
        ))}
      </select>
      <FieldError message={error} />
    </label>
  )
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="mt-1 text-xs text-amber-300">{message}</p>
}
