import type { Database } from '@/lib/database.types'
import { supabaseClient } from '@/lib/supabase'
import { getBrandUuidFromSlug } from '@/lib/brandRegistry'
import { type BrandSlug, type LeadStatus } from '@/types'

type LeadRow = Database['public']['Tables']['leads']['Row']
type ClientRow = Database['public']['Tables']['clients']['Row']
type EventRow = Database['public']['Tables']['events']['Row']
type ProposalRow = Database['public']['Tables']['proposals']['Row']
type QuestionnaireRow = Database['public']['Tables']['questionnaires']['Row']
type ContractRow = Database['public']['Tables']['contracts']['Row']
type InvoiceRow = Database['public']['Tables']['invoices']['Row']
type ReviewRow = Database['public']['Tables']['reviews']['Row']

interface LeadRowWithClient extends LeadRow {
  clients: ClientRow | null
}

const DAY_IN_MS = 86_400_000

export interface TimelineItem {
  id: string
  label: string
  tone: 'brand' | 'success' | 'warning'
  description: string
}

export type PortalStepKey = 'proposal' | 'questionnaire' | 'contract' | 'invoices' | 'reviews'
export type PortalStepStatus = 'locked' | 'available' | 'completed'

export interface PortalStep {
  key: PortalStepKey
  title: string
  status: PortalStepStatus
  description: string
  href: string
  ctaLabel: string
  lockedReason?: string
  meta?: string
}

export interface PortalLeadMeta {
  id: string
  clientName: string
  clientEmail: string
  status: LeadStatus
}

export interface PortalEventMeta {
  id: string
  title: string
  startTime: string | null
  endTime: string | null
  location: {
    ceremonyAddress?: string
    receptionAddress?: string
    plannerName?: string
    plannerEmail?: string
    plannerPhone?: string
    notes?: string
  }
}

export interface PortalProposalMeta {
  id: string
  status: ProposalRow['status']
  totalAmount: number
  currency: string
  updatedAt: string
  leadId: string
}

export interface PortalQuestionnaireMeta {
  id: string
  status: QuestionnaireRow['status']
  submittedAt: string | null
  answers: Record<string, unknown> | null
}

export interface PortalContractMeta {
  id: string
  status: 'draft' | 'signed'
  signedAt: string | null
  signaturePath: string | null
  pdfUrl: string | null
}

export interface PortalInvoiceMeta {
  id: string
  invoiceNumber: string
  status: InvoiceRow['status']
  dueDate: string | null
  amountDue: number
  totalAmount: number
  currency: string
}

export interface PortalReviewMeta {
  id: string
  status: ReviewRow['status']
  submittedAt: string | null
  ratings: {
    overall: number | null
    staff: number | null
    media: number | null
  }
  comments: string | null
  testimonial: string | null
  unlocksAt: string | null
}

export interface PortalContext {
  lead: PortalLeadMeta | null
  event: PortalEventMeta | null
  proposal: PortalProposalMeta | null
  questionnaire: PortalQuestionnaireMeta | null
  contract: PortalContractMeta | null
  invoices: PortalInvoiceMeta[]
  review: PortalReviewMeta | null
  steps: PortalStep[]
}

