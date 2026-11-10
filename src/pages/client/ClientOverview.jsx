import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../auth/AuthContext'
import { useLang } from '../../i18n/LanguageContext'
import { CalendarDays, FileText, MessagesSquare, Bell } from 'lucide-react'

export default function ClientOverview() {
  const { t, lang } = useLang()
  const { profile, user } = useAuth()
  const [counts, setCounts] = useState({ appointments: null, documents: null, messages: null, notifications: null })
  const [error, setError] = useState(false)
  const [nextAppointment, setNextAppointment] = useState(null)
  useEffect(() => {
    const load = async () => {
      const results = await Promise.all([
        supabase.from('appointments').select('starts_at, status').eq('client_id', user.id).in('status', ['pending', 'confirmed', 'reschedule_requested', 'rescheduled']).gte('starts_at', new Date().toISOString()).order('starts_at').limit(1),
        supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('client_id', user.id).in('status', ['pending', 'confirmed', 'reschedule_requested', 'rescheduled']),
        supabase.from('documents').select('*', { count: 'exact', head: true }).eq('client_id', user.id),
        supabase.from('messages').select('*', { count: 'exact', head: true }).is('read_at', null).neq('sender_id', user.id),
        supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('user_id', user.id).is('read_at', null),
      ])
      if (results.some((result) => result.error)) { setError(true); return }
      setNextAppointment(results[0].data[0] || null)
      setCounts({ appointments: results[1].count, documents: results[2].count, messages: results[3].count, notifications: results[4].count })
    }
    load()
  }, [user?.id])
  const links = [
    { path: '/client/appointments', key: 'upcomingAppt', count: counts.appointments, icon: CalendarDays },
    { path: '/client/documents', key: 'recentDocs', count: counts.documents, icon: FileText },
    { path: '/client/messages', key: 'messages', count: counts.messages, icon: MessagesSquare },
    { path: '/client/notifications', key: 'notifications', count: counts.notifications, icon: Bell },
  ]
  return (
    <div className="space-y-8">
      <div className="bg-white rounded-xl border border-navy/10 shadow-sm p-6">
        <h1 className="text-2xl font-extrabold text-navy">{t('clientArea.welcome')} <span className="text-gold">{profile?.full_name}</span></h1>
        <p className="mt-2 text-ink/70">{t('clientArea.welcomeSub')}</p>
        <div className="mt-5 grid sm:grid-cols-2 gap-4 text-sm">
          <div className="bg-paper rounded-lg p-4">
            <div className="font-bold text-navy">{t('auth.fullName')}</div>
            <div className="mt-1 text-ink/80">{profile?.full_name || '—'}</div>
          </div>
          <div className="bg-paper rounded-lg p-4">
            <div className="font-bold text-navy">{t('auth.email')}</div>
            <div className="mt-1 text-ink/80 break-all" dir="ltr">{user?.email || '—'}</div>
          </div>
          <div className="bg-paper rounded-lg p-4">
            <div className="font-bold text-navy">{t('auth.phone')}</div>
            <div className="mt-1 text-ink/80" dir="ltr">{profile?.phone || '—'}</div>
          </div>
          <div className="bg-paper rounded-lg p-4">
            <div className="font-bold text-navy">{t('clientArea.company')}</div>
            <div className="mt-1 text-ink/80">{profile?.company_name || '—'}</div>
          </div>
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{t('adminArea.loadFailed')}</p>}
      <Link to="/client/appointments" className="block bg-white rounded-xl border border-gold/40 p-5 hover:border-gold">
        <div className="font-bold text-navy">{t('clientArea.upcomingAppt')}</div>
        <div className="mt-1 text-sm text-ink/70">
          {nextAppointment ? new Date(nextAppointment.starts_at).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US') : t('workspace.noItems')}
        </div>
      </Link>
      <div className="grid gap-4 sm:grid-cols-2">
        {links.map(({ icon: Icon, key, path, count }) => (
          <Link to={path} key={key} className="bg-white rounded-xl border border-navy/10 shadow-sm p-5 flex items-center gap-4 hover:border-gold transition-colors">
            <span className="w-11 h-11 rounded-lg bg-navy/5 text-navy grid place-items-center"><Icon size={22} /></span>
            <div className="flex-1">
              <div className="font-bold text-navy">{t(`clientArea.${key}`)}</div>
              <div className="text-xs text-ink/60 mt-0.5">{count === null ? t('common.loading') : count}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
