import { createClient } from '@supabase/supabase-js'
import { env } from './env'
import type { Database } from './database.types'

const supabaseUrl = env.supabaseUrl
const supabaseKey = env.supabaseAnonKey

if (!supabaseUrl || !supabaseKey) {
	throw new Error('Missing Supabase configuration. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
}

export const supabaseClient = createClient<Database>(supabaseUrl, supabaseKey, {
	auth: {
		persistSession: true,
		detectSessionInUrl: true,
	},
})
