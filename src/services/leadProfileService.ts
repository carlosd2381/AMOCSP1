import { supabaseClient } from '@/lib/supabase'

export interface LeadAgendaItem {
  id: string
  title: string
  startTime: string | null
  endTime: string | null
}

export interface LeadOpenDocument {
  id: string
  type: 'questionnaire' | 'contract' | 'invoice'
  status: string
  updatedAt: string
}

export interface LeadBookingProgressStep {
  key: 'quote' | 'questionnaire' | 'contract' | 'invoice'
  label: string
  status: 'complete' | 'in_progress' | 'missing'
  detail: string
}

export interface LeadBookingProgressSnapshot {
  steps: LeadBookingProgressStep[]
  completedCount: number
  totalCount: number
}

export interface LeadOverviewSnapshot {
  agenda: LeadAgendaItem[]
  openDocuments: LeadOpenDocument[]
  bookingProgress: LeadBookingProgressSnapshot
}

export async function fetchLeadOverviewSnapshot(leadId: string): Promise<LeadOverviewSnapshot> {
  const { data: events, error: eventsError } = await supabaseClient
    .from('events')
    .select('id, title, start_time, end_time')
    .eq('lead_id', leadId)
    .order('start_time', { ascending: true })

  if (eventsError) {
    throw eventsError
  }

  const agenda: LeadAgendaItem[] = (events ?? []).map((event) => ({
    id: event.id,
    title: event.title,
    startTime: event.start_time,
    endTime: event.end_time,
  }))

  const eventIds = agenda.map((item) => item.id)

  if (!eventIds.length) {
    const progress = await fetchBookingProgressForLead(leadId, [])
    return {
      agenda,
      openDocuments: [],
      bookingProgress: progress,
    }
  }

  const [contractsResult, invoicesResult, questionnairesResult] = await Promise.all([
    supabaseClient
      .from('contracts')
      .select('id, signed_at, updated_at')
      .in('event_id', eventIds)
      .order('updated_at', { ascending: false })
      .limit(20),
    supabaseClient
      .from('invoices')
      .select('id, status, updated_at')
      .in('event_id', eventIds)
      .in('status', ['unpaid', 'overdue', 'partially_paid'])
      .order('updated_at', { ascending: false })
      .limit(20),
    supabaseClient
      .from('questionnaires')
      .select('id, status, updated_at')
      .in('event_id', eventIds)
      .neq('status', 'submitted')
      .order('updated_at', { ascending: false })
      .limit(20),
  ])

  if (contractsResult.error) throw contractsResult.error
  if (invoicesResult.error) throw invoicesResult.error

  const questionnairesTableMissing = questionnairesResult.error?.code === 'PGRST205'
  if (questionnairesResult.error && !questionnairesTableMissing) {
    throw questionnairesResult.error
  }

  const documents: LeadOpenDocument[] = [
    ...(contractsResult.data ?? []).map((item) => ({
      id: item.id,
      type: 'contract' as const,
      status: item.signed_at ? 'signed' : 'pending_signature',
      updatedAt: item.updated_at,
    })),
    ...(invoicesResult.data ?? []).map((item) => ({
      id: item.id,
      type: 'invoice' as const,
      status: item.status,
      updatedAt: item.updated_at,
    })),
    ...((questionnairesResult.data ?? []) as Array<{ id: string; status: string; updated_at: string }>).map((item) => ({
      id: item.id,
      type: 'questionnaire' as const,
      status: item.status,
      updatedAt: item.updated_at,
    })),
  ].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

  const progress = await fetchBookingProgressForLead(leadId, eventIds)

  return {
    agenda,
    openDocuments: documents,
    bookingProgress: progress,
  }
}

