import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Card } from '@/components/ui/Card'
import { useBranding } from '@/contexts/BrandingContext'
import {
  calculateSuggestedSellPrice,
  createAtomicService,
  createPackagePreset,
  DEFAULT_PRICING_INPUTS,
  deleteAtomicService,
  deletePackagePreset,
  duplicateAtomicService,
  duplicatePackagePreset,
  fetchAtomicServices,
  fetchPackagePresets,
  fetchPricingInputProfile,
  fetchServicePricingTiers,
  upsertPricingInputProfile,
  updatePackagePreset,
  updateAtomicService,
  upsertServicePricingMatrix,
  type PackagePresetComponent,
} from '@/services/serviceCatalogComposerService'
import type { PricingCatalogKey } from '@/types'

const HOURS = Array.from({ length: 14 }, (_v, index) => index + 1)
const EMPTY_PRESET_HOURLY_PRICE_BY_HOUR = HOURS.reduce<Record<number, number>>((acc, hours) => {
  acc[hours] = 0
  return acc
}, {})
const CATALOG_OPTIONS: Array<{ value: PricingCatalogKey; label: string }> = [
  { value: 'INT_USD_ENG', label: 'International Pricing (USD-ENG)' },
  { value: 'MEX_MXN_ESP', label: 'National Pricing (MXN-ESP)' },
]

interface MatrixRowDraft {
  hours: number
  cost: number
  price: number
}

interface PricingInputsDraft {
  adminPercent: number
  salesPercent: number
  plannerPercent: number
  profitPercent: number
  paymentFeePercent: number
  taxPercent: number
  includeTaxInSellPrice: boolean
}

