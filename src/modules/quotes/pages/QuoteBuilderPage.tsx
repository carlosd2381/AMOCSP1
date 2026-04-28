import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ArrowDown, ArrowUp, Plus, Printer, Save, Send, Trash2 } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { fetchCompanyDetails } from '@/services/companyDetailsService'
import { fetchFinancialSettings } from '@/services/financialSettingsService'
import { fetchContractTemplateSettings } from '@/services/contractTemplateSettingsService'
import { fetchQuestionnaireTemplateSettings } from '@/services/questionnaireTemplateSettingsService'
import { fetchPaymentScheduleSettings } from '@/services/paymentScheduleSettingsService'
import { addDaysToDate, buildPaymentScheduleFromTemplates } from '@/services/paymentScheduleService'
import { DEFAULT_TAX_TOGGLES, mapFinancialTaxRatesToQuoteRates, mapFinancialTaxToggles } from '@/services/financialTaxService'
import { summarizeQuote } from '@/services/quoteService'
import {
  ensureDraftProposalForLead,
  fetchLatestProposal,
  TAX_CODES_ORDER,
  updateProposalLineItems,
  type ProposalPaymentScheduleAudit,
  type ProposalRecipient,
} from '@/services/proposalService'
import { buildPackagePresetQuoteLines, fetchPackagePresets, fetchServiceQuoteOptions } from '@/services/serviceCatalogComposerService'
import { fetchLeadById } from '@/services/leadService'
import { fetchLeadContacts, type LeadContactRecord } from '@/services/leadContactsService'
import { resolvePdfLogoUrl } from '@/modules/documents/pdf/pdfBranding'
import { useBranding } from '@/contexts/BrandingContext'
import { useAuth } from '@/contexts/AuthContext'
import {
  buildPaymentScheduleAuditActorLabel,
  formatPaymentScheduleAuditActionLabel,
  formatPaymentScheduleAuditHistoryItem,
  formatPaymentScheduleAuditSummary,
  formatPaymentScheduleAuditTimestamp,
} from '@/lib/paymentScheduleAuditFormatting'
import {
  DEFAULT_CLIENT_MARKET_PROFILE,
  type ClientLanguage,
  type ClientMarketType,
  type LineItem,
  type PricingCatalogKey,
  type TaxCode,
  type TaxLine,
} from '@/types'
import { StatusPill } from '@/components/ui/StatusPill'

const QuoteSchema = z.object({
  currency: z.string().min(1),
  taxes: z.record(z.enum(['IVA', 'IVA_RET', 'ISR', 'ISR_RET']), z.boolean()),
})

type QuoteSchemaType = z.infer<typeof QuoteSchema>
const DISCOUNT_LINE_ID = 'quote-discount-line'

interface CustomLineDraft {
  description: string
  quantity: number
  unitPrice: number
  internalCost: number
}

interface QuoteRecipient {
  id: string
  name: string
  email: string
  role: string
  selected: boolean
  isCustom?: boolean
}

function mapProposalRecipientToUi(recipient: ProposalRecipient, index: number): QuoteRecipient {
  return {
    id: `saved-${index + 1}-${recipient.email.trim().toLowerCase()}`,
    name: recipient.name,
    email: recipient.email,
    role: recipient.role,
    selected: recipient.selected,
    isCustom: Boolean(recipient.isCustom),
  }
}

function mapUiRecipientToProposal(recipient: QuoteRecipient): ProposalRecipient {
  return {
    name: recipient.name.trim(),
    email: recipient.email.trim(),
    role: recipient.role.trim() || 'Contact',
    selected: recipient.selected,
    isCustom: Boolean(recipient.isCustom),
  }
}

const EMPTY_TAXES: Record<TaxCode, boolean> = { ...DEFAULT_TAX_TOGGLES }

