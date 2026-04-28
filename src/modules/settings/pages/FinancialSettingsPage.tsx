import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { useBranding } from '@/contexts/BrandingContext'
import {
  fetchFinancialSettings,
  saveFinancialSettings,
  type FinancialSettings,
} from '@/services/financialSettingsService'
import { calculateNetTaxEffectFromFinancialDefaults } from '@/services/financialTaxService'

function emptyDraft(): FinancialSettings {
  return {
    defaultCurrency: 'MXN',
    defaultInvoiceDueDays: 7,
    defaultPaymentGraceDays: 2,
    onlinePaymentFeePercent: 3.6,
    lateFeePercent: 0,
    taxDefaults: {
      iva: { enabled: true, ratePercent: 16 },
      ivaRetention: { enabled: false, ratePercent: 10.6667 },
      isr: { enabled: false, ratePercent: 1.25 },
      isrRetention: { enabled: false, ratePercent: 10 },
    },
    accountingNotes: '',
  }
}

function numberInput(value: string, fallback = 0) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return parsed
}

export function FinancialSettingsPage() {
  const { brand } = useBranding()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<FinancialSettings>(emptyDraft())

  const settingsQuery = useQuery({
    queryKey: ['settings-financials', brand.slug],
    queryFn: () => fetchFinancialSettings(brand.slug),
  })

  useEffect(() => {
    if (!settingsQuery.data) return
    setDraft(settingsQuery.data)
  }, [settingsQuery.data])

  const hasChanges = useMemo(() => {
    if (!settingsQuery.data) return false
    return JSON.stringify(settingsQuery.data) !== JSON.stringify(draft)
  }, [settingsQuery.data, draft])

  const previewTaxAmount = useMemo(() => {
    const base = 10000
    return calculateNetTaxEffectFromFinancialDefaults(base, draft)
  }, [draft])

  const saveMutation = useMutation({
    mutationFn: () => saveFinancialSettings(brand.slug, draft),
    onSuccess: async (saved) => {
      queryClient.setQueryData(['settings-financials', brand.slug], saved)
      await queryClient.invalidateQueries({ queryKey: ['settings-financials', brand.slug] })
      toast.success('Financial settings updated')
    },
    onError: (error) => {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Unable to save financial settings')
    },
  })

  const disabled = settingsQuery.isLoading || saveMutation.isPending

  return (
    <div className="space-y-4">
      <Card title="Financial" className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-brand-muted">
              Configure currency behavior, invoice terms, and tax defaults used across quotes and billing workflows.
            </p>
            <Link to="/settings" className="mt-3 inline-flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-brand-primary">
              <ArrowLeft size={12} /> Back to settings
            </Link>
          </div>
          <button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={disabled || !hasChanges}
            className="btn-compact-primary"
          >
            {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </Card>

      {settingsQuery.isLoading ? (
        <Card title="Financial Defaults" className="p-4">
          <p className="text-sm text-brand-muted">Loading financial settings...</p>
        </Card>
      ) : (
        <>
          <Card title="Currency & Terms" className="p-4">
            <div className="grid gap-3 md:grid-cols-3">
              <label className="grid gap-1 text-xs uppercase tracking-[0.12em] text-brand-muted">
                Default Currency
                <select
                  value={draft.defaultCurrency}
                  onChange={(event) => setDraft((prev) => ({ ...prev, defaultCurrency: event.target.value === 'USD' ? 'USD' : 'MXN' }))}
                  className="select-compact"
                  disabled={disabled}
                >
                  <option value="MXN">MXN</option>
                  <option value="USD">USD</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs uppercase tracking-[0.12em] text-brand-muted">
                Invoice Due Days
                <input
                  type="number"
                  min={0}
                  max={365}
                  value={draft.defaultInvoiceDueDays}
                  onChange={(event) => setDraft((prev) => ({ ...prev, defaultInvoiceDueDays: numberInput(event.target.value, 0) }))}
                  className="input-compact"
                  disabled={disabled}
                />
              </label>
              <label className="grid gap-1 text-xs uppercase tracking-[0.12em] text-brand-muted">
                Payment Grace Days
                <input
                  type="number"
                  min={0}
                  max={365}
                  value={draft.defaultPaymentGraceDays}
                  onChange={(event) => setDraft((prev) => ({ ...prev, defaultPaymentGraceDays: numberInput(event.target.value, 0) }))}
                  className="input-compact"
                  disabled={disabled}
                />
              </label>
            </div>
          </Card>

          <Card title="Tax Defaults" className="p-4">
            <div className="grid gap-3 md:grid-cols-2">
              {([
                { key: 'iva', label: 'IVA' },
                { key: 'isr', label: 'ISR' },
                { key: 'ivaRetention', label: 'IVA Retention' },
                { key: 'isrRetention', label: 'ISR Retention' },
              ] as const).map((tax) => (
                <div key={tax.key} className="border border-border/40 bg-surface-muted/20 p-3">
                  <label className="flex items-center justify-between gap-2 text-xs uppercase tracking-[0.12em] text-brand-muted">
                    <span>{tax.label}</span>
                    <input
                      type="checkbox"
                      checked={draft.taxDefaults[tax.key].enabled}
                      onChange={(event) => setDraft((prev) => ({
                        ...prev,
                        taxDefaults: {
                          ...prev.taxDefaults,
                          [tax.key]: {
                            ...prev.taxDefaults[tax.key],
                            enabled: event.target.checked,
                          },
                        },
                      }))}
                      className="accent-brand-primary"
                      disabled={disabled}
                    />
                  </label>
                  <label className="mt-3 grid gap-1 text-xs uppercase tracking-[0.12em] text-brand-muted">
                    Rate (%)
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step="0.0001"
                      value={draft.taxDefaults[tax.key].ratePercent}
                      onChange={(event) => setDraft((prev) => ({
                        ...prev,
                        taxDefaults: {
                          ...prev.taxDefaults,
                          [tax.key]: {
                            ...prev.taxDefaults[tax.key],
                            ratePercent: numberInput(event.target.value, 0),
                          },
                        },
                      }))}
                      className="input-compact"
                      disabled={disabled}
                    />
                  </label>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Fees & Controls" className="p-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-xs uppercase tracking-[0.12em] text-brand-muted">
                Online Payment Fee (%)
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={draft.onlinePaymentFeePercent}
                  onChange={(event) => setDraft((prev) => ({ ...prev, onlinePaymentFeePercent: numberInput(event.target.value, 0) }))}
                  className="input-compact"
                  disabled={disabled}
                />
              </label>
              <label className="grid gap-1 text-xs uppercase tracking-[0.12em] text-brand-muted">
                Late Fee (%)
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={draft.lateFeePercent}
                  onChange={(event) => setDraft((prev) => ({ ...prev, lateFeePercent: numberInput(event.target.value, 0) }))}
                  className="input-compact"
                  disabled={disabled}
                />
              </label>
              <label className="grid gap-1 text-xs uppercase tracking-[0.12em] text-brand-muted md:col-span-2">
                Accounting Notes
                <textarea
                  value={draft.accountingNotes}
                  onChange={(event) => setDraft((prev) => ({ ...prev, accountingNotes: event.target.value }))}
                  className="input-compact min-h-[96px]"
                  placeholder="Internal notes for billing team..."
                  disabled={disabled}
                />
              </label>
            </div>
          </Card>

          <Card title="Impact Preview" className="p-4">
            <div className="border border-border/40 bg-surface-muted/20 p-4 text-sm">
              <p className="text-brand-muted">Sample subtotal:</p>
              <p className="text-white">10,000.00 {draft.defaultCurrency}</p>
              <p className="mt-2 text-brand-muted">Net tax effect from defaults:</p>
              <p className="text-white">{previewTaxAmount >= 0 ? '+' : ''}{previewTaxAmount.toFixed(2)} {draft.defaultCurrency}</p>
              <p className="mt-2 text-brand-muted">Projected due date rule: issue date + {draft.defaultInvoiceDueDays} day(s)</p>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
