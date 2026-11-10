import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { site } from './site'

const OfficeSettingsContext = createContext(null)

export function OfficeSettingsProvider({ children }) {
  const [office, setOffice] = useState({
    phone: site.phones.join(', '),
    email: site.email,
    address: '',
    whatsapp: site.whatsapp,
    facebook: site.facebook,
    map_url: site.mapEmbedUrl,
  })
  const [error, setError] = useState(false)

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured) return false
    const { data, error: queryError } = await supabase.from('office_settings')
      .select('key, value')
      .in('key', ['phone', 'email', 'address', 'whatsapp', 'facebook', 'map_url'])
    if (queryError) { setError(true); return false }
    setError(false)
    setOffice((current) => ({ ...current, ...Object.fromEntries(data.map((row) => [row.key, row.value])) }))
    return true
  }, [])

  useEffect(() => { void refresh() }, [refresh])
  return <OfficeSettingsContext.Provider value={{ office, error, refresh }}>{children}</OfficeSettingsContext.Provider>
}

export const useOfficeSettings = () => useContext(OfficeSettingsContext)
