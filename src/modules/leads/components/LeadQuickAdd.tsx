import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Card } from '@/components/ui/Card'
import { useBranding } from '@/contexts/BrandingContext'

const LeadSchema = z.object({
  name: z.string().min(3),
  email: z.string().email(),
  eventDate: z.string().min(1),
  brandSlug: z.enum(['amo', 'csp']),
})

type LeadSchemaType = z.infer<typeof LeadSchema>

interface LeadQuickAddProps {
  onCreate: (payload: LeadSchemaType) => Promise<void>
}

export function LeadQuickAdd({ onCreate }: LeadQuickAddProps) {
  const { brand } = useBranding()
  const {
    register,
    handleSubmit,
    reset,
    getValues,
    formState: { isSubmitting },
  } = useForm<LeadSchemaType>({
    resolver: zodResolver(LeadSchema),
    defaultValues: {
      name: '',
      email: '',
      eventDate: '',
      brandSlug: brand.slug,
    },
  })

  useEffect(() => {
    const current = getValues()
    reset({
      ...current,
      brandSlug: brand.slug,
    })
  }, [brand.slug, getValues, reset])

  const submit = handleSubmit(async (values) => {
    try {
      await onCreate(values)
      reset({
        name: '',
        email: '',
        eventDate: '',
        brandSlug: values.brandSlug,
      })
    } catch (error) {
      console.error('Quick add lead failed', error)
    }
  })

  return (
    <Card title="Quick add lead">
      <form onSubmit={submit} className="grid gap-3 md:grid-cols-2">
        <label className="text-xs uppercase tracking-[0.3em] text-brand-muted">
          Full name
          <input
            className="mt-1 w-full rounded-2xl border border-border/40 bg-transparent px-3 py-2 text-sm text-white focus:border-brand-primary/60"
            placeholder="Client or brand"
            {...register('name')}
          />
        </label>
        <label className="text-xs uppercase tracking-[0.3em] text-brand-muted">
          Email
          <input
            className="mt-1 w-full rounded-2xl border border-border/40 bg-transparent px-3 py-2 text-sm text-white focus:border-brand-primary/60"
            placeholder="client@email.mx"
            {...register('email')}
          />
        </label>
        <label className="text-xs uppercase tracking-[0.3em] text-brand-muted">
          Event date
          <input
            type="date"
            className="mt-1 w-full rounded-2xl border border-border/40 bg-transparent px-3 py-2 text-sm text-white focus:border-brand-primary/60"
            {...register('eventDate')}
          />
        </label>
        <label className="text-xs uppercase tracking-[0.3em] text-brand-muted">
          Brand
          <select
            className="mt-1 w-full rounded-2xl border border-border/40 bg-transparent px-3 py-2 text-sm text-white focus:border-brand-primary/60"
            {...register('brandSlug')}
          >
            <option value="amo">AMO</option>
            <option value="csp">CSP</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={isSubmitting}
          className="col-span-full rounded-2xl border border-brand-primary/40 bg-brand-primary/20 px-4 py-3 text-sm font-semibold tracking-wider text-white transition hover:border-brand-primary/60"
        >
          {isSubmitting ? 'Saving…' : 'Add lead to pipeline'}
        </button>
      </form>
    </Card>
  )
}