export function QuoteBuilderPage() {
  const { brand } = useBranding()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const leadId = searchParams.get('leadId') ?? undefined
  const proposalId = searchParams.get('proposalId') ?? undefined
  const isCreateNewMode = searchParams.get('new') === '1'
  const [selectedPresetId, setSelectedPresetId] = useState('')
  const [coverageHours, setCoverageHours] = useState(8)
  const [applyMode, setApplyMode] = useState<'replace' | 'append'>('replace')
  const [showReplaceConfirm, setShowReplaceConfirm] = useState(false)
  const [showClearScheduleConfirm, setShowClearScheduleConfirm] = useState(false)
  const [quoteClientType, setQuoteClientType] = useState<ClientMarketType>('INT')
  const [quoteLanguage, setQuoteLanguage] = useState<ClientLanguage>('en')
  const [selectedCatalog, setSelectedCatalog] = useState<PricingCatalogKey>('INT_USD_ENG')
  const [marketDefaultsLoaded, setMarketDefaultsLoaded] = useState(false)
  const [financialDefaultsLoaded, setFinancialDefaultsLoaded] = useState(false)
  const [isSnapshotLocked, setIsSnapshotLocked] = useState(false)
  const [showAddCustomItem, setShowAddCustomItem] = useState(false)
  const [serviceSearch, setServiceSearch] = useState('')
  const [serviceQuantities, setServiceQuantities] = useState<Record<string, number>>({})
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([])
  const [quoteRecipients, setQuoteRecipients] = useState<QuoteRecipient[]>([])
  const [showAddRecipient, setShowAddRecipient] = useState(false)
  const [newRecipient, setNewRecipient] = useState({ name: '', email: '', role: 'Other' })
  const [selectedPaymentScheduleId, setSelectedPaymentScheduleId] = useState('')
  const [selectedQuestionnaireTemplateId, setSelectedQuestionnaireTemplateId] = useState('')
  const [selectedContractTemplateId, setSelectedContractTemplateId] = useState('')
  const [customLineDraft, setCustomLineDraft] = useState<CustomLineDraft>({
    description: '',
    quantity: 1,
    unitPrice: 0,
    internalCost: 0,
  })
  const [discountType, setDiscountType] = useState<'amount' | 'percent'>('amount')
  const [discountValue, setDiscountValue] = useState(0)
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)

  const leadProfileQuery = useQuery({
    queryKey: ['lead-profile', leadId],
    queryFn: async () => {
      if (!leadId) return null
      return fetchLeadById(leadId)
    },
    enabled: Boolean(leadId),
  })

  const { data, isLoading } = useQuery({
    queryKey: ['proposal', brand.slug, leadId, proposalId, isCreateNewMode ? 'new' : 'latest'],
    queryFn: () => (
      isCreateNewMode
        ? Promise.resolve(null)
        : fetchLatestProposal(brand.slug, { leadId, proposalId })
    ),
  })

  const packagePresetsQuery = useQuery({
    queryKey: ['package-presets', brand.slug, selectedCatalog],
    queryFn: () => fetchPackagePresets(brand.slug, selectedCatalog),
  })

  const packagePresetLinesQuery = useQuery({
    queryKey: ['package-preset-preview', brand.slug, selectedCatalog, selectedPresetId, coverageHours, quoteLanguage],
    queryFn: () => buildPackagePresetQuoteLines(brand.slug, selectedCatalog, selectedPresetId, coverageHours, quoteLanguage),
    enabled: Boolean(selectedPresetId),
  })

  const serviceOptionsQuery = useQuery({
    queryKey: ['service-quote-options', brand.slug, selectedCatalog, coverageHours, quoteLanguage],
    queryFn: () => fetchServiceQuoteOptions(brand.slug, selectedCatalog, coverageHours, quoteLanguage),
  })

  const leadContactsQuery = useQuery({
    queryKey: ['lead-contacts', leadId],
    queryFn: async () => {
      if (!leadProfileQuery.data) return [] as LeadContactRecord[]
      return fetchLeadContacts(leadProfileQuery.data)
    },
    enabled: Boolean(leadProfileQuery.data),
  })

  const financialSettingsQuery = useQuery({
    queryKey: ['financial-settings', brand.slug],
    queryFn: () => fetchFinancialSettings(brand.slug),
  })

  const paymentScheduleSettingsQuery = useQuery({
    queryKey: ['settings-payment-schedules', brand.slug],
    queryFn: () => fetchPaymentScheduleSettings(brand.slug),
  })

  const contractTemplateSettingsQuery = useQuery({
    queryKey: ['settings-contract-templates', brand.slug],
    queryFn: () => fetchContractTemplateSettings(brand.slug),
  })

  const questionnaireTemplateSettingsQuery = useQuery({
    queryKey: ['settings-questionnaire-templates', brand.slug],
    queryFn: () => fetchQuestionnaireTemplateSettings(brand.slug),
  })

  const availablePaymentSchedules = paymentScheduleSettingsQuery.data?.schedules ?? []
  const availableQuestionnaireTemplates = questionnaireTemplateSettingsQuery.data?.templates ?? []
  const availableContractTemplates = contractTemplateSettingsQuery.data?.templates ?? []
  const auditActor = useMemo(() => {
    return buildPaymentScheduleAuditActorLabel({
      email: user?.email,
      fullName: user?.fullName,
    })
  }, [user?.email, user?.fullName])

  const packagePresetLines = packagePresetLinesQuery.data ?? []
  const filteredServiceOptions = useMemo(() => {
    const options = serviceOptionsQuery.data ?? []
    const query = serviceSearch.trim().toLowerCase()
    if (!query) return options
    return options.filter((service) => {
      const name = service.serviceName.toLowerCase()
      const description = service.serviceDescription?.toLowerCase() ?? ''
      return name.includes(query) || description.includes(query)
    })
  }, [serviceOptionsQuery.data, serviceSearch])

  const groupedServiceOptions = useMemo(() => {
    const groups = new Map<string, typeof filteredServiceOptions>()

    for (const service of filteredServiceOptions) {
      const first = service.serviceName.trim().charAt(0).toUpperCase() || '#'
      const group = /^[A-Z]$/.test(first) ? first : '#'
      if (!groups.has(group)) groups.set(group, [])
      groups.get(group)?.push(service)
    }

    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([group, items]) => ({ group, items }))
  }, [filteredServiceOptions])

  const selectedServices = useMemo(() => {
    const options = serviceOptionsQuery.data ?? []
    const ids = new Set(selectedServiceIds)
    return options.filter((service) => ids.has(service.serviceId))
  }, [serviceOptionsQuery.data, selectedServiceIds])

  const selectedServicesTotal = useMemo(() => {
    return selectedServices.reduce((sum, service) => {
      const qty = Math.max(1, Math.round(serviceQuantities[service.serviceId] ?? 1))
      return sum + (service.price * qty)
    }, 0)
  }, [selectedServices, serviceQuantities])

  const packagePresetTotal = useMemo(() => {
    return packagePresetLines.reduce((sum, row) => sum + row.totalPrice, 0)
  }, [packagePresetLines])

  const resolveProposalForWrite = async () => {
    if (data?.id) {
      return {
        proposal: data,
        created: false,
      }
    }

    if (!leadId) {
      throw new Error('No lead selected for this quote')
    }

    const created = await ensureDraftProposalForLead(brand.slug, {
      leadId,
      currency: selectedCurrency,
      marketSnapshot: {
        clientType: quoteClientType,
        language: quoteLanguage,
        catalogKey: selectedCatalog,
        currency: selectedCurrency === 'MXN' ? 'MXN' : 'USD',
        snapshottedAt: new Date().toISOString(),
      },
    })

    return {
      proposal: created,
      created: true,
    }
  }

  const buildProposalUpdatePayload = (
    lineItemsPayload: LineItem[],
    taxesPayload: TaxLine[],
    selectedScheduleIdOverride?: string | null,
    selectedContractTemplateIdOverride?: string | null,
    paymentScheduleAuditEventOverride?: ProposalPaymentScheduleAudit,
    explicitPaymentScheduleOverride?: Array<{ label: string; amount: number; dueDate: string }> | null,
    selectedQuestionnaireTemplateIdOverride?: string | null,
  ) => {
    const snapshotCurrency: 'USD' | 'MXN' = selectedCurrency === 'MXN' ? 'MXN' : 'USD'

    return {
    lineItems: lineItemsPayload,
    taxes: taxesPayload,
    currency: selectedCurrency,
    recipients: quoteRecipients.map(mapUiRecipientToProposal),
    selectedPaymentScheduleId: (selectedScheduleIdOverride ?? selectedPaymentScheduleId) || null,
    selectedQuestionnaireTemplateId: (selectedQuestionnaireTemplateIdOverride ?? selectedQuestionnaireTemplateId) || null,
    selectedContractTemplateId: (selectedContractTemplateIdOverride ?? selectedContractTemplateId) || null,
      paymentScheduleAuditEvent: paymentScheduleAuditEventOverride,
      explicitPaymentSchedule: explicitPaymentScheduleOverride,
    marketSnapshot: {
      clientType: quoteClientType,
      language: quoteLanguage,
      catalogKey: selectedCatalog,
      currency: snapshotCurrency,
      snapshottedAt: (isSnapshotLocked && data?.marketSnapshot?.snapshottedAt) ? data.marketSnapshot.snapshottedAt : new Date().toISOString(),
    },
    }
  }

  const financialTaxRates = useMemo(() => {
    return mapFinancialTaxRatesToQuoteRates(financialSettingsQuery.data)
  }, [financialSettingsQuery.data])

  const applyPresetMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPresetId) {
        throw new Error('Select a package preset first')
      }

      const { proposal, created } = await resolveProposalForWrite()

      const rows = await buildPackagePresetQuoteLines(brand.slug, selectedCatalog, selectedPresetId, coverageHours, quoteLanguage)
      if (!rows.length) {
        throw new Error('No priced lines found for selected preset and hours')
      }

      const presetLineItems: LineItem[] = rows.map((row, index) => ({
        id: `preset-${row.serviceId}-${Date.now()}-${index + 1}`,
        description: buildGeneratedLineItemDescription(row.serviceName, row.hours, row.lineKind, quoteLanguage),
        quantity: row.quantity,
        unitPrice: row.price,
        displayMode: row.billingMode,
        internalCost: row.cost,
        discounts: 0,
      }))

      const baseLineItems = applyMode === 'append'
        ? (proposal.lineItems ?? []).map((item) => ({ ...item }))
        : []

      const nextLineItems = applyDiscountToLineItems([...baseLineItems, ...presetLineItems], discountType, discountValue)

      const nextSummary = summarizeQuote(nextLineItems, financialTaxRates)
      const nextTaxes = nextSummary.taxes.filter((tax) => watchTaxes?.[tax.code])

      await updateProposalLineItems(proposal.id, buildProposalUpdatePayload(nextLineItems, nextTaxes))

      return { created }
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['proposal', brand.slug, leadId] })
      if (result?.created) {
        toast.success('Draft proposal created')
      }
      toast.success('Preset applied to proposal')
    },
    onError: (error) => {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Unable to apply preset')
    },
  })

  const lineItemsMutation = useMutation({
    mutationFn: async (nextLineItems: LineItem[]) => {
      const { proposal } = await resolveProposalForWrite()

      const nextSummary = summarizeQuote(nextLineItems, financialTaxRates)
      const nextTaxes = nextSummary.taxes.filter((tax) => watchTaxes?.[tax.code])

      await updateProposalLineItems(proposal.id, buildProposalUpdatePayload(nextLineItems, nextTaxes))
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['proposal', brand.slug, leadId] })
    },
    onError: (error) => {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Unable to update line items')
    },
  })

  const applySelectedScheduleNowMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPaymentSchedule) {
        throw new Error('Select a saved payment schedule first')
      }

      if (!selectedPaymentSchedulePreview.length) {
        throw new Error('Selected schedule preview is empty. Add line items or adjust schedule percentages first')
      }

      const { proposal } = await resolveProposalForWrite()

      const explicitPaymentSchedule = selectedPaymentSchedulePreview.map((row) => ({
        label: row.label,
        amount: row.amount,
        dueDate: row.dueDate,
      }))

      await updateProposalLineItems(
        proposal.id,
        buildProposalUpdatePayload(
          persistedLineItems,
          computedSummary.taxes,
          selectedPaymentSchedule.id,
          undefined,
          {
            action: 'applied_explicit_schedule',
            at: new Date().toISOString(),
            scheduleId: selectedPaymentSchedule.id,
            performedBy: auditActor,
          },
          explicitPaymentSchedule,
        ),
      )
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['proposal', brand.slug, leadId] })
      toast.success('Payment schedule applied to proposal')
    },
    onError: (error) => {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Unable to apply payment schedule')
    },
  })

  const clearExplicitScheduleMutation = useMutation({
    mutationFn: async () => {
      const { proposal } = await resolveProposalForWrite()

      await updateProposalLineItems(
        proposal.id,
        buildProposalUpdatePayload(
          persistedLineItems,
          computedSummary.taxes,
          selectedPaymentScheduleId,
          undefined,
          {
            action: 'cleared_explicit_schedule',
            at: new Date().toISOString(),
            scheduleId: selectedPaymentScheduleId || undefined,
            performedBy: auditActor,
          },
          [],
        ),
      )
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['proposal', brand.slug, leadId] })
      toast.success('Explicit payment schedule cleared')
    },
    onError: (error) => {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Unable to clear explicit payment schedule')
    },
  })

  const form = useForm<QuoteSchemaType>({
    resolver: zodResolver(QuoteSchema),
    defaultValues: {
      currency: data?.currency ?? financialSettingsQuery.data?.defaultCurrency ?? 'MXN',
      taxes: data?.taxToggleDefaults ?? EMPTY_TAXES,
    },
  })

  useEffect(() => {
    if (data) {
      form.reset({
        currency: data.currency,
        taxes: data.taxToggleDefaults,
      })

      if (data.marketSnapshot) {
        setQuoteClientType(data.marketSnapshot.clientType)
        setQuoteLanguage(data.marketSnapshot.language)
        setSelectedCatalog(data.marketSnapshot.catalogKey)
        form.setValue('currency', data.marketSnapshot.currency)
        setMarketDefaultsLoaded(true)
        setIsSnapshotLocked(true)
      } else {
        setIsSnapshotLocked(false)
      }

      if (data.selectedPaymentScheduleId) {
        setSelectedPaymentScheduleId(data.selectedPaymentScheduleId)
      }

      if (data.selectedQuestionnaireTemplateId) {
        setSelectedQuestionnaireTemplateId(data.selectedQuestionnaireTemplateId)
      }

      if (data.selectedContractTemplateId) {
        setSelectedContractTemplateId(data.selectedContractTemplateId)
      }
    }
  }, [data, form])

  useEffect(() => {
    if (!availablePaymentSchedules.length) {
      setSelectedPaymentScheduleId('')
      return
    }

    const hasSelected = availablePaymentSchedules.some((schedule) => schedule.id === selectedPaymentScheduleId)
    if (hasSelected) return

    const defaultSchedule = availablePaymentSchedules.find((schedule) => schedule.isDefault) ?? availablePaymentSchedules[0]
    if (defaultSchedule?.id) {
      setSelectedPaymentScheduleId(defaultSchedule.id)
    }
  }, [availablePaymentSchedules, selectedPaymentScheduleId])

  useEffect(() => {
    if (!availableQuestionnaireTemplates.length) {
      setSelectedQuestionnaireTemplateId('')
      return
    }

    const hasSelected = availableQuestionnaireTemplates.some((template) => template.id === selectedQuestionnaireTemplateId)
    if (hasSelected) return

    const defaultTemplate = availableQuestionnaireTemplates.find((template) => template.isDefault) ?? availableQuestionnaireTemplates[0]
    if (defaultTemplate?.id) {
      setSelectedQuestionnaireTemplateId(defaultTemplate.id)
    }
  }, [availableQuestionnaireTemplates, selectedQuestionnaireTemplateId])

  useEffect(() => {
    if (!availableContractTemplates.length) {
      setSelectedContractTemplateId('')
      return
    }

    const hasSelected = availableContractTemplates.some((template) => template.id === selectedContractTemplateId)
    if (hasSelected) return

    const defaultTemplate = availableContractTemplates.find((template) => template.isDefault) ?? availableContractTemplates[0]
    if (defaultTemplate?.id) {
      setSelectedContractTemplateId(defaultTemplate.id)
    }
  }, [availableContractTemplates, selectedContractTemplateId])

  useEffect(() => {
    if (data || financialDefaultsLoaded) return

    const settings = financialSettingsQuery.data
    if (!settings) return

    form.setValue('taxes', mapFinancialTaxToggles(settings) ?? EMPTY_TAXES)

    if (!leadProfileQuery.data) {
      form.setValue('currency', settings.defaultCurrency)
    }

    setFinancialDefaultsLoaded(true)
  }, [data, financialDefaultsLoaded, financialSettingsQuery.data, form, leadProfileQuery.data])

  useEffect(() => {
    if (!leadProfileQuery.data || marketDefaultsLoaded || data?.marketSnapshot) return

    const profile = leadProfileQuery.data.client.marketProfile ?? DEFAULT_CLIENT_MARKET_PROFILE
    setQuoteClientType(profile.clientType)
    setQuoteLanguage(profile.preferredLanguage)
    setSelectedCatalog(profile.preferredCatalog)
    form.setValue('currency', profile.preferredCurrency)
    setMarketDefaultsLoaded(true)
  }, [leadProfileQuery.data, form, marketDefaultsLoaded])

  const watchTaxes = useWatch({ control: form.control, name: 'taxes' })
  const selectedCurrency = useWatch({ control: form.control, name: 'currency' })
    ?? financialSettingsQuery.data?.defaultCurrency
    ?? 'MXN'
  const persistedLineItems = data?.lineItems ?? []
  const lineItems = useMemo(
    () => persistedLineItems.filter((item) => item.id !== DISCOUNT_LINE_ID),
    [persistedLineItems],
  )

  const itemsSubtotalBeforeDiscount = useMemo(
    () => lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
    [lineItems],
  )

  useEffect(() => {
    const discountLine = persistedLineItems.find((item) => item.id === DISCOUNT_LINE_ID)
    if (!discountLine) {
      setDiscountValue(0)
      return
    }

    const amount = Math.max(0, Math.abs(discountLine.unitPrice * discountLine.quantity))
    setDiscountValue(discountType === 'percent' && itemsSubtotalBeforeDiscount > 0
      ? Number(((amount / itemsSubtotalBeforeDiscount) * 100).toFixed(2))
      : amount)
  }, [persistedLineItems, discountType, itemsSubtotalBeforeDiscount])

  const rawSummary = useMemo(
    () => summarizeQuote(persistedLineItems, financialTaxRates),
    [persistedLineItems, financialTaxRates],
  )
  const computedSummary = useMemo(() => {
    const taxes = rawSummary.taxes.filter((tax) => watchTaxes?.[tax.code])
    const totalTaxes = taxes.reduce((acc, tax) => acc + tax.amount * (tax.isWithheld ? -1 : 1), 0)
    return {
      subtotal: rawSummary.subtotal,
      taxes,
      grandTotal: rawSummary.subtotal + totalTaxes,
    }
  }, [rawSummary, watchTaxes])

  const selectedPaymentSchedule = useMemo(
    () => availablePaymentSchedules.find((schedule) => schedule.id === selectedPaymentScheduleId) ?? null,
    [availablePaymentSchedules, selectedPaymentScheduleId],
  )

  const selectedContractTemplate = useMemo(
    () => availableContractTemplates.find((template) => template.id === selectedContractTemplateId) ?? null,
    [availableContractTemplates, selectedContractTemplateId],
  )

  const selectedQuestionnaireTemplate = useMemo(
    () => availableQuestionnaireTemplates.find((template) => template.id === selectedQuestionnaireTemplateId) ?? null,
    [availableQuestionnaireTemplates, selectedQuestionnaireTemplateId],
  )

  const selectedPaymentSchedulePreview = useMemo(() => {
    if (!selectedPaymentSchedule?.templates?.length) return []

    const issuedAt = new Date().toISOString().slice(0, 10)
    const jobDate = leadProfileQuery.data?.eventDate ?? addDaysToDate(issuedAt, 30)
    return buildPaymentScheduleFromTemplates({
      templates: selectedPaymentSchedule.templates,
      totalAmount: Math.max(0, Number(computedSummary.grandTotal || 0)),
      keyDates: {
        issuedAt,
        acceptanceDate: issuedAt,
        orderBookedAt: issuedAt,
        deliveryDate: jobDate,
        jobDate,
      },
    })
  }, [selectedPaymentSchedule, computedSummary.grandTotal, leadProfileQuery.data?.eventDate])

  const handleApplyPreset = async () => {
    if (applyMode === 'replace' && lineItems.length > 0) {
      setShowReplaceConfirm(true)
      return
    }
    await applyPresetMutation.mutateAsync()
  }

  const handleDeleteLineItem = async (lineItemId: string) => {
    if (!data?.id) {
      toast.error('No active proposal found for this lead/brand.')
      return
    }

    const nextLineItems = lineItems.filter((item) => item.id !== lineItemId)
    await lineItemsMutation.mutateAsync(applyDiscountToLineItems(nextLineItems, discountType, discountValue))
    toast.success('Line item removed')
  }

  const handleMoveLineItem = async (index: number, direction: 'up' | 'down') => {
    if (!data?.id) {
      toast.error('No active proposal found for this lead/brand.')
      return
    }

    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= lineItems.length) return

    const reordered = [...lineItems]
    const [moved] = reordered.splice(index, 1)
    reordered.splice(targetIndex, 0, moved)

    await lineItemsMutation.mutateAsync(applyDiscountToLineItems(reordered, discountType, discountValue))
    toast.success('Line item order updated')
  }

  const handleAddCustomLine = async () => {
    if (!customLineDraft.description.trim()) {
      toast.error('Description is required')
      return
    }

    const quantity = Number.isFinite(customLineDraft.quantity) && customLineDraft.quantity > 0
      ? Math.round(customLineDraft.quantity)
      : 1
    const unitPrice = Number.isFinite(customLineDraft.unitPrice) ? Number(customLineDraft.unitPrice) : 0
    const internalCost = Number.isFinite(customLineDraft.internalCost) ? Number(customLineDraft.internalCost) : 0

    const nextLine: LineItem = {
      id: `manual-${Date.now()}`,
      description: customLineDraft.description.trim(),
      quantity,
      unitPrice,
      internalCost,
      displayMode: 'priced',
      discounts: 0,
    }

    const nextItems = [...lineItems, nextLine]
    const composed = applyDiscountToLineItems(nextItems, discountType, discountValue)
    await lineItemsMutation.mutateAsync(composed)

    setCustomLineDraft({
      description: '',
      quantity: 1,
      unitPrice: 0,
      internalCost: 0,
    })
    setShowAddCustomItem(false)
    toast.success('Custom item added')
  }

  const handleApplyDiscount = async () => {
    const composed = applyDiscountToLineItems(lineItems, discountType, discountValue)
    await lineItemsMutation.mutateAsync(composed)
    toast.success('Discount updated')
  }

  const handlePaymentScheduleSelectionChange = (nextScheduleId: string) => {
    setSelectedPaymentScheduleId(nextScheduleId)

    if (!data?.id) return

    void updateProposalLineItems(data.id, buildProposalUpdatePayload(persistedLineItems, computedSummary.taxes, nextScheduleId))
      .then(() => queryClient.invalidateQueries({ queryKey: ['proposal', brand.slug, leadId] }))
      .catch((error) => {
        console.error(error)
        toast.error(error instanceof Error ? error.message : 'Unable to update payment schedule selection')
      })
  }

  const handleContractTemplateSelectionChange = (nextTemplateId: string) => {
    setSelectedContractTemplateId(nextTemplateId)

    if (!data?.id) return

    void updateProposalLineItems(data.id, buildProposalUpdatePayload(
      persistedLineItems,
      computedSummary.taxes,
      selectedPaymentScheduleId,
      nextTemplateId,
    ))
      .then(() => queryClient.invalidateQueries({ queryKey: ['proposal', brand.slug, leadId] }))
      .catch((error) => {
        console.error(error)
        toast.error(error instanceof Error ? error.message : 'Unable to update contract template selection')
      })
  }

  const handleQuestionnaireTemplateSelectionChange = (nextTemplateId: string) => {
    setSelectedQuestionnaireTemplateId(nextTemplateId)

    if (!data?.id) return

    void updateProposalLineItems(data.id, buildProposalUpdatePayload(
      persistedLineItems,
      computedSummary.taxes,
      selectedPaymentScheduleId,
      selectedContractTemplateId,
      undefined,
      undefined,
      nextTemplateId,
    ))
      .then(() => queryClient.invalidateQueries({ queryKey: ['proposal', brand.slug, leadId] }))
      .catch((error) => {
        console.error(error)
        toast.error(error instanceof Error ? error.message : 'Unable to update questionnaire template selection')
      })
  }

  const handleQuickAddService = async (serviceId: string, quantityInput: number) => {
    const service = (serviceOptionsQuery.data ?? []).find((item) => item.serviceId === serviceId)
    if (!service) return

    const quantity = Number.isFinite(quantityInput) && quantityInput > 0
      ? Math.round(quantityInput)
      : 1

    const nextLine: LineItem = {
      id: `svc-${service.serviceId}-${Date.now()}`,
      description: buildGeneratedLineItemDescription(service.serviceName, service.hours, 'component', quoteLanguage),
      quantity,
      unitPrice: service.price,
      internalCost: service.cost,
      displayMode: 'priced',
      discounts: 0,
    }

    const nextItems = [...lineItems, nextLine]
    const composed = applyDiscountToLineItems(nextItems, discountType, discountValue)
    await lineItemsMutation.mutateAsync(composed)
    toast.success('Service added')
  }

  const handleSaveDraft = async () => {
    await lineItemsMutation.mutateAsync(applyDiscountToLineItems(lineItems, discountType, discountValue))
    toast.success('Quote draft saved')
  }

  const handlePrintPdf = async () => {
    const leadProfile = leadProfileQuery.data
    if (!leadProfile) {
      toast.error('Lead profile is still loading')
      return
    }

    const taxes = computedSummary.taxes.map((tax) => ({
      label: `${tax.displayName} (${Math.round(tax.rate * 100)}%)`,
      amount: tax.amount,
    }))

    const lines = lineItems.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.quantity * item.unitPrice,
    }))

    setIsGeneratingPdf(true)
    try {
      const [{ createProposalPdfBlob, openPdfBlob }, companyDetails] = await Promise.all([
        import('@/modules/documents/pdf/pdfDocuments'),
        fetchCompanyDetails(brand.slug),
      ])

      const blob = await createProposalPdfBlob({
        proposalId: data?.id ?? `draft-${Date.now()}`,
        updatedAt: new Date().toISOString(),
        validUntil: null,
        currency: selectedCurrency,
        clientName: leadProfile.client.name,
        clientEmail: leadProfile.client.email,
        eventTitle: leadProfile.venueName,
        eventDate: leadProfile.eventDate,
        lines,
        taxes,
        subtotal: computedSummary.subtotal,
        total: computedSummary.grandTotal,
        branding: {
          label: brand.label,
          logoUrl: resolvePdfLogoUrl(brand.slug, brand.logo.light),
          companyDetails,
        },
      })

      openPdfBlob(blob)
      toast.success('Quote PDF opened')
    } catch (error) {
      console.error(error)
      toast.error('Unable to generate quote PDF')
    } finally {
      setIsGeneratingPdf(false)
    }
  }

  const handleSendQuote = async () => {
    const selectedRecipients = quoteRecipients.filter((recipient) => recipient.selected)
    if (!selectedRecipients.length) {
      toast.error('Select at least one recipient before sending the quote')
      return
    }

    await handleSaveDraft()
    toast.success(`Quote send flow will be connected next (${selectedRecipients.length} recipient${selectedRecipients.length > 1 ? 's' : ''} selected)`)
  }

  const handleAddRecipient = () => {
    const name = newRecipient.name.trim()
    const email = newRecipient.email.trim()
    const role = newRecipient.role.trim() || 'Other'

    if (!name || !email) {
      toast.error('Recipient name and email are required')
      return
    }

    setQuoteRecipients((prev) => {
      const normalizedEmail = email.toLowerCase()
      const existingIndex = prev.findIndex((recipient) => recipient.email.trim().toLowerCase() === normalizedEmail)

      if (existingIndex >= 0) {
        const next = [...prev]
        next[existingIndex] = {
          ...next[existingIndex],
          name,
          role,
          selected: true,
          isCustom: true,
        }
        return next
      }

      return [
        ...prev,
        {
          id: `custom-${Date.now()}`,
          name,
          email,
          role,
          selected: true,
          isCustom: true,
        },
      ]
    })

    setNewRecipient({ name: '', email: '', role: 'Other' })
    setShowAddRecipient(false)
  }

  const applyMarketDefaults = (nextType: ClientMarketType) => {
    const nextLanguage: ClientLanguage = nextType === 'MEX' ? 'es' : 'en'
    const nextCurrency = nextType === 'MEX' ? 'MXN' : 'USD'
    const nextCatalog: PricingCatalogKey = nextType === 'MEX' ? 'MEX_MXN_ESP' : 'INT_USD_ENG'
    setQuoteClientType(nextType)
    setQuoteLanguage(nextLanguage)
    setSelectedCatalog(nextCatalog)
    form.setValue('currency', nextCurrency)
    setSelectedPresetId('')
  }

  const applyClientDefaultsForQuote = () => {
    const profile = leadProfileQuery.data?.client.marketProfile ?? DEFAULT_CLIENT_MARKET_PROFILE
    setQuoteClientType(profile.clientType)
    setQuoteLanguage(profile.preferredLanguage)
    setSelectedCatalog(profile.preferredCatalog)
    form.setValue('currency', profile.preferredCurrency)
    setSelectedPresetId('')
  }

  const restoreSnapshotValues = () => {
    if (!data?.marketSnapshot) return
    setQuoteClientType(data.marketSnapshot.clientType)
    setQuoteLanguage(data.marketSnapshot.language)
    setSelectedCatalog(data.marketSnapshot.catalogKey)
    form.setValue('currency', data.marketSnapshot.currency)
    setSelectedPresetId('')
  }

  const snapshotSourceLabel = useMemo(() => {
    if (!data?.marketSnapshot?.snapshottedAt) return null
    const parsed = new Date(data.marketSnapshot.snapshottedAt)
    if (Number.isNaN(parsed.getTime())) {
      return 'Using saved proposal snapshot'
    }
    return `Using saved proposal snapshot (${parsed.toLocaleString()})`
  }, [data?.marketSnapshot?.snapshottedAt])

  const lineItemsSubtotal = useMemo(
    () => lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
    [lineItems],
  )

  const computedDiscountDisplay = useMemo(() => {
    if (!discountValue || discountValue <= 0) return 0
    if (discountType === 'percent') {
      return Number(((lineItemsSubtotal * discountValue) / 100).toFixed(2))
    }
    return Number(discountValue.toFixed(2))
  }, [discountType, discountValue, lineItemsSubtotal])

  const iconActionButtonClass = 'btn-compact-secondary h-8 w-8 justify-center p-0'

  useEffect(() => {
    if (!data?.id) return
    const presets = packagePresetsQuery.data ?? []
    if (!presets.length || !persistedLineItems.length) return

    const presetById = new Map(presets.map((preset) => [preset.id, preset]))
    let changed = false

    const nextLineItems = persistedLineItems.map((item) => {
      const presetId = extractPackagePresetIdFromLineItemId(item.id)
      if (!presetId) return item

      const preset = presetById.get(presetId)
      if (!preset) return item

      const previousLabel = preset.name.trim()
      const nextLabel = preset.description.trim() || previousLabel
      if (!nextLabel) return item

      // Only migrate untouched legacy labels, not manually edited package line descriptions.
      if (item.description.trim() !== previousLabel || item.description.trim() === nextLabel) return item

      changed = true
      return {
        ...item,
        description: nextLabel,
      }
    })

    if (!changed) return

    const nextSummary = summarizeQuote(nextLineItems, financialTaxRates)
    const nextTaxes = nextSummary.taxes.filter((tax) => watchTaxes?.[tax.code])

    void updateProposalLineItems(data.id, buildProposalUpdatePayload(nextLineItems, nextTaxes))
      .then(() => queryClient.invalidateQueries({ queryKey: ['proposal', brand.slug, leadId] }))
      .catch((error) => {
        console.error(error)
      })
  }, [
    data?.id,
    data?.marketSnapshot?.snapshottedAt,
    persistedLineItems,
    packagePresetsQuery.data,
    selectedCurrency,
    quoteRecipients,
    quoteClientType,
    quoteLanguage,
    selectedCatalog,
    isSnapshotLocked,
    selectedPaymentScheduleId,
    selectedQuestionnaireTemplateId,
    selectedContractTemplateId,
    financialTaxRates,
    watchTaxes,
    queryClient,
    brand.slug,
    leadId,
  ])

  useEffect(() => {
    const validIds = new Set((serviceOptionsQuery.data ?? []).map((service) => service.serviceId))
    setSelectedServiceIds((prev) => prev.filter((id) => validIds.has(id)))
  }, [serviceOptionsQuery.data])

  useEffect(() => {
    const persistedRecipients = data?.recipients ?? []
    if (!persistedRecipients.length) {
      if (data?.id) {
        setQuoteRecipients([])
      }
      return
    }

    setQuoteRecipients(persistedRecipients.map(mapProposalRecipientToUi))
  }, [data?.id, data?.recipients])

  useEffect(() => {
    const contacts = leadContactsQuery.data ?? []
    if (!contacts.length) {
      return
    }

    const autoRecipients: QuoteRecipient[] = contacts
      .filter((contact) => Boolean(contact.email?.trim()))
      .map((contact) => {
        const email = contact.email?.trim() ?? ''
        return {
          id: `auto-${contact.id}`,
          name: contact.name,
          email,
          role: getRecipientRoleLabel(contact),
          selected: contact.role === 'primary_client' || contact.source === 'lead',
          isCustom: false,
        }
      })

    setQuoteRecipients((prev) => {
      const customRecipients = prev.filter((recipient) => recipient.isCustom)
      const previousByEmail = new Map(prev.map((recipient) => [recipient.email.trim().toLowerCase(), recipient]))
      const dedupedAuto = new Map<string, QuoteRecipient>()

      for (const recipient of autoRecipients) {
        const emailKey = recipient.email.trim().toLowerCase()
        if (!emailKey || dedupedAuto.has(emailKey)) continue
        const existing = previousByEmail.get(emailKey)
        dedupedAuto.set(emailKey, {
          ...recipient,
          selected: existing?.selected ?? recipient.selected,
        })
      }

      return [...dedupedAuto.values(), ...customRecipients]
    })
  }, [leadContactsQuery.data])

  const toggleServiceSelection = (serviceId: string) => {
    setSelectedServiceIds((prev) => (
      prev.includes(serviceId)
        ? prev.filter((id) => id !== serviceId)
        : [...prev, serviceId]
    ))
  }

  const handleAddSelectedServices = async () => {
    if (!selectedServices.length) {
      toast.error('Select at least one service')
      return
    }

    const nextLines: LineItem[] = selectedServices.map((service) => {
      const quantity = Math.max(1, Math.round(serviceQuantities[service.serviceId] ?? 1))
      return {
        id: `svc-${service.serviceId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        description: buildGeneratedLineItemDescription(service.serviceName, service.hours, 'component', quoteLanguage),
        quantity,
        unitPrice: service.price,
        internalCost: service.cost,
        displayMode: 'priced',
        discounts: 0,
      }
    })

    const nextItems = [...lineItems, ...nextLines]
    const composed = applyDiscountToLineItems(nextItems, discountType, discountValue)
    await lineItemsMutation.mutateAsync(composed)
    setSelectedServiceIds([])
    toast.success(`${nextLines.length} services added`)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border border-border/40 bg-surface-muted/20 px-4 py-3">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-white">Quote Generator</h1>
          <StatusPill label={data?.status ?? 'Draft'} />
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="btn-compact-secondary" onClick={handlePrintPdf}>
            <Printer size={14} />
            <span>{isGeneratingPdf ? 'Preparing PDF…' : 'Print / PDF'}</span>
          </button>
          <button type="button" className="btn-compact-secondary" onClick={() => void handleSaveDraft()}>
            <Save size={14} />
            <span>Save Draft</span>
          </button>
          <button type="button" className="btn-compact-primary" onClick={() => void handleSendQuote()}>
            <Send size={14} />
            <span>Send Quote</span>
          </button>
        </div>
      </div>

      {snapshotSourceLabel ? (
        <div className="rounded-2xl border border-brand-primary/40 bg-brand-primary/10 px-3 py-2 text-xs text-brand-muted">
          {snapshotSourceLabel}
        </div>
      ) : null}

      <div className="space-y-6">
        <Card title="Packages" subdued>
          <div className="space-y-3">
            <div className="grid gap-2 md:grid-cols-[1fr_180px]">
              <select
                className="select-compact w-full"
                value={selectedPresetId}
                onChange={(event) => setSelectedPresetId(event.target.value)}
              >
                <option value="">Select package preset</option>
                {(packagePresetsQuery.data ?? []).map((preset) => (
                  <option key={preset.id} value={preset.id}>{preset.name}</option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                max={24}
                step={1}
                className="input-compact w-full"
                value={coverageHours}
                onChange={(event) => setCoverageHours(Number(event.target.value) || 1)}
              />
            </div>

        {selectedPresetId ? (
          packagePresetLines.length ? (
            <div className="space-y-2">
              <div className="overflow-x-auto border border-border/40">
                <table className="min-w-full divide-y divide-border/30 text-sm">
                  <thead className="bg-surface-muted/50 text-xs uppercase tracking-[0.08em] text-brand-muted">
                    <tr>
                      <th className="px-3 py-2 text-left">Service</th>
                      <th className="px-3 py-2 text-right">Qty</th>
                      <th className="px-3 py-2 text-right">Hours</th>
                      <th className="px-3 py-2 text-right">Unit Price</th>
                      <th className="px-3 py-2 text-right">Line Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20">
                    {packagePresetLines.map((row, index) => (
                      <tr key={`${row.serviceId}-${row.billingMode}-${index}`} className="transition hover:bg-surface-muted/35">
                        <td className="px-3 py-2.5 text-white">
                          <div>{row.serviceName}</div>
                          {row.serviceDescription ? (
                            <div className="text-xs text-brand-muted">{row.serviceDescription}</div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5 text-right text-brand-muted">{row.quantity}</td>
                        <td className="px-3 py-2.5 text-right text-brand-muted">{row.hours}</td>
                        <td className="px-3 py-2.5 text-right text-brand-muted">
                          {row.billingMode === 'included'
                            ? 'Included'
                            : row.price.toLocaleString('es-MX', { style: 'currency', currency: selectedCurrency })}
                        </td>
                        <td className="px-3 py-2.5 text-right text-white">
                          {row.billingMode === 'included'
                            ? 'Included'
                            : row.totalPrice.toLocaleString('es-MX', { style: 'currency', currency: selectedCurrency })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end border-t border-border/30 pt-2 text-sm font-semibold text-white">
                Total:&nbsp;
                {packagePresetTotal.toLocaleString('es-MX', { style: 'currency', currency: selectedCurrency })}
              </div>
              <div className="grid gap-2 md:grid-cols-[220px_auto] md:items-center">
                <label className="text-xs uppercase tracking-[0.2em] text-brand-muted">
                  Apply mode
                  <select
                    className="select-compact mt-1 w-full"
                    value={applyMode}
                    onChange={(event) => setApplyMode(event.target.value as 'replace' | 'append')}
                  >
                    <option value="replace">Replace existing lines</option>
                    <option value="append">Append to existing lines</option>
                  </select>
                </label>
                <p className="text-xs text-brand-muted md:text-right">
                  {applyMode === 'replace'
                    ? 'Replace mode overwrites current proposal line items with this preset.'
                    : 'Append mode keeps current line items and adds this preset lines below them.'}
                </p>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  className="btn-compact-primary"
                  onClick={() => void handleApplyPreset()}
                  disabled={applyPresetMutation.isPending}
                >
                  {applyPresetMutation.isPending ? 'Applying Preset…' : 'Apply Preset to Proposal'}
                </button>
              </div>
              {!data?.id ? (
                <p className="text-right text-xs text-brand-muted">No active proposal found yet for this lead/brand. Applying a preset will create a draft automatically.</p>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-brand-muted">No component pricing found for this preset at the selected coverage hour.</p>
          )
            ) : null}
          </div>
        </Card>

        <Card title="Line items" subdued>
          <div className="space-y-3">
          {lineItems.length === 0 ? (
            <p className="text-sm text-brand-muted">No line items found yet. Add custom items or apply a package preset.</p>
          ) : (
            <div className="overflow-x-auto border border-border/40">
              <table className="min-w-full divide-y divide-border/30 text-sm">
                <thead className="bg-surface-muted/50 text-xs uppercase tracking-[0.08em] text-brand-muted">
                  <tr>
                    <th className="py-2.5 pl-3 pr-3 text-left">Description</th>
                    <th className="px-3 py-2.5 text-right">Qty</th>
                    <th className="px-3 py-2.5 text-right">Cost ({selectedCurrency})</th>
                    <th className="px-3 py-2.5 text-right">Unit</th>
                    <th className="px-3 py-2.5 text-right">Total</th>
                    <th className="px-3 py-2.5 text-right">Profit</th>
                    <th className="px-3 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {lineItems.map((item, index) => (
                    <tr key={item.id} className="transition hover:bg-surface-muted/35">
                      <td className="py-2.5 pl-3 pr-3 text-white">{item.description}</td>
                      <td className="px-3 py-2.5 text-right text-brand-muted">{item.quantity}</td>
                      <td className="px-3 py-2.5 text-right text-brand-muted">
                        {(item.internalCost ?? 0).toLocaleString('es-MX', { style: 'currency', currency: selectedCurrency })}
                      </td>
                      <td className="px-3 py-2.5 text-right text-brand-muted">
                        {item.displayMode === 'included'
                          ? 'Included'
                          : item.unitPrice.toLocaleString('es-MX', { style: 'currency', currency: selectedCurrency })}
                      </td>
                      <td className="px-3 py-2.5 text-right text-white">
                        {item.displayMode === 'included'
                          ? 'Included'
                          : (item.quantity * item.unitPrice).toLocaleString('es-MX', {
                            style: 'currency',
                            currency: selectedCurrency,
                          })}
                      </td>
                      <td className="px-3 py-2.5 text-right text-emerald-300">
                        {(item.displayMode === 'included'
                          ? 0
                          : (item.quantity * item.unitPrice) - (item.quantity * (item.internalCost ?? 0)))
                          .toLocaleString('es-MX', { style: 'currency', currency: selectedCurrency })}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            className={iconActionButtonClass}
                            onClick={() => void handleMoveLineItem(index, 'up')}
                            disabled={index === 0 || lineItemsMutation.isPending}
                            aria-label="Move line item up"
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            type="button"
                            className={iconActionButtonClass}
                            onClick={() => void handleMoveLineItem(index, 'down')}
                            disabled={index === lineItems.length - 1 || lineItemsMutation.isPending}
                            aria-label="Move line item down"
                          >
                            <ArrowDown size={14} />
                          </button>
                          <button
                            type="button"
                            className={iconActionButtonClass}
                            onClick={() => void handleDeleteLineItem(item.id)}
                            disabled={lineItemsMutation.isPending}
                            aria-label="Delete line item"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="border-t border-border/20 pt-2 text-sm">
            <div className="flex justify-end gap-10 text-brand-muted">
              <span>Items Total:</span>
              <span>{lineItemsSubtotal.toLocaleString('es-MX', { style: 'currency', currency: selectedCurrency })}</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
              <span className="text-brand-muted">Discount:</span>
              <select
                className="select-compact w-28"
                value={discountType}
                onChange={(event) => setDiscountType(event.target.value as 'amount' | 'percent')}
              >
                <option value="amount">$</option>
                <option value="percent">%</option>
              </select>
              <input
                type="number"
                min={0}
                step="0.01"
                className="input-compact w-28 text-right"
                value={discountValue}
                onChange={(event) => setDiscountValue(Number(event.target.value) || 0)}
              />
              <button type="button" className="btn-compact-secondary" onClick={() => void handleApplyDiscount()}>
                Apply
              </button>
            </div>
            <div className="mt-2 flex justify-end gap-10 text-red-300">
              <span>Discount Applied:</span>
              <span>-{computedDiscountDisplay.toLocaleString('es-MX', { style: 'currency', currency: selectedCurrency })}</span>
            </div>

            <div className="mt-3 border-t border-border/30 pt-3">
              <p className="mb-2 text-xs uppercase tracking-[0.2em] text-brand-muted">Tax Breakdown</p>
              {computedSummary.taxes.length ? (
                <div className="space-y-2">
                  {computedSummary.taxes.map((tax) => (
                    <div key={tax.code} className="flex items-center justify-between text-sm text-brand-muted">
                      <span>{tax.displayName} ({Math.round(tax.rate * 100)}%)</span>
                      <span>{tax.amount.toLocaleString('es-MX', { style: 'currency', currency: selectedCurrency })}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-brand-muted">No taxes selected.</p>
              )}
              <div className="mt-2 flex items-center justify-between border-t border-border/30 pt-2 text-base font-semibold text-white">
                <span>Total with taxes</span>
                <span>
                  {computedSummary.grandTotal.toLocaleString('es-MX', {
                    style: 'currency',
                    currency: selectedCurrency,
                  })}
                </span>
              </div>
            </div>
          </div>

          {showAddCustomItem ? (
            <div className="grid gap-2 border border-border/30 bg-surface-muted/20 p-3 sm:grid-cols-[1.8fr_120px_140px_140px_auto_auto]">
              <input
                className="input-compact w-full"
                placeholder="Custom item description"
                value={customLineDraft.description}
                onChange={(event) => setCustomLineDraft((prev) => ({ ...prev, description: event.target.value }))}
              />
              <input
                type="number"
                min={1}
                step={1}
                className="input-compact w-full"
                value={customLineDraft.quantity}
                onChange={(event) => setCustomLineDraft((prev) => ({ ...prev, quantity: Number(event.target.value) || 1 }))}
              />
              <input
                type="number"
                min={0}
                step="0.01"
                className="input-compact w-full"
                value={customLineDraft.internalCost}
                onChange={(event) => setCustomLineDraft((prev) => ({ ...prev, internalCost: Number(event.target.value) || 0 }))}
                placeholder="Cost"
              />
              <input
                type="number"
                step="0.01"
                className="input-compact w-full"
                value={customLineDraft.unitPrice}
                onChange={(event) => setCustomLineDraft((prev) => ({ ...prev, unitPrice: Number(event.target.value) || 0 }))}
                placeholder="Price"
              />
              <button type="button" className="btn-compact-primary" onClick={() => void handleAddCustomLine()}>
                Add
              </button>
              <button type="button" className="btn-compact-secondary" onClick={() => setShowAddCustomItem(false)}>
                Cancel
              </button>
            </div>
          ) : null}

          <div>
            <button
              type="button"
              className="btn-compact-secondary"
              onClick={() => setShowAddCustomItem(true)}
            >
              <Plus size={14} />
              <span>Add Custom Item</span>
            </button>
          </div>
          </div>
        </Card>

        <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
          <Card title="Add Products" subdued>
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.2em] text-brand-muted">Service Selection</p>
              <p className="text-sm text-brand-muted">
                Quick-add services from the active catalog and selected coverage hour.
              </p>
              <div className="grid gap-2 sm:grid-cols-[1fr_130px]">
                <input
                  type="search"
                  className="input-compact w-full"
                  value={serviceSearch}
                  onChange={(event) => setServiceSearch(event.target.value)}
                  placeholder={quoteLanguage === 'es' ? 'Buscar servicio...' : 'Search service...'}
                  aria-label="Search service options"
                />
                <input
                  type="number"
                  min={1}
                  max={24}
                  step={1}
                  className="input-compact w-full"
                  value={coverageHours}
                  onChange={(event) => setCoverageHours(Number(event.target.value) || 1)}
                  aria-label="Coverage hours"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {[4, 6, 8, 10, 12].map((hours) => (
                  <button
                    key={`hours-chip-${hours}`}
                    type="button"
                    className={coverageHours === hours ? 'btn-compact-primary' : 'btn-compact-secondary'}
                    onClick={() => setCoverageHours(hours)}
                  >
                    {hours}h
                  </button>
                ))}
              </div>
              <div className="max-h-80 overflow-y-auto border border-border/30">
                {serviceOptionsQuery.isLoading ? (
                  <p className="px-3 py-3 text-sm text-brand-muted">Loading services...</p>
                ) : groupedServiceOptions.length ? (
                  <div className="divide-y divide-border/20">
                    {groupedServiceOptions.map((serviceGroup) => (
                      <div key={serviceGroup.group}>
                        <div className="border-b border-border/20 bg-surface-muted/40 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-brand-muted">
                          {serviceGroup.group}
                        </div>
                        <div className="divide-y divide-border/20">
                          {serviceGroup.items.map((service) => (
                            <div key={service.serviceId} className="space-y-1 px-3 py-2.5">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-start gap-2">
                                  <input
                                    type="checkbox"
                                    className="mt-0.5 accent-brand-primary"
                                    checked={selectedServiceIds.includes(service.serviceId)}
                                    onChange={() => toggleServiceSelection(service.serviceId)}
                                    aria-label={`Select ${service.serviceName}`}
                                  />
                                  <div>
                                  <p className="text-sm text-white">{service.serviceName}</p>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  className={iconActionButtonClass}
                                  onClick={() => void handleQuickAddService(service.serviceId, serviceQuantities[service.serviceId] ?? 1)}
                                  disabled={lineItemsMutation.isPending}
                                  aria-label={`Add ${service.serviceName}`}
                                >
                                  <Plus size={14} />
                                </button>
                              </div>
                              <div className="flex items-center justify-between gap-2 text-xs text-brand-muted">
                                <span>{service.hours}h</span>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="number"
                                    min={1}
                                    step={1}
                                    className="input-compact w-16"
                                    value={serviceQuantities[service.serviceId] ?? 1}
                                    onChange={(event) => {
                                      const next = Math.max(1, Math.round(Number(event.target.value) || 1))
                                      setServiceQuantities((prev) => ({ ...prev, [service.serviceId]: next }))
                                    }}
                                    aria-label={`Quantity for ${service.serviceName}`}
                                  />
                                  <span>
                                    {service.price.toLocaleString('es-MX', { style: 'currency', currency: selectedCurrency })}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="px-3 py-3 text-sm text-brand-muted">No services match this search/catalog/hour.</p>
                )}
              </div>

              <div className="space-y-2 border border-border/30 bg-surface-muted/20 p-3">
                <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-brand-muted">
                  <span>Selected Products</span>
                  <span>{selectedServices.length}</span>
                </div>
                {selectedServices.length ? (
                  <div className="max-h-28 space-y-1 overflow-y-auto text-xs text-brand-muted">
                    {selectedServices.map((service) => (
                      <div key={`selected-${service.serviceId}`} className="flex items-center justify-between gap-2">
                        <span className="truncate">{service.serviceName}</span>
                        <span>
                          x{Math.max(1, Math.round(serviceQuantities[service.serviceId] ?? 1))}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-brand-muted">No products selected yet.</p>
                )}
                <div className="flex items-center justify-between text-sm text-white">
                  <span>Total</span>
                  <span>{selectedServicesTotal.toLocaleString('es-MX', { style: 'currency', currency: selectedCurrency })}</span>
                </div>
                <button
                  type="button"
                  className="btn-compact-primary w-full justify-center"
                  onClick={() => void handleAddSelectedServices()}
                  disabled={lineItemsMutation.isPending || selectedServices.length === 0}
                >
                  Add Selected Products
                </button>
              </div>
            </div>
          </Card>

          <Card title="Configuration" subdued>
            <div className="space-y-3 text-sm">
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-xs uppercase tracking-[0.2em] text-brand-muted">
                  Client Type
                  <select
                    className="select-compact mt-1 w-full"
                    value={quoteClientType}
                    disabled={isSnapshotLocked}
                    onChange={(event) => applyMarketDefaults(event.target.value as ClientMarketType)}
                  >
                    <option value="INT">INT</option>
                    <option value="MEX">MEX</option>
                  </select>
                </label>
                <label className="text-xs uppercase tracking-[0.2em] text-brand-muted">
                  Language
                  <select
                    className="select-compact mt-1 w-full"
                    value={quoteLanguage}
                    disabled={isSnapshotLocked}
                    onChange={(event) => setQuoteLanguage(event.target.value as ClientLanguage)}
                  >
                    <option value="en">English</option>
                    <option value="es">Spanish</option>
                  </select>
                </label>
                <label className="text-xs uppercase tracking-[0.2em] text-brand-muted sm:col-span-2">
                  Catalog
                  <select
                    className="select-compact mt-1 w-full"
                    value={selectedCatalog}
                    disabled={isSnapshotLocked}
                    onChange={(event) => {
                      setSelectedCatalog(event.target.value as PricingCatalogKey)
                      setSelectedPresetId('')
                    }}
                  >
                    <option value="INT_USD_ENG">International Pricing (USD-ENG)</option>
                    <option value="MEX_MXN_ESP">National Pricing (MXN-ESP)</option>
                  </select>
                </label>
                <label className="text-xs uppercase tracking-[0.2em] text-brand-muted">
                  Currency
                  <select
                    className="select-compact mt-1 w-full"
                    disabled={isSnapshotLocked}
                    {...form.register('currency')}
                  >
                    <option value="MXN">MXN</option>
                    <option value="USD">USD</option>
                  </select>
                </label>
                <label className="text-xs uppercase tracking-[0.2em] text-brand-muted">
                  Coverage Hours
                  <input
                    type="number"
                    min={1}
                    max={24}
                    step={1}
                    className="input-compact mt-1 w-full"
                    value={coverageHours}
                    onChange={(event) => setCoverageHours(Number(event.target.value) || 1)}
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-compact-secondary"
                  onClick={() => {
                    applyClientDefaultsForQuote()
                    setIsSnapshotLocked(false)
                  }}
                >
                  Use Client Defaults
                </button>
                {data?.marketSnapshot ? (
                  isSnapshotLocked ? (
                    <button
                      type="button"
                      className="btn-compact-secondary"
                      onClick={() => {
                        applyClientDefaultsForQuote()
                        setIsSnapshotLocked(false)
                      }}
                    >
                      Unlock Snapshot
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn-compact-secondary"
                      onClick={() => {
                        restoreSnapshotValues()
                        setIsSnapshotLocked(true)
                      }}
                    >
                      Re-lock to Snapshot
                    </button>
                  )
                ) : null}
              </div>
              <div className="flex items-center justify-between border border-border/30 px-3 py-2 text-xs uppercase tracking-[0.2em] text-brand-muted">
                <span>Snapshot Status</span>
                <span className="text-white">{isSnapshotLocked ? 'Locked' : 'Unlocked'}</span>
              </div>

              <div className="border-t border-border/30 pt-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.2em] text-brand-muted">Client & Recipients</p>
                  <button
                    type="button"
                    className="btn-compact-secondary"
                    onClick={() => setShowAddRecipient((prev) => !prev)}
                  >
                    <Plus size={14} />
                    <span>Add Recipient</span>
                  </button>
                </div>

                <div className="space-y-2 border border-border/30 bg-surface-muted/20 p-3">
                  <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-brand-muted">
                    <span>Client on Quote</span>
                    <span className="text-white">{leadProfileQuery.data?.client.name ?? 'No lead selected'}</span>
                  </div>
                  {leadProfileQuery.data?.client.email ? (
                    <p className="text-xs text-brand-muted">{leadProfileQuery.data.client.email}</p>
                  ) : null}

                  {quoteRecipients.length ? (
                    <div className="space-y-2">
                      {quoteRecipients.map((recipient) => (
                        <label
                          key={recipient.id}
                          className="flex items-start justify-between gap-2 border border-border/25 px-2 py-2 text-sm text-white"
                        >
                          <div className="flex items-start gap-2">
                            <input
                              type="checkbox"
                              className="mt-0.5 accent-brand-primary"
                              checked={recipient.selected}
                              onChange={(event) => {
                                setQuoteRecipients((prev) => prev.map((row) => (
                                  row.id === recipient.id
                                    ? { ...row, selected: event.target.checked }
                                    : row
                                )))
                              }}
                            />
                            <div>
                              <p>{recipient.name} <span className="text-brand-muted">({recipient.role})</span></p>
                              <p className="text-xs text-brand-muted">{recipient.email}</p>
                            </div>
                          </div>
                          {recipient.isCustom ? (
                            <button
                              type="button"
                              className={iconActionButtonClass}
                              onClick={() => {
                                setQuoteRecipients((prev) => prev.filter((row) => row.id !== recipient.id))
                              }}
                              aria-label={`Remove ${recipient.name}`}
                            >
                              <Trash2 size={14} />
                            </button>
                          ) : null}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-brand-muted">No recipients with email found yet. Add a custom recipient below.</p>
                  )}

                  {showAddRecipient ? (
                    <div className="grid gap-2 border border-border/30 bg-surface-muted/30 p-2">
                      <input
                        className="input-compact w-full"
                        placeholder="Recipient name"
                        value={newRecipient.name}
                        onChange={(event) => setNewRecipient((prev) => ({ ...prev, name: event.target.value }))}
                      />
                      <input
                        type="email"
                        className="input-compact w-full"
                        placeholder="Recipient email"
                        value={newRecipient.email}
                        onChange={(event) => setNewRecipient((prev) => ({ ...prev, email: event.target.value }))}
                      />
                      <select
                        className="select-compact w-full"
                        value={newRecipient.role}
                        onChange={(event) => setNewRecipient((prev) => ({ ...prev, role: event.target.value }))}
                      >
                        <option value="Client (Secondary)">Client (Secondary)</option>
                        <option value="Planner">Planner</option>
                        <option value="Venue Contact">Venue Contact</option>
                        <option value="Other">Other</option>
                      </select>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          className="btn-compact-secondary"
                          onClick={() => setShowAddRecipient(false)}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="btn-compact-primary"
                          onClick={handleAddRecipient}
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="border-t border-border/30 pt-3">
                <p className="mb-2 text-xs uppercase tracking-[0.2em] text-brand-muted">Payment Schedule</p>
                <label className="text-xs uppercase tracking-[0.2em] text-brand-muted">
                  Apply Saved Schedule
                  <select
                    className="select-compact mt-1 w-full"
                    value={selectedPaymentScheduleId}
                    onChange={(event) => handlePaymentScheduleSelectionChange(event.target.value)}
                    disabled={!availablePaymentSchedules.length}
                  >
                    {!availablePaymentSchedules.length ? (
                      <option value="">No schedules configured in Settings</option>
                    ) : null}
                    {availablePaymentSchedules.map((schedule) => (
                      <option key={schedule.id} value={schedule.id}>
                        {schedule.name}{schedule.isDefault ? ' (Default)' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="mt-2 text-xs text-brand-muted">
                  This selected schedule will be used when accepting a proposal that has no explicit payment rows.
                </p>
                <div className="mt-2 flex items-center justify-between border border-border/30 px-2 py-1.5 text-[11px] uppercase tracking-[0.08em]">
                  <span className="text-brand-muted">Current Proposal Schedule Mode</span>
                  <span className={data?.hasExplicitPaymentSchedule ? 'text-emerald-300' : 'text-amber-300'}>
                    {data?.hasExplicitPaymentSchedule ? 'Explicit Rows Saved' : 'Fallback From Selected Schedule'}
                  </span>
                </div>
                {data?.paymentScheduleAudit ? (
                  <p className="mt-2 text-[11px] text-brand-muted" title={formatPaymentScheduleAuditSummary(data.paymentScheduleAudit)}>
                    Last schedule action: {formatPaymentScheduleAuditActionLabel(data.paymentScheduleAudit.action)}
                    {' '}at {formatPaymentScheduleAuditTimestamp(data.paymentScheduleAudit.at)}
                    {data.paymentScheduleAudit.scheduleId ? ` (${data.paymentScheduleAudit.scheduleId})` : ''}
                    {data.paymentScheduleAudit.performedBy ? ` by ${data.paymentScheduleAudit.performedBy}` : ''}
                  </p>
                ) : null}
                {data?.paymentScheduleAuditHistory?.length ? (
                  <div className="mt-2 border border-border/30 bg-surface-muted/20 p-2 text-[11px] text-brand-muted">
                    <p className="uppercase tracking-[0.08em]">Recent Schedule Actions</p>
                    <ul className="mt-1 space-y-1">
                      {data.paymentScheduleAuditHistory.slice(0, 5).map((event, index) => (
                        <li key={`${event.at}-${event.action}-${index}`} className="flex items-start justify-between gap-2">
                          <span className="max-w-[260px] truncate" title={formatPaymentScheduleAuditHistoryItem(event)}>
                            {formatPaymentScheduleAuditHistoryItem(event)}
                          </span>
                          <span className="text-white">{formatPaymentScheduleAuditTimestamp(event.at)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {data?.hasExplicitPaymentSchedule ? (
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      className="btn-compact-secondary"
                      onClick={() => setShowClearScheduleConfirm(true)}
                      disabled={clearExplicitScheduleMutation.isPending}
                    >
                      {clearExplicitScheduleMutation.isPending ? 'Clearing…' : 'Clear Explicit Schedule'}
                    </button>
                  </div>
                ) : null}
                {selectedPaymentSchedule ? (
                  <div className="mt-3 border border-border/30 bg-surface-muted/20 p-2 text-xs">
                    <p className="text-brand-muted">
                      Previewing: <span className="text-white">{selectedPaymentSchedule.name}</span>
                    </p>
                    {selectedPaymentSchedulePreview.length ? (
                      <div className="mt-2 space-y-1">
                        {selectedPaymentSchedulePreview.map((row) => (
                          <div key={row.id} className="flex items-center justify-between gap-2 text-brand-muted">
                            <span>{row.label} ({row.percentage.toFixed(2)}%) - due {row.dueDate}</span>
                            <span className="text-white">{row.amount.toLocaleString('es-MX', { style: 'currency', currency: selectedCurrency })}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-brand-muted">No valid schedule rows to preview yet.</p>
                    )}

                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        className="btn-compact-secondary"
                        onClick={() => void applySelectedScheduleNowMutation.mutateAsync()}
                        disabled={applySelectedScheduleNowMutation.isPending || !selectedPaymentSchedulePreview.length}
                      >
                        {applySelectedScheduleNowMutation.isPending ? 'Applying Schedule…' : 'Apply Selected Schedule to Proposal Now'}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="border-t border-border/30 pt-3">
                <p className="mb-2 text-xs uppercase tracking-[0.2em] text-brand-muted">Questionnaire Template</p>
                <label className="text-xs uppercase tracking-[0.2em] text-brand-muted">
                  Apply Saved Questionnaire Template
                  <select
                    className="select-compact mt-1 w-full"
                    value={selectedQuestionnaireTemplateId}
                    onChange={(event) => handleQuestionnaireTemplateSelectionChange(event.target.value)}
                    disabled={!availableQuestionnaireTemplates.length}
                  >
                    {!availableQuestionnaireTemplates.length ? (
                      <option value="">No questionnaire templates configured in Settings</option>
                    ) : null}
                    {availableQuestionnaireTemplates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}{template.isDefault ? ' (Default)' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="mt-2 text-xs text-brand-muted">
                  This selected template will be used by the questionnaire step for this quote/proposal.
                </p>
                {selectedQuestionnaireTemplate ? (
                  <div className="mt-2 border border-border/30 bg-surface-muted/20 p-2 text-xs text-brand-muted">
                    <p>
                      Selected: <span className="text-white">{selectedQuestionnaireTemplate.name}</span>
                    </p>
                    <p className="mt-1">
                      Questionnaire title: <span className="text-white">{selectedQuestionnaireTemplate.title}</span>
                    </p>
                  </div>
                ) : null}
              </div>

              <div className="border-t border-border/30 pt-3">
                <p className="mb-2 text-xs uppercase tracking-[0.2em] text-brand-muted">Contract Template</p>
                <label className="text-xs uppercase tracking-[0.2em] text-brand-muted">
                  Apply Saved Contract Template
                  <select
                    className="select-compact mt-1 w-full"
                    value={selectedContractTemplateId}
                    onChange={(event) => handleContractTemplateSelectionChange(event.target.value)}
                    disabled={!availableContractTemplates.length}
                  >
                    {!availableContractTemplates.length ? (
                      <option value="">No contract templates configured in Settings</option>
                    ) : null}
                    {availableContractTemplates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}{template.isDefault ? ' (Default)' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="mt-2 text-xs text-brand-muted">
                  This selected template will be used by contract creation flow for this quote/proposal.
                </p>
                {selectedContractTemplate ? (
                  <div className="mt-2 border border-border/30 bg-surface-muted/20 p-2 text-xs text-brand-muted">
                    <p>
                      Selected: <span className="text-white">{selectedContractTemplate.name}</span>
                    </p>
                    <p className="mt-1">
                      Contract title: <span className="text-white">{selectedContractTemplate.title}</span>
                    </p>
                  </div>
                ) : null}
              </div>

              <div className="border-t border-border/30 pt-3">
                <p className="mb-2 text-xs uppercase tracking-[0.2em] text-brand-muted">Active Tax Codes</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {TAX_CODES_ORDER.map((tax) => (
                    <label key={tax} className="flex items-center gap-2 border border-border/30 px-3 py-2 text-sm text-white">
                      <input type="checkbox" className="accent-brand-primary" {...form.register(`taxes.${tax}` as const)} />
                      {tax}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {showReplaceConfirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md border border-border/60 bg-surface p-4 shadow-card">
            <h2 className="text-base font-semibold text-white">Replace proposal line items?</h2>
            <p className="mt-2 text-sm text-brand-muted">
              Replace mode will remove current proposal line items and substitute the selected preset lines.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="btn-compact-secondary"
                onClick={() => setShowReplaceConfirm(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-compact-primary"
                onClick={() => {
                  setShowReplaceConfirm(false)
                  void applyPresetMutation.mutateAsync()
                }}
                disabled={applyPresetMutation.isPending}
              >
                {applyPresetMutation.isPending ? 'Applying…' : 'Replace & Apply Preset'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showClearScheduleConfirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md border border-border/60 bg-surface p-4 shadow-card">
            <h2 className="text-base font-semibold text-white">Clear explicit payment schedule?</h2>
            <p className="mt-2 text-sm text-brand-muted">
              This will remove saved payment rows from this proposal and revert to fallback schedule mode.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="btn-compact-secondary"
                onClick={() => setShowClearScheduleConfirm(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-compact-primary"
                onClick={() => {
                  setShowClearScheduleConfirm(false)
                  void clearExplicitScheduleMutation.mutateAsync()
                }}
                disabled={clearExplicitScheduleMutation.isPending}
              >
                {clearExplicitScheduleMutation.isPending ? 'Clearing…' : 'Clear Schedule'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isLoading && <p className="text-xs uppercase tracking-[0.3em] text-brand-muted">Syncing proposal…</p>}
    </div>
  )
}

function buildGeneratedLineItemDescription(
  serviceName: string,
  hours: number,
  lineKind: 'package' | 'component' | undefined,
  language: 'en' | 'es',
) {
  if (lineKind === 'package') {
    return serviceName
  }

  if (language === 'es') {
    return `${serviceName} (${hours}h cobertura)`
  }

  return `${serviceName} (${hours}h coverage)`
}

function extractPackagePresetIdFromLineItemId(lineItemId: string): string | null {
  const match = /^preset-package-preset-(.+?)-\d{10,}-\d+$/.exec(lineItemId)
  return match?.[1] ?? null
}

function getRecipientRoleLabel(contact: LeadContactRecord): string {
  switch (contact.role) {
    case 'primary_client':
      return 'Client (Main)'
    case 'planner':
    case 'wedding_planner':
      return 'Planner'
    case 'venue_coordinator':
      return 'Venue Coordinator'
    case 'bride':
      return 'Bride'
    case 'groom':
      return 'Groom'
    case 'parent':
      return 'Parent'
    case 'vendor':
      return 'Vendor'
    default:
      return 'Contact'
  }
}

function applyDiscountToLineItems(
  lineItems: LineItem[],
  discountType: 'amount' | 'percent',
  discountValue: number,
) {
  const cleaned = lineItems.filter((item) => item.id !== DISCOUNT_LINE_ID)
  const subtotal = cleaned.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0)

  if (!Number.isFinite(discountValue) || discountValue <= 0 || subtotal <= 0) {
    return cleaned
  }

  const amount = discountType === 'percent'
    ? Number(((subtotal * discountValue) / 100).toFixed(2))
    : Number(discountValue.toFixed(2))

  if (amount <= 0) return cleaned

  const discountLine: LineItem = {
    id: DISCOUNT_LINE_ID,
    description: discountType === 'percent' ? `Discount (${discountValue}%)` : 'Discount',
    quantity: 1,
    unitPrice: -Math.abs(amount),
    displayMode: 'priced',
    internalCost: 0,
    discounts: 0,
  }

  return [...cleaned, discountLine]
}