export function ServiceCatalogComposerPanel() {
  const { brand } = useBranding()
  const queryClient = useQueryClient()

  const [newServiceName, setNewServiceName] = useState('')
  const [newServiceDescription, setNewServiceDescription] = useState('')
  const [newServiceDescriptionEs, setNewServiceDescriptionEs] = useState('')
  const [selectedServiceId, setSelectedServiceId] = useState<string>('')
  const [selectedCatalog, setSelectedCatalog] = useState<PricingCatalogKey>('INT_USD_ENG')
  const [newServiceNameEs, setNewServiceNameEs] = useState('')
  const [selectedServiceNameEsDraft, setSelectedServiceNameEsDraft] = useState('')
  const [selectedServiceNameDraft, setSelectedServiceNameDraft] = useState('')
  const [selectedServiceDescriptionDraft, setSelectedServiceDescriptionDraft] = useState('')
  const [selectedServiceDescriptionEsDraft, setSelectedServiceDescriptionEsDraft] = useState('')
  const [matrixDraft, setMatrixDraft] = useState<MatrixRowDraft[]>([])
  const [pricingInputsDraft, setPricingInputsDraft] = useState<PricingInputsDraft>({
    adminPercent: DEFAULT_PRICING_INPUTS.adminPercent,
    salesPercent: DEFAULT_PRICING_INPUTS.salesPercent,
    plannerPercent: DEFAULT_PRICING_INPUTS.plannerPercent,
    profitPercent: DEFAULT_PRICING_INPUTS.profitPercent,
    paymentFeePercent: DEFAULT_PRICING_INPUTS.paymentFeePercent,
    taxPercent: DEFAULT_PRICING_INPUTS.taxPercent,
    includeTaxInSellPrice: DEFAULT_PRICING_INPUTS.includeTaxInSellPrice,
  })

  const [presetName, setPresetName] = useState('')
  const [presetDescription, setPresetDescription] = useState('')
  const [presetHourlyPriceByHour, setPresetHourlyPriceByHour] = useState<Record<number, number>>(EMPTY_PRESET_HOURLY_PRICE_BY_HOUR)
  const [componentServiceId, setComponentServiceId] = useState('')
  const [componentQuantity, setComponentQuantity] = useState(1)
  const [componentBillingMode, setComponentBillingMode] = useState<'priced' | 'included'>('included')
  const [presetComponents, setPresetComponents] = useState<PackagePresetComponent[]>([])
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null)
  const [deletePresetId, setDeletePresetId] = useState<string | null>(null)
  const [deletePresetStep, setDeletePresetStep] = useState<1 | 2>(1)
  const [deleteServiceId, setDeleteServiceId] = useState<string | null>(null)
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1)

  const servicesQuery = useQuery({
    queryKey: ['service-catalog', brand.slug, selectedCatalog],
    queryFn: () => fetchAtomicServices(brand.slug),
  })

  const tiersQuery = useQuery({
    queryKey: ['service-pricing-matrix', brand.slug, selectedCatalog],
    queryFn: () => fetchServicePricingTiers(brand.slug, selectedCatalog),
  })

  const presetsQuery = useQuery({
    queryKey: ['package-presets', brand.slug, selectedCatalog],
    queryFn: () => fetchPackagePresets(brand.slug, selectedCatalog),
  })

  const pricingInputsQuery = useQuery({
    queryKey: ['pricing-input-profile', brand.slug, selectedCatalog],
    queryFn: () => fetchPricingInputProfile(brand.slug, selectedCatalog),
  })

  const services = useMemo(() => servicesQuery.data ?? [], [servicesQuery.data])
  const tiers = useMemo(() => tiersQuery.data ?? [], [tiersQuery.data])
  const presets = useMemo(() => presetsQuery.data ?? [], [presetsQuery.data])

  const selectedService = useMemo(
    () => services.find((service) => service.id === selectedServiceId) ?? null,
    [services, selectedServiceId],
  )

  const selectedServiceTiers = useMemo(
    () => tiers.filter((row) => row.serviceId === selectedServiceId),
    [tiers, selectedServiceId],
  )

  const matrixOverviewRows = useMemo(() => {
    return services
      .map((service) => {
        const serviceTiers = tiers.filter((row) => row.serviceId === service.id)
        const configuredTiers = serviceTiers.filter((row) => row.cost > 0 || row.price > 0)
        const prices = configuredTiers.map((row) => row.price)
        const costs = configuredTiers.map((row) => row.cost)

        return {
          serviceId: service.id,
          serviceName: service.name,
          configuredHours: configuredTiers.length,
          minPrice: prices.length ? Math.min(...prices) : 0,
          maxPrice: prices.length ? Math.max(...prices) : 0,
          minCost: costs.length ? Math.min(...costs) : 0,
          maxCost: costs.length ? Math.max(...costs) : 0,
        }
      })
      .sort((a, b) => a.serviceName.localeCompare(b.serviceName))
  }, [services, tiers])

  useEffect(() => {
    if (!services.length) {
      const timer = window.setTimeout(() => {
        setSelectedServiceId('')
      }, 0)
      return () => window.clearTimeout(timer)
    }

    if (!selectedServiceId || !services.some((service) => service.id === selectedServiceId)) {
      const timer = window.setTimeout(() => {
        setSelectedServiceId(services[0].id)
      }, 0)
      return () => window.clearTimeout(timer)
    }

    return undefined
  }, [selectedServiceId, services])

  useEffect(() => {
    const nextDraft = HOURS.map((hours) => {
      const tier = selectedServiceTiers.find((row) => row.hours === hours)
      return {
        hours,
        cost: tier?.cost ?? 0,
        price: tier?.price ?? 0,
      }
    })

    const timer = window.setTimeout(() => {
      setMatrixDraft(nextDraft)
    }, 0)

    return () => window.clearTimeout(timer)
  }, [selectedServiceTiers])

  useEffect(() => {
    if (!pricingInputsQuery.data) return
    const profile = pricingInputsQuery.data
    setPricingInputsDraft({
      adminPercent: profile.adminPercent,
      salesPercent: profile.salesPercent,
      plannerPercent: profile.plannerPercent,
      profitPercent: profile.profitPercent,
      paymentFeePercent: profile.paymentFeePercent,
      taxPercent: profile.taxPercent,
      includeTaxInSellPrice: profile.includeTaxInSellPrice,
    })
  }, [pricingInputsQuery.data])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSelectedServiceNameDraft(selectedService?.name ?? '')
      setSelectedServiceNameEsDraft(selectedService?.nameEs ?? '')
      setSelectedServiceDescriptionDraft(selectedService?.description ?? '')
      setSelectedServiceDescriptionEsDraft(selectedService?.descriptionEs ?? '')
    }, 0)
    return () => window.clearTimeout(timer)
  }, [selectedService])

  const createServiceMutation = useMutation({
    mutationFn: () => createAtomicService(brand.slug, {
      name: newServiceName,
      description: newServiceDescription,
      descriptionEs: newServiceDescriptionEs,
      isActive: true,
      nameEs: newServiceNameEs,
    }),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ['service-catalog', brand.slug, selectedCatalog] })
      setSelectedServiceId(created.id)
      setNewServiceName('')
      setNewServiceDescription('')
      setNewServiceDescriptionEs('')
      toast.success('Service added')
      setNewServiceNameEs('')
    },
    onError: (error) => {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Unable to add service')
    },
  })

  const saveMatrixMutation = useMutation({
    mutationFn: () => {
      if (!selectedServiceId) throw new Error('Select a service first')
      return upsertServicePricingMatrix(brand.slug, selectedCatalog, selectedServiceId, matrixDraft)
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['service-pricing-matrix', brand.slug, selectedCatalog] })
      toast.success(`Pricing matrix saved (${result.created} created, ${result.updated} updated)`)
    },
    onError: (error) => {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Unable to save matrix')
    },
  })

  const savePricingInputsMutation = useMutation({
    mutationFn: () => upsertPricingInputProfile(brand.slug, selectedCatalog, pricingInputsDraft),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['pricing-input-profile', brand.slug, selectedCatalog] })
      toast.success('Pricing inputs saved')
    },
    onError: (error) => {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Unable to save pricing inputs')
    },
  })

  const updateServiceMutation = useMutation({
    mutationFn: () => {
      if (!selectedServiceId) throw new Error('Select a service first')
      return updateAtomicService(brand.slug, selectedServiceId, {
        name: selectedServiceNameDraft,
        description: selectedServiceDescriptionDraft,
        descriptionEs: selectedServiceDescriptionEsDraft,
        isActive: true,
        nameEs: selectedServiceNameEsDraft,
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['service-catalog', brand.slug, selectedCatalog] })
      toast.success('Service details updated')
    },
    onError: (error) => {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Unable to update service')
    },
  })

  const createPresetMutation = useMutation({
    mutationFn: () => createPackagePreset(brand.slug, selectedCatalog, {
      name: presetName,
      description: presetDescription,
      isActive: true,
      hourlyPriceByHour: toHourlyPricePayload(presetHourlyPriceByHour),
      components: presetComponents,
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['package-presets', brand.slug, selectedCatalog] })
      resetPresetForm()
      toast.success('Package preset created')
    },
    onError: (error) => {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Unable to create preset')
    },
  })

  const updatePresetMutation = useMutation({
    mutationFn: () => {
      if (!editingPresetId) throw new Error('Select a preset first')
      return updatePackagePreset(brand.slug, selectedCatalog, editingPresetId, {
        name: presetName,
        description: presetDescription,
        isActive: true,
        hourlyPriceByHour: toHourlyPricePayload(presetHourlyPriceByHour),
        components: presetComponents,
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['package-presets', brand.slug, selectedCatalog] })
      resetPresetForm()
      toast.success('Preset updated')
    },
    onError: (error) => {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Unable to update preset')
    },
  })

  const duplicatePresetMutation = useMutation({
    mutationFn: (presetId: string) => duplicatePackagePreset(brand.slug, selectedCatalog, presetId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['package-presets', brand.slug, selectedCatalog] })
      toast.success('Preset duplicated')
    },
    onError: (error) => {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Unable to duplicate preset')
    },
  })

  const deletePresetMutation = useMutation({
    mutationFn: (presetId: string) => deletePackagePreset(brand.slug, selectedCatalog, presetId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['package-presets', brand.slug, selectedCatalog] })
      if (editingPresetId === deletePresetId) {
        resetPresetForm()
      }
      setDeletePresetId(null)
      setDeletePresetStep(1)
      toast.success('Preset deleted')
    },
    onError: (error) => {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Unable to delete preset')
    },
  })

  const duplicateServiceMutation = useMutation({
    mutationFn: (serviceId: string) => duplicateAtomicService(brand.slug, serviceId),
    onSuccess: async (created) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['service-catalog', brand.slug, selectedCatalog] }),
        queryClient.invalidateQueries({ queryKey: ['service-pricing-matrix', brand.slug, selectedCatalog] }),
      ])
      setSelectedServiceId(created.id)
      toast.success('Service duplicated')
    },
    onError: (error) => {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Unable to duplicate service')
    },
  })

  const deleteServiceMutation = useMutation({
    mutationFn: (serviceId: string) => deleteAtomicService(brand.slug, serviceId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['service-catalog', brand.slug, selectedCatalog] }),
        queryClient.invalidateQueries({ queryKey: ['service-pricing-matrix', brand.slug, selectedCatalog] }),
        queryClient.invalidateQueries({ queryKey: ['package-presets', brand.slug, selectedCatalog] }),
      ])
      setDeleteServiceId(null)
      setDeleteStep(1)
      toast.success('Service deleted')
    },
    onError: (error) => {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Unable to delete service')
    },
  })

  const handleCreateService = async () => {
    if (!newServiceName.trim()) {
      toast.error('Service name is required')
      return
    }

    await createServiceMutation.mutateAsync()
  }

  const handleMatrixFieldChange = (hours: number, field: 'cost' | 'price', value: string) => {
    const numeric = Number(value)
    setMatrixDraft((current) => current.map((row) => {
      if (row.hours !== hours) return row
      return {
        ...row,
        [field]: Number.isFinite(numeric) ? numeric : 0,
      }
    }))
  }

  const applySuggestedPricesFromInputs = () => {
    setMatrixDraft((current) => current.map((row) => ({
      ...row,
      price: calculateSuggestedSellPrice(row.cost, pricingInputsDraft),
    })))
    toast.success('Suggested prices applied from pricing inputs')
  }

  const handleAddPresetComponent = () => {
    if (!componentServiceId) {
      toast.error('Select a service to add')
      return
    }

    setPresetComponents((current) => {
      const existingIndex = current.findIndex((component) => (
        component.serviceId === componentServiceId
        && (component.billingMode ?? 'priced') === componentBillingMode
      ))
      const quantity = Number.isFinite(componentQuantity) && componentQuantity > 0 ? Math.round(componentQuantity) : 1

      if (existingIndex >= 0) {
        const next = [...current]
        next[existingIndex] = {
          ...next[existingIndex],
          quantity: next[existingIndex].quantity + quantity,
        }
        return next
      }

      return [...current, { serviceId: componentServiceId, quantity, billingMode: componentBillingMode }]
    })

    setComponentServiceId('')
    setComponentQuantity(1)
    setComponentBillingMode('included')
  }

  const handleEditPreset = (presetId: string) => {
    const target = presets.find((preset) => preset.id === presetId)
    if (!target) return

    setEditingPresetId(target.id)
    setPresetName(target.name)
    setPresetDescription(target.description)
    setPresetHourlyPriceByHour(buildPresetHourlyPriceDraft(target.hourlyPriceByHour, target.packageHourlyPrice))
    setPresetComponents(target.components.map((component) => ({ ...component })))
    setComponentServiceId('')
    setComponentQuantity(1)
    setComponentBillingMode('included')
  }

  const resetPresetForm = () => {
    setEditingPresetId(null)
    setPresetName('')
    setPresetDescription('')
    setPresetHourlyPriceByHour(EMPTY_PRESET_HOURLY_PRICE_BY_HOUR)
    setPresetComponents([])
    setComponentServiceId('')
    setComponentQuantity(1)
    setComponentBillingMode('included')
  }

  const applyRecommendedBundleModes = () => {
    if (!presetComponents.length) {
      toast.error('Add at least one component first')
      return
    }

    setPresetComponents((current) => current.map((component, index) => ({
      ...component,
      billingMode: index === 0 ? 'priced' : 'included',
    })))
    toast.success('Applied: first priced, remaining included')
  }

  const selectedServiceNameMap = useMemo(() => {
    return new Map(services.map((service) => [service.id, service.name]))
  }, [services])

  return (
    <div className="space-y-4">
      <Card title="Pricing Catalog" className="p-4">
        <div className="grid gap-2 sm:grid-cols-[280px_1fr] sm:items-end">
          <label className="text-xs uppercase tracking-[0.12em] text-brand-muted">
            Active Catalog
            <select
              className="select-compact mt-1 w-full"
              value={selectedCatalog}
              onChange={(event) => setSelectedCatalog(event.target.value as PricingCatalogKey)}
            >
              {CATALOG_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <p className="text-sm text-brand-muted">
            Matrix pricing and package presets below are scoped to the selected catalog only.
          </p>
        </div>
      </Card>

      <Card title="Pricing Inputs" className="p-4">
        <div className="space-y-3">
          <p className="text-sm text-brand-muted">
            Set commissions and fee assumptions used to suggest matrix sell prices from each cost value.
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="text-xs uppercase tracking-[0.12em] text-brand-muted">
              Admin %
              <input
                type="number"
                min={0}
                step="0.01"
                className="input-compact mt-1 w-full"
                value={pricingInputsDraft.adminPercent}
                onChange={(event) => setPricingInputsDraft((prev) => ({ ...prev, adminPercent: Number(event.target.value) || 0 }))}
              />
            </label>
            <label className="text-xs uppercase tracking-[0.12em] text-brand-muted">
              Sales %
              <input
                type="number"
                min={0}
                step="0.01"
                className="input-compact mt-1 w-full"
                value={pricingInputsDraft.salesPercent}
                onChange={(event) => setPricingInputsDraft((prev) => ({ ...prev, salesPercent: Number(event.target.value) || 0 }))}
              />
            </label>
            <label className="text-xs uppercase tracking-[0.12em] text-brand-muted">
              Planner/Venue %
              <input
                type="number"
                min={0}
                step="0.01"
                className="input-compact mt-1 w-full"
                value={pricingInputsDraft.plannerPercent}
                onChange={(event) => setPricingInputsDraft((prev) => ({ ...prev, plannerPercent: Number(event.target.value) || 0 }))}
              />
            </label>
            <label className="text-xs uppercase tracking-[0.12em] text-brand-muted">
              Profit %
              <input
                type="number"
                min={0}
                step="0.01"
                className="input-compact mt-1 w-full"
                value={pricingInputsDraft.profitPercent}
                onChange={(event) => setPricingInputsDraft((prev) => ({ ...prev, profitPercent: Number(event.target.value) || 0 }))}
              />
            </label>
            <label className="text-xs uppercase tracking-[0.12em] text-brand-muted">
              Online Payment Fee %
              <input
                type="number"
                min={0}
                step="0.01"
                className="input-compact mt-1 w-full"
                value={pricingInputsDraft.paymentFeePercent}
                onChange={(event) => setPricingInputsDraft((prev) => ({ ...prev, paymentFeePercent: Number(event.target.value) || 0 }))}
              />
            </label>
            <label className="text-xs uppercase tracking-[0.12em] text-brand-muted">
              Tax % (reference)
              <input
                type="number"
                min={0}
                step="0.01"
                className="input-compact mt-1 w-full"
                value={pricingInputsDraft.taxPercent}
                onChange={(event) => setPricingInputsDraft((prev) => ({ ...prev, taxPercent: Number(event.target.value) || 0 }))}
              />
            </label>
          </div>
          <label className="inline-flex items-center gap-2 text-xs text-brand-muted">
            <input
              type="checkbox"
              className="h-4 w-4 accent-brand-primary"
              checked={pricingInputsDraft.includeTaxInSellPrice}
              onChange={(event) => setPricingInputsDraft((prev) => ({ ...prev, includeTaxInSellPrice: event.target.checked }))}
            />
            Include tax percentage in suggested sell price calculation
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-compact-secondary"
              onClick={() => applySuggestedPricesFromInputs()}
              disabled={!selectedServiceId}
            >
              Apply Suggested Prices to Matrix
            </button>
            <button
              type="button"
              className="btn-compact-primary"
              onClick={() => void savePricingInputsMutation.mutateAsync()}
              disabled={savePricingInputsMutation.isPending}
            >
              {savePricingInputsMutation.isPending ? 'Saving Inputs…' : 'Save Pricing Inputs'}
            </button>
          </div>
        </div>
      </Card>

      <Card title="Service Catalog + Hourly Pricing" className="p-4">
        <div className="space-y-3">
          <p className="text-sm text-brand-muted">
            Build atomic services first, then define cost/price by coverage hour. These services become building blocks for package presets.
          </p>

          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1.2fr_1.2fr_auto]">
            <input
              className="input-compact w-full"
              value={newServiceName}
              onChange={(event) => setNewServiceName(event.target.value)}
              placeholder="Service name (e.g. Highlight Film)"
            />
            <input
              className="input-compact w-full"
              value={newServiceNameEs}
              onChange={(event) => setNewServiceNameEs(event.target.value)}
              placeholder="Service name (Spanish, optional)"
            />
            <input
              className="input-compact w-full"
              value={newServiceDescription}
              onChange={(event) => setNewServiceDescription(event.target.value)}
              placeholder="Description (English)"
            />
            <input
              className="input-compact w-full"
              value={newServiceDescriptionEs}
              onChange={(event) => setNewServiceDescriptionEs(event.target.value)}
              placeholder="Service description (Spanish, optional)"
            />
            <button
              type="button"
              className="btn-compact-primary whitespace-nowrap"
              onClick={() => void handleCreateService()}
              disabled={createServiceMutation.isPending}
            >
              {createServiceMutation.isPending ? 'Adding…' : 'Add Service'}
            </button>
          </div>

          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <select
              className="select-compact w-full"
              value={selectedServiceId}
              onChange={(event) => setSelectedServiceId(event.target.value)}
            >
              {!services.length ? <option value="">No services yet</option> : null}
              {services.map((service) => (
                <option key={service.id} value={service.id}>{service.name}</option>
              ))}
            </select>
            <button
              type="button"
              className="btn-compact-secondary"
              onClick={() => void saveMatrixMutation.mutateAsync()}
              disabled={!selectedServiceId || saveMatrixMutation.isPending}
            >
              {saveMatrixMutation.isPending ? 'Saving Matrix…' : 'Save Matrix'}
            </button>
          </div>

          {selectedService ? (
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1.2fr_1.2fr_auto]">
              <input
                className="input-compact w-full"
                value={selectedServiceNameDraft}
                onChange={(event) => setSelectedServiceNameDraft(event.target.value)}
                placeholder="Service name (English)"
              />
              <input
                className="input-compact w-full"
                value={selectedServiceNameEsDraft}
                onChange={(event) => setSelectedServiceNameEsDraft(event.target.value)}
                placeholder="Service name (Spanish, optional)"
              />
              <input
                className="input-compact w-full"
                value={selectedServiceDescriptionDraft}
                onChange={(event) => setSelectedServiceDescriptionDraft(event.target.value)}
                placeholder="Service description (English)"
              />
              <input
                className="input-compact w-full"
                value={selectedServiceDescriptionEsDraft}
                onChange={(event) => setSelectedServiceDescriptionEsDraft(event.target.value)}
                placeholder="Service description (Spanish, optional)"
              />
              <button
                type="button"
                className="btn-compact-secondary"
                onClick={() => void updateServiceMutation.mutateAsync()}
                disabled={updateServiceMutation.isPending}
              >
                {updateServiceMutation.isPending ? 'Saving…' : 'Save Details'}
              </button>
            </div>
          ) : null}

          {selectedService ? (
            <div className="space-y-3">
              <div className="overflow-x-auto border border-border/40">
                <table className="min-w-full divide-y divide-border/30 text-sm">
                  <thead className="bg-surface-muted/50 text-xs uppercase tracking-[0.08em] text-brand-muted">
                    <tr>
                      <th className="px-3 py-2 text-left">Coverage</th>
                      <th className="px-3 py-2 text-right">Cost</th>
                      <th className="px-3 py-2 text-right">Price</th>
                      <th className="px-3 py-2 text-right">Margin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20">
                    {matrixDraft.map((row) => (
                      <tr key={row.hours} className="transition hover:bg-surface-muted/35">
                        <td className="px-3 py-2.5 text-white">{row.hours} Hour{row.hours === 1 ? '' : 's'}</td>
                        <td className="px-3 py-2.5 text-right">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            className="input-compact w-28 text-right"
                            value={row.cost}
                            onChange={(event) => handleMatrixFieldChange(row.hours, 'cost', event.target.value)}
                          />
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            className="input-compact w-28 text-right"
                            value={row.price}
                            onChange={(event) => handleMatrixFieldChange(row.hours, 'price', event.target.value)}
                          />
                        </td>
                        <td className="px-3 py-2.5 text-right text-brand-muted">{formatCurrency(row.price - row.cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="border border-border/40 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-white">All Services Matrix List</h3>
                  <span className="text-xs text-brand-muted">{matrixOverviewRows.length} services</span>
                </div>
                <div className="overflow-x-auto border border-border/40">
                  <table className="min-w-full divide-y divide-border/30 text-sm">
                    <thead className="bg-surface-muted/50 text-xs uppercase tracking-[0.08em] text-brand-muted">
                      <tr>
                        <th className="px-3 py-2 text-left">Service</th>
                        <th className="px-3 py-2 text-right">Configured Hours</th>
                        <th className="px-3 py-2 text-right">Cost Range</th>
                        <th className="px-3 py-2 text-right">Price Range</th>
                        <th className="px-3 py-2 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/20">
                      {matrixOverviewRows.map((row) => (
                        <tr key={row.serviceId} className="transition hover:bg-surface-muted/35">
                          <td className="px-3 py-2.5 text-white">{row.serviceName}</td>
                          <td className="px-3 py-2.5 text-right text-brand-muted">{row.configuredHours} / {HOURS.length}</td>
                          <td className="px-3 py-2.5 text-right text-brand-muted">{formatRange(row.minCost, row.maxCost, row.configuredHours)}</td>
                          <td className="px-3 py-2.5 text-right text-brand-muted">{formatRange(row.minPrice, row.maxPrice, row.configuredHours)}</td>
                          <td className="px-3 py-2.5 text-right">
                            <div className="flex justify-end gap-1.5">
                              <button
                                type="button"
                                className="btn-compact-secondary"
                                onClick={() => setSelectedServiceId(row.serviceId)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="btn-compact-secondary"
                                onClick={() => void duplicateServiceMutation.mutateAsync(row.serviceId)}
                                disabled={duplicateServiceMutation.isPending}
                              >
                                Duplicate
                              </button>
                              {deleteServiceId === row.serviceId && deleteStep === 2 ? (
                                <button
                                  type="button"
                                  className="btn-compact-secondary border-red-400/50 text-red-200 hover:border-red-300 hover:text-red-100"
                                  onClick={() => void deleteServiceMutation.mutateAsync(row.serviceId)}
                                  disabled={deleteServiceMutation.isPending}
                                >
                                  {deleteServiceMutation.isPending ? 'Deleting…' : 'Delete'}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="btn-compact-secondary border-red-400/50 text-red-200 hover:border-red-300 hover:text-red-100"
                                  onClick={() => {
                                    if (deleteServiceId === row.serviceId && deleteStep === 1) {
                                      setDeleteStep(2)
                                      return
                                    }

                                    setDeleteServiceId(row.serviceId)
                                    setDeleteStep(1)
                                  }}
                                >
                                  {deleteServiceId === row.serviceId && deleteStep === 1 ? 'Continue' : 'Delete'}
                                </button>
                              )}
                              {deleteServiceId === row.serviceId ? (
                                <button
                                  type="button"
                                  className="btn-compact-secondary"
                                  onClick={() => {
                                    setDeleteServiceId(null)
                                    setDeleteStep(1)
                                  }}
                                >
                                  Cancel
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {!matrixOverviewRows.length ? (
                        <tr>
                          <td colSpan={5} className="px-3 py-5 text-center text-sm text-brand-muted">
                            No services yet.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-brand-muted">Add a service to start building its pricing matrix.</p>
          )}
        </div>
      </Card>

      <Card title="Package Presets" className="p-4">
        <div className="space-y-3">
          <p className="text-sm text-brand-muted">
            Create reusable package bundles from atomic services. Next phase will add one-click quote expansion from these presets.
          </p>

          <div className="grid gap-2 sm:grid-cols-3">
            <input
              className="input-compact w-full"
              value={presetName}
              onChange={(event) => setPresetName(event.target.value)}
              placeholder="Preset name (e.g. 2 Photo + 2 Video - 8h)"
            />
            <input
              className="input-compact w-full"
              value={presetDescription}
              onChange={(event) => setPresetDescription(event.target.value)}
              placeholder="Preset description"
            />
            <div className="rounded-xl border border-border/40 bg-surface-muted/20 px-3 py-2 text-xs text-brand-muted">
              Brochure pricing is configured per hour below.
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.12em] text-brand-muted">Package Brochure Price by Hours (line total)</p>
            <div className="grid gap-2 sm:grid-cols-7 lg:grid-cols-14">
              {HOURS.map((hours) => (
                <label key={`preset-hour-${hours}`} className="grid gap-1 text-[11px] uppercase tracking-[0.08em] text-brand-muted">
                  {hours}h
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className="input-compact w-full text-right"
                    value={presetHourlyPriceByHour[hours] ?? 0}
                    onChange={(event) => {
                      const numeric = Number(event.target.value)
                      setPresetHourlyPriceByHour((current) => ({
                        ...current,
                        [hours]: Number.isFinite(numeric) ? numeric : 0,
                      }))
                    }}
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-[1fr_120px_170px_auto]">
            <select
              className="select-compact w-full"
              value={componentServiceId}
              onChange={(event) => setComponentServiceId(event.target.value)}
            >
              <option value="">Select service for preset</option>
              {services.map((service) => (
                <option key={service.id} value={service.id}>{service.name}</option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              step={1}
              className="input-compact w-full"
              value={componentQuantity}
              onChange={(event) => setComponentQuantity(Number(event.target.value) || 1)}
              placeholder="Qty"
            />
            <select
              className="select-compact w-full"
              value={componentBillingMode}
              onChange={(event) => setComponentBillingMode(event.target.value as 'priced' | 'included')}
            >
              <option value="included">Included line</option>
              <option value="priced">Priced line</option>
            </select>
            <button
              type="button"
              className="btn-compact-secondary"
              onClick={handleAddPresetComponent}
            >
              Add Component
            </button>
          </div>

          <div className="overflow-x-auto border border-border/40">
            <table className="min-w-full divide-y divide-border/30 text-sm">
              <thead className="bg-surface-muted/50 text-xs uppercase tracking-[0.08em] text-brand-muted">
                <tr>
                  <th className="px-3 py-2 text-left">Service</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Mode</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {presetComponents.map((component, index) => (
                  <tr key={`${component.serviceId}-${component.billingMode ?? 'priced'}-${index}`} className="transition hover:bg-surface-muted/35">
                    <td className="px-3 py-2.5 text-white">{selectedServiceNameMap.get(component.serviceId) ?? 'Unknown service'}</td>
                    <td className="px-3 py-2.5 text-right text-brand-muted">{component.quantity}</td>
                    <td className="px-3 py-2.5 text-right text-brand-muted">
                      {(component.billingMode ?? 'priced') === 'included' ? 'Included' : 'Priced'}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        className="btn-compact-secondary"
                        onClick={() => setPresetComponents((current) => current.filter((_entry, currentIndex) => currentIndex !== index))}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
                {!presetComponents.length ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-5 text-center text-sm text-brand-muted">
                      No components selected yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              className="btn-compact-secondary"
              onClick={applyRecommendedBundleModes}
              disabled={!presetComponents.length}
            >
              Recommended Bundle Mode
            </button>
          </div>

          <div className="flex justify-end gap-2">
            {editingPresetId ? (
              <button
                type="button"
                className="btn-compact-secondary"
                onClick={resetPresetForm}
              >
                Cancel Edit
              </button>
            ) : null}
            <button
              type="button"
              className="btn-compact-primary"
              onClick={() => {
                if (editingPresetId) {
                  void updatePresetMutation.mutateAsync()
                  return
                }
                void createPresetMutation.mutateAsync()
              }}
              disabled={createPresetMutation.isPending || updatePresetMutation.isPending}
            >
              {createPresetMutation.isPending || updatePresetMutation.isPending
                ? (editingPresetId ? 'Saving Preset…' : 'Creating Preset…')
                : (editingPresetId ? 'Save Preset' : 'Create Package Preset')}
            </button>
          </div>

          <div className="overflow-x-auto border border-border/40">
            <table className="min-w-full divide-y divide-border/30 text-sm">
              <thead className="bg-surface-muted/50 text-xs uppercase tracking-[0.08em] text-brand-muted">
                <tr>
                  <th className="px-3 py-2 text-left">Preset</th>
                  <th className="px-3 py-2 text-left">Description</th>
                  <th className="px-3 py-2 text-right">Brochure Price (Range)</th>
                  <th className="px-3 py-2 text-right">Components</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {presets.map((preset) => (
                  <tr key={preset.id} className="transition hover:bg-surface-muted/35">
                    <td className="px-3 py-2.5 text-white">{preset.name}</td>
                    <td className="px-3 py-2.5 text-brand-muted">{preset.description || '—'}</td>
                    <td className="px-3 py-2.5 text-right text-brand-muted">
                      {formatPresetHourlySummary(preset.hourlyPriceByHour, preset.packageHourlyPrice)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-brand-muted">{preset.components.length}</td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          className="btn-compact-secondary"
                          onClick={() => handleEditPreset(preset.id)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn-compact-secondary"
                          onClick={() => void duplicatePresetMutation.mutateAsync(preset.id)}
                          disabled={duplicatePresetMutation.isPending}
                        >
                          Duplicate
                        </button>
                        {deletePresetId === preset.id && deletePresetStep === 2 ? (
                          <button
                            type="button"
                            className="btn-compact-secondary border-red-400/50 text-red-200 hover:border-red-300 hover:text-red-100"
                            onClick={() => void deletePresetMutation.mutateAsync(preset.id)}
                            disabled={deletePresetMutation.isPending}
                          >
                            {deletePresetMutation.isPending ? 'Deleting…' : 'Delete'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn-compact-secondary border-red-400/50 text-red-200 hover:border-red-300 hover:text-red-100"
                            onClick={() => {
                              if (deletePresetId === preset.id && deletePresetStep === 1) {
                                setDeletePresetStep(2)
                                return
                              }

                              setDeletePresetId(preset.id)
                              setDeletePresetStep(1)
                            }}
                          >
                            {deletePresetId === preset.id && deletePresetStep === 1 ? 'Continue' : 'Delete'}
                          </button>
                        )}
                        {deletePresetId === preset.id ? (
                          <button
                            type="button"
                            className="btn-compact-secondary"
                            onClick={() => {
                              setDeletePresetId(null)
                              setDeletePresetStep(1)
                            }}
                          >
                            Cancel
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
                {!presets.length ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-5 text-center text-sm text-brand-muted">
                      No presets yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </Card>
    </div>
  )
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value)
}

function formatRange(min: number, max: number, configuredHours: number) {
  if (!configuredHours) return '—'
  if (min === max) return formatCurrency(min)
  return `${formatCurrency(min)} - ${formatCurrency(max)}`
}

function toHourlyPricePayload(hourlyByHour: Record<number, number>) {
  const output: Record<string, number> = {}
  HOURS.forEach((hours) => {
    output[String(hours)] = Number.isFinite(hourlyByHour[hours]) ? Math.max(0, Number(hourlyByHour[hours])) : 0
  })
  return output
}

function buildPresetHourlyPriceDraft(hourlyByHour: Record<string, number> | undefined, fallbackHourlyPrice: number | undefined) {
  const next = { ...EMPTY_PRESET_HOURLY_PRICE_BY_HOUR }

  if (hourlyByHour) {
    Object.entries(hourlyByHour).forEach(([hoursKey, value]) => {
      const hours = Number(hoursKey)
      if (!Number.isFinite(hours) || hours < 1 || hours > HOURS.length) return
      next[hours] = Number.isFinite(value) ? Math.max(0, value) : 0
    })
  }

  const hasConfiguredRows = Object.values(next).some((value) => value > 0)
  if (!hasConfiguredRows && fallbackHourlyPrice && fallbackHourlyPrice > 0) {
    HOURS.forEach((hours) => {
      next[hours] = fallbackHourlyPrice
    })
  }

  return next
}

function formatPresetHourlySummary(hourlyByHour: Record<string, number> | undefined, fallbackHourlyPrice: number | undefined) {
  if (hourlyByHour) {
    const values = Object.values(hourlyByHour).filter((value) => Number.isFinite(value) && value > 0)
    if (values.length) {
      const min = Math.min(...values)
      const max = Math.max(...values)
      return min === max ? formatCurrency(min) : `${formatCurrency(min)} - ${formatCurrency(max)}`
    }
  }

  if (fallbackHourlyPrice && fallbackHourlyPrice > 0) {
    return formatCurrency(fallbackHourlyPrice)
  }

  return '—'
}
