import { supabaseClient } from '@/lib/supabase'

export interface LeadActivityItem {
  id: string
  entityId: string
  type:
    | 'task'
    | 'message'
    | 'internal_note'
    | 'contract'
    | 'questionnaire'
    | 'invoice'
    | 'file'
    | 'payable'
  title: string
  detail: string
  happenedAt: string
}

export async function fetchLeadActivity(leadId: string): Promise<LeadActivityItem[]> {
  const { data: events, error: eventsError } = await supabaseClient
    .from('events')
    .select('id')
    .eq('lead_id', leadId)

  if (eventsError) throw eventsError

  const eventIds = (events ?? []).map((event) => event.id)

  const [tasksResult, messagesResult, notesResult, filesResult, payablesResult, contractsResult, questionnairesResult, invoicesResult] = await Promise.all([
    supabaseClient
      .from('lead_tasks')
      .select('id, title, status, updated_at')
      .eq('lead_id', leadId)
      .order('updated_at', { ascending: false })
      .limit(20),
    supabaseClient
      .from('lead_messages')
      .select('id, channel, direction, subject, body, occurred_at')
      .eq('lead_id', leadId)
      .order('occurred_at', { ascending: false })
      .limit(20),
    supabaseClient
      .from('lead_internal_notes')
      .select('id, body, updated_at')
      .eq('lead_id', leadId)
      .order('updated_at', { ascending: false })
      .limit(20),
    supabaseClient
      .from('lead_files')
      .select('id, category, title, created_at')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(20),
    supabaseClient
      .from('lead_payables')
      .select('id, title, status, updated_at')
      .eq('lead_id', leadId)
      .order('updated_at', { ascending: false })
      .limit(20),
    eventIds.length
      ? supabaseClient
          .from('contracts')
          .select('id, signed_at, updated_at')
          .in('event_id', eventIds)
          .order('updated_at', { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [], error: null }),
    eventIds.length
      ? supabaseClient
          .from('questionnaires')
          .select('id, status, submitted_at, updated_at')
          .in('event_id', eventIds)
          .order('updated_at', { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [], error: null }),
    eventIds.length
      ? supabaseClient
          .from('invoices')
          .select('id, invoice_number, status, updated_at')
          .in('event_id', eventIds)
          .order('updated_at', { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [], error: null }),
  ])

  throwIfError(tasksResult.error)
  throwIfError(messagesResult.error)
  throwIfError(notesResult.error)
  throwIfError(filesResult.error)
  throwIfError(payablesResult.error)
  throwIfError(contractsResult.error)
  throwIfError(questionnairesResult.error)
  throwIfError(invoicesResult.error)

  const items: LeadActivityItem[] = [
    ...(tasksResult.data ?? []).map((row) => ({
      id: `task:${row.id}`,
      entityId: row.id,
      type: 'task' as const,
      title: row.title,
      detail: `Task status: ${row.status}`,
      happenedAt: row.updated_at,
    })),
    ...(messagesResult.data ?? []).map((row) => ({
      id: `msg:${row.id}`,
      entityId: row.id,
      type: 'message' as const,
      title: row.subject || `${row.channel} ${row.direction}`,
      detail: row.body.slice(0, 90),
      happenedAt: row.occurred_at,
    })),
    ...(notesResult.data ?? []).map((row) => ({
      id: `note:${row.id}`,
      entityId: row.id,
      type: 'internal_note' as const,
      title: 'Internal note updated',
      detail: row.body.slice(0, 90),
      happenedAt: row.updated_at,
    })),
    ...(filesResult.data ?? []).map((row) => ({
      id: `file:${row.id}`,
      entityId: row.id,
      type: 'file' as const,
      title: row.title,
      detail: `File added to ${row.category}`,
      happenedAt: row.created_at,
    })),
    ...(payablesResult.data ?? []).map((row) => ({
      id: `payable:${row.id}`,
      entityId: row.id,
      type: 'payable' as const,
      title: row.title,
      detail: `A/P status: ${row.status}`,
      happenedAt: row.updated_at,
    })),
    ...((contractsResult.data ?? []) as Array<{ id: string; signed_at: string | null; updated_at: string }>).map((row) => ({
      id: `contract:${row.id}`,
      entityId: row.id,
      type: 'contract' as const,
      title: 'Contract updated',
      detail: row.signed_at ? 'Signed' : 'Draft/pending signature',
      happenedAt: row.updated_at,
    })),
    ...((questionnairesResult.data ?? []) as Array<{ id: string; status: string; submitted_at: string | null; updated_at: string }>).map((row) => ({
      id: `questionnaire:${row.id}`,
      entityId: row.id,
      type: 'questionnaire' as const,
      title: 'Questionnaire updated',
      detail: row.status === 'submitted' ? 'Submitted by client' : 'Draft in progress',
      happenedAt: row.submitted_at ?? row.updated_at,
    })),
    ...((invoicesResult.data ?? []) as Array<{ id: string; invoice_number: string; status: string; updated_at: string }>).map((row) => ({
      id: `invoice:${row.id}`,
      entityId: row.id,
      type: 'invoice' as const,
      title: row.invoice_number,
      detail: `Invoice status: ${row.status}`,
      happenedAt: row.updated_at,
    })),
  ]

  return items
    .sort((a, b) => new Date(b.happenedAt).getTime() - new Date(a.happenedAt).getTime())
    .slice(0, 20)
}

function throwIfError(error: { code?: string; message?: string } | null) {
  if (!error) return
  if (error.code === 'PGRST205') return
  throw error
}
