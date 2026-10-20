import { createSupabaseServerClient } from '@/lib/supabase/server'

export type EventRecord = {
  id: string
  title: string
  category: string
  description: string
  event_date: string | null
  registration_opens_at: string | null
  registration_deadline: string | null
  capacity: number | null
  price: number
  status: 'draft' | 'published' | 'cancelled' | 'completed'
  created_at: string
}

export async function getPublishedEvents() {
  const supabase = await createSupabaseServerClient()
  if (!supabase) return { events: [] as EventRecord[], error: null }

  const { data, error } = await supabase
    .from('events')
    .select('id, title, category, description, event_date, registration_opens_at, registration_deadline, capacity, price, status, created_at')
    .eq('status', 'published')
    .order('event_date', { ascending: true, nullsFirst: false })

  return { events: (data ?? []) as EventRecord[], error }
}
