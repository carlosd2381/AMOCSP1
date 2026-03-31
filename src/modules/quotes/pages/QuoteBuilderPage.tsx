import { useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { Card } from '@/components/ui/Card'
import { summarizeQuote } from '@/services/quoteService'
import { fetchLatestProposal, TAX_CODES_ORDER } from '@/services/proposalService'
import { useBranding } from '@/contexts/BrandingContext'
import type { LineItem, TaxCode } from '@/types'
import { StatusPill } from '@/components/ui/StatusPill'

const QuoteSchema = z.object({
  currency: z.string().min(1),
  taxes: z.record(z.enum(['IVA', 'IVA_RET', 'ISR', 'ISR_RET']), z.boolean()),
})

type QuoteSchemaType = z.infer<typeof QuoteSchema>

const FALLBACK_LINE_ITEMS: LineItem[] = [
  { id: 'placeholder-1', description: 'Editorial coverage', quantity: 1, unitPrice: 100000 },
]

const EMPTY_TAXES: Record<TaxCode, boolean> = {
  IVA: true,
  IVA_RET: false,
  ISR: true,
  ISR_RET: false,
}

export function QuoteBuilderPage() {
  const { brand } = useBranding()
  const [searchParams] = useSearchParams()
  const leadId = searchParams.get('leadId') ?? undefined

  const { data, isLoading } = useQuery({
    queryKey: ['proposal', brand.slug, leadId],
    queryFn: () => fetchLatestProposal(brand.slug, { leadId }),
  })

  const form = useForm<QuoteSchemaType>({
    resolver: zodResolver(QuoteSchema),
    defaultValues: {
      currency: data?.currency ?? 'MXN',
      taxes: data?.taxToggleDefaults ?? EMPTY_TAXES,
    },
  })

  useEffect(() => {
    if (data) {
      form.reset({
        currency: data.currency,
        taxes: data.taxToggleDefaults,
      })
    }
  }, [data, form])

  const watchTaxes = useWatch({ control: form.control, name: 'taxes' })
  const selectedCurrency = useWatch({ control: form.control, name: 'currency' }) ?? 'MXN'
  const lineItems = data?.lineItems?.length ? data.lineItems : FALLBACK_LINE_ITEMS
  const rawSummary = useMemo(() => summarizeQuote(lineItems), [lineItems])
  const computedSummary = useMemo(() => {
    const taxes = rawSummary.taxes.filter((tax) => watchTaxes?.[tax.code])
    const totalTaxes = taxes.reduce((acc, tax) => acc + tax.amount * (tax.isWithheld ? -1 : 1), 0)
    return {
      subtotal: rawSummary.subtotal,
      taxes,
      grandTotal: rawSummary.subtotal + totalTaxes,
    }
  }, [rawSummary, watchTaxes])

  return (
    <div className="space-y-6">
      <Card title="Quote builder" actions={<StatusPill label={data?.status ?? 'Draft'} />}>
        <div className="space-y-4">
          <p className="text-sm text-brand-muted">
            Configure per-brand taxes and payment terms. Data syncs to Supabase functions powering Stripe payment intents
            and PDF template merges.
          </p>
          <form className="grid gap-4 md:grid-cols-3">
            <label className="text-xs uppercase tracking-[0.3em] text-brand-muted">
              Currency
              <select
                className="mt-1 w-full rounded-2xl border border-border/40 bg-transparent px-3 py-2 text-sm text-white"
                {...form.register('currency')}
              >
                <option value="MXN">MXN</option>
                <option value="USD">USD</option>
              </select>
            </label>
            {TAX_CODES_ORDER.map((tax) => (
              <label key={tax} className="flex items-center gap-2 rounded-2xl border border-border/40 px-3 py-2 text-sm text-white">
                <input type="checkbox" className="accent-brand-primary" {...form.register(`taxes.${tax}` as const)} />
                {tax}
              </label>
            ))}
          </form>
        </div>
      </Card>

      <Card title="Line items" subdued>
        {lineItems.length === 0 ? (
          <p className="text-sm text-brand-muted">No line items found for this brand yet. Create a proposal in Supabase to see it here.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-[0.2em] text-brand-muted">
              <tr>
                <th className="text-left">Service</th>
                <th className="text-right">Qty</th>
                <th className="text-right">Unit</th>
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((item) => (
                <tr key={item.id} className="border-t border-border/20">
                  <td className="py-3 text-white">{item.description}</td>
                  <td className="py-3 text-right text-brand-muted">{item.quantity}</td>
                  <td className="py-3 text-right text-brand-muted">
                    {item.unitPrice.toLocaleString('es-MX', { style: 'currency', currency: selectedCurrency })}
                  </td>
                  <td className="py-3 text-right">
                    {(item.quantity * item.unitPrice).toLocaleString('es-MX', {
                      style: 'currency',
                      currency: selectedCurrency,
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Tax breakdown">
        <div className="space-y-2 text-sm">
          {computedSummary.taxes.map((tax) => (
              <div key={tax.code} className="flex items-center justify-between rounded-2xl border border-border/20 px-4 py-3">
                <div>
                  <p className="font-semibold text-white">{tax.displayName}</p>
                  <p className="text-xs text-brand-muted">{Math.round(tax.rate * 100)}%</p>
                </div>
                <p className="text-base font-semibold text-white">
                  {tax.amount.toLocaleString('es-MX', { style: 'currency', currency: selectedCurrency })}
                </p>
              </div>
            ))}
          <div className="flex items-center justify-between border-t border-border/30 pt-4 text-base font-semibold text-white">
            <span>Total with taxes</span>
            <span>
              {computedSummary.grandTotal.toLocaleString('es-MX', {
                style: 'currency',
                currency: selectedCurrency,
              })}
            </span>
          </div>
        </div>
      </Card>
      {isLoading && <p className="text-xs uppercase tracking-[0.3em] text-brand-muted">Syncing proposal…</p>}
    </div>
  )
}
