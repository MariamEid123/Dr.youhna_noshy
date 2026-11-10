import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

const ServicesContext = createContext(null)

export function ServicesProvider({ children }) {
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [error, setError] = useState(false)

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return false
    }
    const { data, error: queryError } = await supabase.from('services')
      .select('code, title_ar, title_en, short_ar, short_en, details_ar, details_en, is_active')
      .eq('is_active', true)
      .order('code')
    if (queryError) { setError(true); setLoading(false); return false }
    setServices(data)
    setError(false)
    setLoading(false)
    return true
  }, [])

  useEffect(() => { void refresh() }, [refresh])
  return <ServicesContext.Provider value={{ services, loading, error, configured: isSupabaseConfigured, refresh }}>{children}</ServicesContext.Provider>
}

export const useServices = () => useContext(ServicesContext)
