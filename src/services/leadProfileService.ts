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

export interface LeadOverviewSnapshot {
  agenda: LeadAgendaItem[]
  openDocuments: LeadOpenDocument[]
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
    return {
      agenda,
      openDocuments: [],
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

  return {
    agenda,
    openDocuments: documents,
  }
}
