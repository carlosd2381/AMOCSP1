import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { useBranding } from '@/contexts/BrandingContext'
import {
  fetchCompanyDetails,
  saveCompanyDetails,
  type CompanyDetails,
} from '@/services/companyDetailsService'

function emptyDraft(): CompanyDetails {
  return {
    legalBusinessName: '',
    displayName: '',
    taxId: '',
    registrationNumber: '',
    supportEmail: '',
    supportPhone: '',
    website: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    stateProvince: '',
    postalCode: '',
    country: '',
    headerNote: '',
  }
}

function buildPreviewLines(draft: CompanyDetails) {
  const displayName = draft.displayName.trim() || draft.legalBusinessName.trim() || 'Your Company Name'
  const addressLines = [
    draft.addressLine1.trim(),
    draft.addressLine2.trim(),
    [draft.city.trim(), draft.stateProvince.trim()].filter(Boolean).join(', '),
    [draft.postalCode.trim(), draft.country.trim()].filter(Boolean).join(' '),
  ].filter(Boolean)

  const contactLines = [draft.supportEmail.trim(), draft.supportPhone.trim(), draft.website.trim()].filter(Boolean)

  const complianceLine = [
    draft.taxId.trim() ? `Tax ID: ${draft.taxId.trim()}` : null,
    draft.registrationNumber.trim() ? `Reg #: ${draft.registrationNumber.trim()}` : null,
  ].filter(Boolean).join(' • ')

  return {
    displayName,
    addressLines,
    contactLines,
    complianceLine,
    headerNote: draft.headerNote.trim(),
  }
}