async function fetchBookingProgressForLead(leadId: string, eventIds: string[]): Promise<LeadBookingProgressSnapshot> {
  const proposalsQuery = supabaseClient
    .from('proposals')
    .select('id, status, updated_at')
    .eq('lead_id', leadId)
    .order('updated_at', { ascending: false })
    .limit(10)

  const questionnairesQuery = eventIds.length
    ? supabaseClient
        .from('questionnaires')
        .select('id, status, updated_at')
        .in('event_id', eventIds)
        .order('updated_at', { ascending: false })
        .limit(30)
    : Promise.resolve({ data: [], error: null } as const)

  const contractsQuery = eventIds.length
    ? supabaseClient
        .from('contracts')
        .select('id, signed_at, updated_at')
        .in('event_id', eventIds)
        .order('updated_at', { ascending: false })
        .limit(20)
    : Promise.resolve({ data: [], error: null } as const)

  const invoicesQuery = eventIds.length
    ? supabaseClient
        .from('invoices')
        .select('id, status, updated_at')
        .in('event_id', eventIds)
        .order('updated_at', { ascending: false })
        .limit(50)
    : Promise.resolve({ data: [], error: null } as const)

  const [proposalsResult, questionnairesResult, contractsResult, invoicesResult] = await Promise.all([
    proposalsQuery,
    questionnairesQuery,
    contractsQuery,
    invoicesQuery,
  ])

  if (proposalsResult.error) throw proposalsResult.error
  if (contractsResult.error) throw contractsResult.error
  if (invoicesResult.error) throw invoicesResult.error

  const questionnairesTableMissing = questionnairesResult.error?.code === 'PGRST205'
  if (questionnairesResult.error && !questionnairesTableMissing) {
    throw questionnairesResult.error
  }

  const proposals = proposalsResult.data ?? []
  const questionnaires = (questionnairesResult.data ?? []) as Array<{ id: string; status: string; updated_at: string }>
  const contracts = contractsResult.data ?? []
  const invoices = invoicesResult.data ?? []

  const quoteStep: LeadBookingProgressStep = (() => {
    if (!proposals.length) {
      return {
        key: 'quote',
        label: 'Quote',
        status: 'missing',
        detail: 'No proposal yet',
      }
    }

    const accepted = proposals.find((proposal) => proposal.status === 'accepted')
    if (accepted) {
      return {
        key: 'quote',
        label: 'Quote',
        status: 'complete',
        detail: 'Proposal accepted',
      }
    }

    return {
      key: 'quote',
      label: 'Quote',
      status: 'in_progress',
      detail: 'Proposal drafted/sent',
    }
  })()

  const questionnaireStep: LeadBookingProgressStep = (() => {
    if (!questionnaires.length) {
      return {
        key: 'questionnaire',
        label: 'Questionnaire',
        status: 'missing',
        detail: 'Not started',
      }
    }

    const submittedCount = questionnaires.filter((item) => item.status === 'submitted').length
    if (submittedCount > 0) {
      return {
        key: 'questionnaire',
        label: 'Questionnaire',
        status: 'complete',
        detail: `${submittedCount} submitted`,
      }
    }

    return {
      key: 'questionnaire',
      label: 'Questionnaire',
      status: 'in_progress',
      detail: `${questionnaires.length} pending`,
    }
  })()

  const contractStep: LeadBookingProgressStep = (() => {
    if (!contracts.length) {
      return {
        key: 'contract',
        label: 'Contract',
        status: 'missing',
        detail: 'Not generated',
      }
    }

    const signedCount = contracts.filter((item) => Boolean(item.signed_at)).length
    if (signedCount > 0) {
      return {
        key: 'contract',
        label: 'Contract',
        status: 'complete',
        detail: `${signedCount} signed`,
      }
    }

    return {
      key: 'contract',
      label: 'Contract',
      status: 'in_progress',
      detail: `${contracts.length} awaiting signature`,
    }
  })()

  const invoiceStep: LeadBookingProgressStep = (() => {
    if (!invoices.length) {
      return {
        key: 'invoice',
        label: 'Invoice(s)',
        status: 'missing',
        detail: 'No invoices issued',
      }
    }

    const paidCount = invoices.filter((item) => item.status === 'paid').length
    const fullyPaid = paidCount === invoices.length

    if (fullyPaid) {
      return {
        key: 'invoice',
        label: 'Invoice(s)',
        status: 'complete',
        detail: `${paidCount}/${invoices.length} paid`,
      }
    }

    return {
      key: 'invoice',
      label: 'Invoice(s)',
      status: 'in_progress',
      detail: `${paidCount}/${invoices.length} paid`,
    }
  })()

  const steps: LeadBookingProgressStep[] = [
    quoteStep,
    questionnaireStep,
    contractStep,
    invoiceStep,
  ]

  const completedCount = steps.filter((step) => step.status === 'complete').length

  return {
    steps,
    completedCount,
    totalCount: steps.length,
  }
}
