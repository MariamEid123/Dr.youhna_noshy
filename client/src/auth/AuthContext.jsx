import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'

const AuthCtx = createContext(null)

const ROLE_STAFF = ['staff', 'office_admin', 'super_admin']

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async (user) => {
    if (!user) { setProfile(null); return }
    const { data, error } = await supabase
      .from('profiles').select('id, full_name, phone, company_name, role, is_active, created_at')
      .eq('id', user.id).single()
    if (error) { setProfile(null); return }
    setProfile(data)
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured) { setLoading(false); return }
    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      setSession(s)
      await loadProfile(s?.user ?? null)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, s) => {
      setSession(s)
      await loadProfile(s?.user ?? null)
    })
    return () => sub.subscription.unsubscribe()
  }, [loadProfile])

  const signOut = useCallback(async () => {
    if (!supabase) return
    await supabase.auth.signOut()
  }, [])

  const refreshProfile = useCallback(async () => {
    await loadProfile(session?.user ?? null)
  }, [loadProfile, session])

  const role = profile?.role ?? null
  const isAuthed = Boolean(session?.user)
  const isClient = isAuthed && role === 'client'
  const isStaff = isAuthed && ROLE_STAFF.includes(role)
  const isSuperAdmin = isAuthed && role === 'super_admin'
  const isAdminLevel = isAuthed && ['office_admin', 'super_admin'].includes(role)

  const value = {
    session, user: session?.user ?? null, profile, loading,
    role, isAuthed, isClient, isStaff, isSuperAdmin, isAdminLevel,
    signOut, refreshProfile,
  }
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

export const useAuth = () => useContext(AuthCtx)
