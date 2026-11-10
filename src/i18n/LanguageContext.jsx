import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { translations } from './translations'
const Ctx = createContext(null)
export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('lang') || 'ar')
  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
    localStorage.setItem('lang', lang)
  }, [lang])
  const t = useCallback((key, params) => {
    const v = key.split('.').reduce((o, k) => o?.[k], translations[lang])
    if (typeof v !== 'string') return params ? key : (v ?? key)
    if (!params) return v
    return v.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? '')
  }, [lang])
  return <Ctx.Provider value={{ lang, setLang, t, dir: lang === 'ar' ? 'rtl' : 'ltr' }}>{children}</Ctx.Provider>
}
export const useLang = () => useContext(Ctx)
