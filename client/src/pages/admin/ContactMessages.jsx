import { useCallback, useEffect, useState } from 'react'
import { Mail, Phone } from 'lucide-react'
import { useAuth } from '../../auth/AuthContext'
import { useLang } from '../../i18n/LanguageContext'
import { supabase } from '../../lib/supabase'

const STATUSES = ['new', 'in_progress', 'responded', 'closed']

export default function ContactMessages() {
  const { t, lang } = useLang()
  const { user } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    const { data, error: queryError } = await supabase.from('contact_messages')
      .select('id, name, email, phone, body, status, created_at')
      .order('created_at', { ascending: false })
      .limit(100)
    if (queryError) setError(true)
    else setItems(data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const updateStatus = async (item, status) => {
    const { error: updateError } = await supabase.from('contact_messages')
      .update({ status, handled_by: user.id })
      .eq('id', item.id)
    if (updateError) setError(true)
    else setItems((rows) => rows.map((row) => row.id === item.id ? { ...row, status } : row))
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-navy">{t('adminArea.contactMessagesTitle')}</h1>
        <p className="mt-1 text-ink/70">{t('adminArea.contactMessagesSub')}</p>
      </div>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{t('adminArea.loadFailed')}</p>}
      {loading && <p className="py-8 text-center text-ink/60">{t('common.loading')}</p>}
      {!loading && !items.length && <p className="rounded-xl bg-white p-8 text-center text-ink/60">{t('adminArea.noContactMessages')}</p>}
      <div className="space-y-3">
        {items.map((item) => (
          <article key={item.id} className="space-y-3 rounded-xl border border-navy/10 bg-white p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-bold text-navy">{item.name}</h2>
                <time className="mt-1 block text-xs text-ink/50" dir="ltr">
                  {new Date(item.created_at).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US')}
                </time>
              </div>
              <select
                className="field max-w-56"
                aria-label={t('adminArea.contactStatus')}
                value={item.status}
                onChange={(event) => updateStatus(item, event.target.value)}
              >
                {STATUSES.map((status) => <option key={status} value={status}>{t(`adminArea.contactStatuses.${status}`)}</option>)}
              </select>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink/70">
              <a className="inline-flex items-center gap-2 underline" href={`mailto:${item.email}`}><Mail size={15} />{item.email}</a>
              {item.phone && <a className="inline-flex items-center gap-2 underline" href={`tel:${encodeURIComponent(item.phone)}`}><Phone size={15} />{item.phone}</a>}
            </div>
            <p className="whitespace-pre-wrap break-words rounded-lg bg-paper p-3 text-sm text-ink">{item.body}</p>
          </article>
        ))}
      </div>
    </div>
  )
}