export function CompanyDetailsSettingsPage() {
  const { brand } = useBranding()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<CompanyDetails>(emptyDraft())

  const detailsQuery = useQuery({
    queryKey: ['settings-company-details', brand.slug],
    queryFn: () => fetchCompanyDetails(brand.slug),
  })

  useEffect(() => {
    if (!detailsQuery.data) return
    setDraft(detailsQuery.data)
  }, [detailsQuery.data])

  const hasChanges = useMemo(() => {
    if (!detailsQuery.data) return false
    return JSON.stringify(detailsQuery.data) !== JSON.stringify(draft)
  }, [detailsQuery.data, draft])

  const preview = useMemo(() => buildPreviewLines(draft), [draft])

  const saveMutation = useMutation({
    mutationFn: () => saveCompanyDetails(brand.slug, draft),
    onSuccess: async (saved) => {
      queryClient.setQueryData(['settings-company-details', brand.slug], saved)
      await queryClient.invalidateQueries({ queryKey: ['settings-company-details', brand.slug] })
      toast.success('Company details updated')
    },
    onError: (error) => {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Unable to save company details')
    },
  })

  const disabled = detailsQuery.isLoading || saveMutation.isPending

  return (
    <div className="space-y-4">
      <Card title="Company Details" className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-brand-muted">
              Manage the legal and contact details that will power document headers for quotes, contracts, and invoices.
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

      {detailsQuery.isLoading ? (
        <Card title="Company Profile" className="p-4">
          <p className="text-sm text-brand-muted">Loading company details...</p>
        </Card>
      ) : (
        <>
          <Card title="Business Identity" className="p-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-xs uppercase tracking-[0.12em] text-brand-muted">
                Legal Business Name
                <input
                  value={draft.legalBusinessName}
                  onChange={(event) => setDraft((prev) => ({ ...prev, legalBusinessName: event.target.value }))}
                  className="input-compact"
                  placeholder="AMO Studio S de RL"
                  disabled={disabled}
                />
              </label>
              <label className="grid gap-1 text-xs uppercase tracking-[0.12em] text-brand-muted">
                Public Display Name
                <input
                  value={draft.displayName}
                  onChange={(event) => setDraft((prev) => ({ ...prev, displayName: event.target.value }))}
                  className="input-compact"
                  placeholder="AMO Studio"
                  disabled={disabled}
                />
              </label>
              <label className="grid gap-1 text-xs uppercase tracking-[0.12em] text-brand-muted">
                Tax ID / RFC
                <input
                  value={draft.taxId}
                  onChange={(event) => setDraft((prev) => ({ ...prev, taxId: event.target.value }))}
                  className="input-compact"
                  placeholder="AMO123456789"
                  disabled={disabled}
                />
              </label>
              <label className="grid gap-1 text-xs uppercase tracking-[0.12em] text-brand-muted">
                Registration Number
                <input
                  value={draft.registrationNumber}
                  onChange={(event) => setDraft((prev) => ({ ...prev, registrationNumber: event.target.value }))}
                  className="input-compact"
                  placeholder="Optional"
                  disabled={disabled}
                />
              </label>
            </div>
          </Card>

          <Card title="Public Contact" className="p-4">
            <div className="grid gap-3 md:grid-cols-3">
              <label className="grid gap-1 text-xs uppercase tracking-[0.12em] text-brand-muted">
                Support Email
                <input
                  value={draft.supportEmail}
                  onChange={(event) => setDraft((prev) => ({ ...prev, supportEmail: event.target.value }))}
                  className="input-compact"
                  placeholder="hola@example.com"
                  disabled={disabled}
                />
              </label>
              <label className="grid gap-1 text-xs uppercase tracking-[0.12em] text-brand-muted">
                Support Phone
                <input
                  value={draft.supportPhone}
                  onChange={(event) => setDraft((prev) => ({ ...prev, supportPhone: event.target.value }))}
                  className="input-compact"
                  placeholder="+52 55 0000 0000"
                  disabled={disabled}
                />
              </label>
              <label className="grid gap-1 text-xs uppercase tracking-[0.12em] text-brand-muted">
                Website
                <input
                  value={draft.website}
                  onChange={(event) => setDraft((prev) => ({ ...prev, website: event.target.value }))}
                  className="input-compact"
                  placeholder="https://amo.mx"
                  disabled={disabled}
                />
              </label>
            </div>
          </Card>

          <Card title="Address" className="p-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-xs uppercase tracking-[0.12em] text-brand-muted md:col-span-2">
                Address Line 1
                <input
                  value={draft.addressLine1}
                  onChange={(event) => setDraft((prev) => ({ ...prev, addressLine1: event.target.value }))}
                  className="input-compact"
                  placeholder="Street and number"
                  disabled={disabled}
                />
              </label>
              <label className="grid gap-1 text-xs uppercase tracking-[0.12em] text-brand-muted md:col-span-2">
                Address Line 2
                <input
                  value={draft.addressLine2}
                  onChange={(event) => setDraft((prev) => ({ ...prev, addressLine2: event.target.value }))}
                  className="input-compact"
                  placeholder="Suite / neighborhood / reference"
                  disabled={disabled}
                />
              </label>
              <label className="grid gap-1 text-xs uppercase tracking-[0.12em] text-brand-muted">
                City
                <input
                  value={draft.city}
                  onChange={(event) => setDraft((prev) => ({ ...prev, city: event.target.value }))}
                  className="input-compact"
                  disabled={disabled}
                />
              </label>
              <label className="grid gap-1 text-xs uppercase tracking-[0.12em] text-brand-muted">
                State / Province
                <input
                  value={draft.stateProvince}
                  onChange={(event) => setDraft((prev) => ({ ...prev, stateProvince: event.target.value }))}
                  className="input-compact"
                  disabled={disabled}
                />
              </label>
              <label className="grid gap-1 text-xs uppercase tracking-[0.12em] text-brand-muted">
                Postal Code
                <input
                  value={draft.postalCode}
                  onChange={(event) => setDraft((prev) => ({ ...prev, postalCode: event.target.value }))}
                  className="input-compact"
                  disabled={disabled}
                />
              </label>
              <label className="grid gap-1 text-xs uppercase tracking-[0.12em] text-brand-muted">
                Country
                <input
                  value={draft.country}
                  onChange={(event) => setDraft((prev) => ({ ...prev, country: event.target.value }))}
                  className="input-compact"
                  disabled={disabled}
                />
              </label>
            </div>
          </Card>

          <Card title="Header Note" className="p-4">
            <label className="grid gap-1 text-xs uppercase tracking-[0.12em] text-brand-muted">
              Optional note shown in document headers
              <textarea
                value={draft.headerNote}
                onChange={(event) => setDraft((prev) => ({ ...prev, headerNote: event.target.value }))}
                className="input-compact min-h-[96px]"
                placeholder="Ex: Prices in MXN. Banking details available upon request."
                disabled={disabled}
              />
            </label>
          </Card>

          <Card title="Document Header Preview" className="p-4">
            <div className="border border-border/40 bg-surface-muted/20 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-brand-muted">Preview</p>
                  <h3 className="mt-1 text-lg font-semibold text-white">{preview.displayName}</h3>
                  {preview.addressLines.map((line) => (
                    <p key={`address-${line}`} className="text-sm text-brand-muted">{line}</p>
                  ))}
                  {preview.contactLines.map((line) => (
                    <p key={`contact-${line}`} className="text-sm text-brand-muted">{line}</p>
                  ))}
                  {preview.complianceLine ? <p className="text-sm text-brand-muted">{preview.complianceLine}</p> : null}
                  {preview.headerNote ? <p className="mt-1 text-sm text-brand-muted">{preview.headerNote}</p> : null}
                </div>
                <div className="h-16 w-16 border border-border/50 bg-surface/50 text-[10px] uppercase tracking-[0.14em] text-brand-muted grid place-items-center">
                  Logo
                </div>
              </div>
            </div>
            <p className="mt-3 text-xs text-brand-muted">
              This preview mirrors the company header block used by quote, invoice, and contract PDFs.
            </p>
          </Card>
        </>
      )}
    </div>
  )
}