export async function fetchPortalContext(brandSlug: BrandSlug): Promise<PortalContext> {
  const brandUuid = await getBrandUuidFromSlug(brandSlug)

  const { data: leadRow, error: leadError } = await supabaseClient
    .from('leads')
    .select(
      `id, status, event_date, clients:client_id (
        id, name, email
      )`,
    )
    .eq('brand_id', brandUuid)
    .neq('status', 'lost')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle<LeadRowWithClient>()

  if (leadError) {
    throw leadError
  }

  const leadMeta = leadRow ? toPortalLead(leadRow) : null

  const [{ data: eventRow, error: eventError }, { data: proposalRow, error: proposalError }] = await Promise.all([
    leadRow
      ? supabaseClient
          .from('events')
          .select('id, title, start_time, end_time, location, shoot_type, updated_at')
          .eq('lead_id', leadRow.id)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle<EventRow>()
      : Promise.resolve({ data: null, error: null }),
    leadRow
      ? supabaseClient
          .from('proposals')
          .select('id, status, total_amount, currency, updated_at, lead_id')
          .eq('brand_id', brandUuid)
          .eq('lead_id', leadRow.id)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle<ProposalRow>()
      : supabaseClient
          .from('proposals')
          .select('id, status, total_amount, currency, updated_at, lead_id')
          .eq('brand_id', brandUuid)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle<ProposalRow>(),
  ])

  if (eventError) {
    throw eventError
  }

  if (proposalError) {
    throw proposalError
  }

  const eventMeta = eventRow ? toPortalEvent(eventRow) : null
  const proposalMeta = proposalRow ? toPortalProposal(proposalRow) : null

  const eventId = eventRow?.id

  let questionnaireMeta: PortalQuestionnaireMeta | null = null
  let contractMeta: PortalContractMeta | null = null
  let invoicesMeta: PortalInvoiceMeta[] = []
  let reviewMeta: PortalReviewMeta | null = null

  if (eventId) {
    const [questionnaireRes, contractRes, invoiceRes, reviewRes] = await Promise.all([
      supabaseClient
        .from('questionnaires')
        .select('id, status, submitted_at, answers, updated_at')
        .eq('event_id', eventId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle<QuestionnaireRow>(),
      supabaseClient
        .from('contracts')
        .select('id, signature_img, signed_at, pdf_url, updated_at')
        .eq('event_id', eventId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle<ContractRow>(),
      supabaseClient
        .from('invoices')
        .select('id, invoice_number, due_date, total_amount, amount_due, currency, status')
        .eq('event_id', eventId)
        .order('due_date', { ascending: true })
        .returns<InvoiceRow[]>(),
      supabaseClient
        .from('reviews')
        .select('id, status, submitted_at, rating_overall, rating_staff, rating_media, comments, testimonial, updated_at')
        .eq('event_id', eventId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle<ReviewRow>(),
    ])

    if (questionnaireRes.error) throw questionnaireRes.error
    if (contractRes.error) throw contractRes.error
    if (invoiceRes.error) throw invoiceRes.error
    if (reviewRes.error) throw reviewRes.error

    questionnaireMeta = questionnaireRes.data ? toPortalQuestionnaire(questionnaireRes.data) : null
    contractMeta = contractRes.data ? toPortalContract(contractRes.data) : null
    invoicesMeta = invoiceRes.data ? invoiceRes.data.map(toPortalInvoice) : []
    reviewMeta = reviewRes.data ? toPortalReview(reviewRes.data, eventMeta) : buildPendingReview(eventMeta)
  } else {
    reviewMeta = buildPendingReview(eventMeta)
  }

  const steps = buildPortalSteps({
    proposal: proposalMeta,
    questionnaire: questionnaireMeta,
    contract: contractMeta,
    invoices: invoicesMeta,
    review: reviewMeta,
    event: eventMeta,
  })

  return {
    lead: leadMeta,
    event: eventMeta,
    proposal: proposalMeta,
    questionnaire: questionnaireMeta,
    contract: contractMeta,
    invoices: invoicesMeta,
    review: reviewMeta,
    steps,
  }
}

export async function fetchPortalTimeline(brandSlug: BrandSlug): Promise<TimelineItem[]> {
  const brandUuid = await getBrandUuidFromSlug(brandSlug)

  const [invoiceRes, galleryRes] = await Promise.all([
    supabaseClient
      .from('invoices')
      .select('id, due_date, total_amount, amount_due, currency, status')
      .eq('brand_id', brandUuid)
      .eq('status', 'unpaid')
      .order('due_date', { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabaseClient
      .from('galleries')
      .select('id, title, status, updated_at')
      .eq('brand_id', brandUuid)
      .eq('status', 'published')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (invoiceRes.error) {
    throw invoiceRes.error
  }

  if (galleryRes.error) {
    throw galleryRes.error
  }

  const items: TimelineItem[] = []

  if (invoiceRes.data) {
    const dueDate = invoiceRes.data.due_date
      ? new Date(invoiceRes.data.due_date).toLocaleDateString('es-MX', { dateStyle: 'medium' })
      : 'soon'
    items.push({
      id: `invoice-${invoiceRes.data.id}`,
      label: 'Invoice',
      tone: 'warning',
      description: `Deposit of ${formatCurrency(invoiceRes.data.amount_due ?? invoiceRes.data.total_amount ?? 0, invoiceRes.data.currency ?? 'MXN')} due ${dueDate}.`,
    })
  }

  if (galleryRes.data) {
    const publishDate = galleryRes.data.updated_at
      ? new Date(galleryRes.data.updated_at).toLocaleDateString('es-MX', { dateStyle: 'medium' })
      : 'soon'
    items.push({
      id: `gallery-${galleryRes.data.id}`,
      label: 'Gallery',
      tone: 'success',
      description: `${galleryRes.data.title} unlocks ${publishDate}.`,
    })
  }

  if (!items.length) {
    items.push({
      id: 'getting-started',
      label: 'Welcome',
      tone: 'brand',
      description: 'Your production timeline will appear here once invoices or galleries are published.',
    })
  }

  return items
}

function toPortalLead(row: LeadRowWithClient): PortalLeadMeta {
  return {
    id: row.id,
    clientName: row.clients?.name ?? 'Client',
    clientEmail: row.clients?.email ?? 'client@example.com',
    status: row.status,
  }
}

function toPortalEvent(row: EventRow): PortalEventMeta {
  const location = (row.location as Record<string, string | undefined> | null) ?? null
  return {
    id: row.id,
    title: row.title,
    startTime: row.start_time,
    endTime: row.end_time,
    location: {
      ceremonyAddress: location?.ceremonyAddress ?? location?.address,
      receptionAddress: location?.receptionAddress,
      plannerName: location?.plannerName,
      plannerEmail: location?.plannerEmail,
      plannerPhone: location?.plannerPhone,
      notes: location?.notes,
    },
  }
}

function toPortalProposal(row: ProposalRow): PortalProposalMeta {
  return {
    id: row.id,
    status: row.status,
    totalAmount: row.total_amount ?? 0,
    currency: row.currency ?? 'MXN',
    updatedAt: row.updated_at,
    leadId: row.lead_id,
  }
}

function toPortalQuestionnaire(row: QuestionnaireRow): PortalQuestionnaireMeta {
  return {
    id: row.id,
    status: row.status,
    submittedAt: row.submitted_at,
    answers: (row.answers as Record<string, unknown> | null) ?? null,
  }
}

function toPortalContract(row: ContractRow): PortalContractMeta {
  return {
    id: row.id,
    status: row.signed_at ? 'signed' : 'draft',
    signedAt: row.signed_at,
    signaturePath: row.signature_img,
    pdfUrl: row.pdf_url,
  }
}

function toPortalInvoice(row: InvoiceRow): PortalInvoiceMeta {
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    status: row.status,
    dueDate: row.due_date,
    amountDue: row.amount_due ?? 0,
    totalAmount: row.total_amount ?? 0,
    currency: row.currency ?? 'MXN',
  }
}

function toPortalReview(row: ReviewRow, event: PortalEventMeta | null): PortalReviewMeta {
  const unlocksAt = computeReviewUnlockAt(event)
  return {
    id: row.id,
    status: row.status,
    submittedAt: row.submitted_at,
    ratings: {
      overall: row.rating_overall,
      staff: row.rating_staff,
      media: row.rating_media,
    },
    comments: row.comments,
    testimonial: row.testimonial,
    unlocksAt,
  }
}

function buildPendingReview(event: PortalEventMeta | null): PortalReviewMeta | null {
  if (!event) return null
  return {
    id: 'pending-review',
    status: 'draft',
    submittedAt: null,
    ratings: {
      overall: null,
      staff: null,
      media: null,
    },
    comments: null,
    testimonial: null,
    unlocksAt: computeReviewUnlockAt(event),
  }
}

function computeReviewUnlockAt(event: PortalEventMeta | null): string | null {
  if (!event?.endTime && !event?.startTime) return null
  const base = event?.endTime ?? event?.startTime
  if (!base) return null
  const unlock = new Date(base).getTime() + DAY_IN_MS
  return new Date(unlock).toISOString()
}

interface BuildStepsInput {
  proposal: PortalProposalMeta | null
  questionnaire: PortalQuestionnaireMeta | null
  contract: PortalContractMeta | null
  invoices: PortalInvoiceMeta[]
  review: PortalReviewMeta | null
  event: PortalEventMeta | null
}

function buildPortalSteps({ proposal, questionnaire, contract, invoices, review, event }: BuildStepsInput): PortalStep[] {
  const proposalStatus: PortalStepStatus = proposal
    ? proposal.status === 'accepted'
      ? 'completed'
      : 'available'
    : 'locked'

  const questionnaireStatus: PortalStepStatus = proposalStatus === 'completed'
    ? questionnaire?.status === 'submitted'
      ? 'completed'
      : 'available'
    : 'locked'

  const contractStatus: PortalStepStatus = questionnaireStatus === 'completed'
    ? contract
      ? contract.status === 'signed'
        ? 'completed'
        : 'available'
      : 'available'
    : 'locked'

  const invoiceStatus: PortalStepStatus = contractStatus === 'completed'
    ? invoices.length
      ? invoices.every((invoice) => invoice.status === 'paid')
        ? 'completed'
        : 'available'
      : 'available'
    : 'locked'

  const reviewUnlockAt = review?.unlocksAt ? new Date(review.unlocksAt).getTime() : null
  const now = Date.now()
  const reviewUnlocked = reviewUnlockAt ? now >= reviewUnlockAt : false
  const reviewsStatus: PortalStepStatus = reviewUnlocked
    ? review && ['submitted', 'published'].includes(review.status)
      ? 'completed'
      : 'available'
    : 'locked'

  return [
    {
      key: 'proposal',
      title: 'Quote & proposal',
      href: '/portal/proposal',
      status: proposalStatus,
      description:
        proposalStatus === 'locked'
          ? 'We are finalizing pricing before sharing it with you.'
          : proposalStatus === 'completed'
            ? 'Proposal accepted — thank you!'
            : 'Review the curated coverage and confirm your package.',
      ctaLabel: proposalStatus === 'completed' ? 'View proposal' : 'Review proposal',
    },
    {
      key: 'questionnaire',
      title: 'Planning questionnaire',
      href: '/portal/questionnaire',
      status: questionnaireStatus,
      description:
        questionnaireStatus === 'locked'
          ? 'Questionnaire unlocks right after you accept the proposal.'
          : questionnaireStatus === 'completed'
            ? 'Details locked in — we are syncing them with production.'
            : 'Tell us about planners, venues, and timing so we can prep.',
      ctaLabel: questionnaireStatus === 'completed' ? 'View submission' : 'Fill questionnaire',
      lockedReason: questionnaireStatus === 'locked' ? 'Accept the proposal to continue.' : undefined,
    },
    {
      key: 'contract',
      title: 'Agreement & signature',
      href: '/portal/contract',
      status: contractStatus,
      description:
        contractStatus === 'locked'
          ? 'We will generate your agreement after the questionnaire is submitted.'
          : contractStatus === 'completed'
            ? 'Contract signed — welcome aboard!'
            : 'Review the agreement carefully and sign electronically.',
      ctaLabel: contractStatus === 'completed' ? 'View signed contract' : 'Review & sign',
      lockedReason: contractStatus === 'locked' ? 'Submit the questionnaire to unlock.' : undefined,
    },
    {
      key: 'invoices',
      title: 'Invoices & payments',
      href: '/portal/invoices',
      status: invoiceStatus,
      description:
        invoiceStatus === 'locked'
          ? 'Invoices publish once your contract signature is on file.'
          : invoiceStatus === 'completed'
            ? 'All payments received. Thank you!'
            : 'Pay retainers and balances online with your preferred method.',
      ctaLabel: invoiceStatus === 'completed' ? 'View receipts' : 'View invoices',
      lockedReason: invoiceStatus === 'locked' ? 'Sign the contract to unlock billing.' : undefined,
    },
    {
      key: 'reviews',
      title: 'Post-event review',
      href: '/portal/reviews',
      status: reviewsStatus,
      description:
        reviewsStatus === 'locked'
          ? reviewUnlockAt
            ? `Feedback opens ${new Date(reviewUnlockAt).toLocaleDateString('es-MX', { dateStyle: 'medium' })}.`
            : 'We will unlock this space right after your celebration.'
          : reviewsStatus === 'completed'
            ? 'Thanks for celebrating with us and sharing your thoughts.'
            : 'Score our crew and leave any notes about the experience.',
      ctaLabel: reviewsStatus === 'completed' ? 'View review' : 'Share feedback',
      lockedReason:
        reviewsStatus === 'locked'
          ? reviewUnlockAt
            ? 'Review portal unlocks 24 hours after your event concludes.'
            : 'We will open reviews right after your event.'
          : undefined,
      meta: event?.title,
    },
  ]
}

function formatCurrency(amount: number, currency: string) {
  return amount.toLocaleString('es-MX', {
    style: 'currency',
    currency,
  })
}
