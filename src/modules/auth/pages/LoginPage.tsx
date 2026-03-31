import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuth } from '@/contexts/AuthContext'
import { useBranding } from '@/contexts/BrandingContext'

const LoginSchema = z.object({
  email: z.string().email(),
  brandId: z.enum(['amo', 'csp']).optional(),
})

type LoginSchemaType = z.infer<typeof LoginSchema>

export function LoginPage() {
  const { signIn } = useAuth()
  const { brand } = useBranding()
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<LoginSchemaType>({
    resolver: zodResolver(LoginSchema),
    defaultValues: {
      brandId: brand.slug,
    },
  })

  const onSubmit = handleSubmit(async (values) => {
    await signIn({ email: values.email, brandId: values.brandId })
  })

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface text-white">
      <form onSubmit={onSubmit} className="w-full max-w-md space-y-4 rounded-4xl border border-border/40 bg-surface-muted/60 p-8">
        <h1 className="text-2xl font-semibold">
          Sign in to {brand.slug === 'amo' ? 'AMO' : 'CSP'} admin
        </h1>
        <label className="text-xs uppercase tracking-[0.3em] text-brand-muted">
          Email
          <input
            type="email"
            className="mt-1 w-full rounded-2xl border border-border/40 bg-transparent px-3 py-2 text-sm text-white"
            {...register('email')}
          />
        </label>
        <label className="text-xs uppercase tracking-[0.3em] text-brand-muted">
          Brand
          <select
            className="mt-1 w-full rounded-2xl border border-border/40 bg-transparent px-3 py-2 text-sm text-white"
            {...register('brandId')}
          >
            <option value="amo">AMO</option>
            <option value="csp">CSP</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-2xl border border-brand-primary/40 bg-brand-primary/20 px-4 py-3 text-sm font-semibold"
        >
          {isSubmitting ? 'Securing session…' : 'Send magic link'}
        </button>
      </form>
    </div>
  )
}
