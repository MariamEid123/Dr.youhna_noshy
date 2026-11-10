import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY

// True only when the owner has filled .env with real Supabase values.
export const isSupabaseConfigured =
  Boolean(url && key) &&
  url.startsWith('http') &&
  !url.includes('your-project-url') &&
  !key.includes('your-anon-public-key') &&
  !key.includes('your-supabase-publishable-key')

// Only the ANON public key lives in the frontend.
// The service/secret key must NEVER be placed here.
export const supabase = isSupabaseConfigured ? createClient(url, key) : null
