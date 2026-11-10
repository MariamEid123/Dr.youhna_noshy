import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useLang } from '../../i18n/LanguageContext'
import { Search, Users } from 'lucide-react'

export default function ClientsList() {
  const { t } = useLang()
  const [rows, setRows] = useState([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, phone, company_name, is_active, created_at')
        .eq('role', 'client')
        .order('created_at', { ascending: false })
      if (error) setErr(true)
      else setRows(data)
      setLoading(false)
    }
    load()
  }, [])

  const filtered = rows.filter((r) => {
    const s = q.toLowerCase()
    return !s || r.full_name.toLowerCase().includes(s) || (r.email || '').toLowerCase().includes(s) || r.phone.includes(q) || r.company_name.toLowerCase().includes(s)
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-navy flex items-center gap-2"><Users className="text-gold" size={26} />{t('adminArea.clients')}</h1>
        <p className="mt-1 text-ink/70 text-sm">{t('adminArea.clientsSub')}</p>
      </div>
      <div className="bg-white rounded-xl border border-navy/10 shadow-sm p-5">
        <div className="relative">
          <Search size={18} className="absolute top-1/2 -translate-y-1/2 start-3 text-ink/40" />
          <input className="field ps-10" placeholder={t('adminArea.searchClients')}
            value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('adminArea.searchClients')} />
        </div>
        {err && <p className="mt-4 text-red-700 text-sm">{t('adminArea.loadFailed')}</p>}
        {loading ? (
          <p className="mt-4 text-ink/50 text-center py-6">{t('common.loading')}</p>
        ) : filtered.length === 0 ? (
          <p className="mt-4 text-ink/50 text-center py-6">{rows.length === 0 ? t('adminArea.noClientsYet') : t('common.noResults')}</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm min-w-[680px]">
              <thead>
                <tr className="text-navy border-b border-navy/10">
                  <th className="p-2 text-start font-bold">{t('auth.fullName')}</th>
                  <th className="p-2 text-start font-bold">{t('auth.email')}</th>
                  <th className="p-2 text-start font-bold">{t('auth.phone')}</th>
                  <th className="p-2 text-start font-bold">{t('clientArea.company')}</th>
                  <th className="p-2 text-start font-bold">{t('adminArea.joined')}</th>
                  <th className="p-2 text-start font-bold">{t('adminArea.status')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b border-navy/5">
                    <td className="p-2 font-semibold text-navy">{r.full_name || '—'}</td>
                    <td className="p-2" dir="ltr">{r.email || '—'}</td>
                    <td className="p-2" dir="ltr">{r.phone || '—'}</td>
                    <td className="p-2">{r.company_name || '—'}</td>
                    <td className="p-2 text-ink/70">{new Date(r.created_at).toLocaleDateString()}</td>
                    <td className="p-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${r.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {r.is_active ? t('adminArea.active') : t('adminArea.inactive')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
