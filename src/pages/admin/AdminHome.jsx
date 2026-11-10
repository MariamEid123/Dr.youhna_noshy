import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../auth/AuthContext'
import { useLang } from '../../i18n/LanguageContext'
import { Users, UserPlus, UserCog, CalendarDays, FileText, MessagesSquare, ClipboardList, Bell, Settings, Mail } from 'lucide-react'

export default function AdminHome() {
  const { t } = useLang()
  const { profile, isAdminLevel } = useAuth()
  const [counts, setCounts] = useState({
    clients: null, staff: null, newClients: null, appointments: null,
    todayAppointments: null, upcomingAppointments: null,
    documents: null, messages: null, requests: null, notifications: null, contactMessages: null,
  })
  const [err, setErr] = useState(false)

  useEffect(() => {
    const load = async () => {
      const monthAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
      const results = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'client'),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).in('role', ['staff', 'office_admin', 'super_admin']),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'client').gte('created_at', monthAgo),
        supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('documents').select('*', { count: 'exact', head: true }).in('status', ['received', 'under_review']),
        supabase.from('messages').select('*', { count: 'exact', head: true }).is('read_at', null),
        supabase.from('service_requests').select('*', { count: 'exact', head: true }).in('status', ['pending', 'in_review']),
        supabase.from('notifications').select('*', { count: 'exact', head: true }).is('read_at', null),
        isAdminLevel
          ? supabase.from('contact_messages').select('*', { count: 'exact', head: true }).eq('status', 'new')
          : Promise.resolve({ count: null, error: null }),
        supabase.from('office_settings').select('value').eq('key', 'timezone').maybeSingle(),
      ])
      if (results.some((result) => result.error)) { setErr(true); return }
      const timezone = results[9].data?.value || 'UTC'
      try { new Intl.DateTimeFormat('en', { timeZone: timezone }) } catch { setErr(true); return }
      const now = new Date()
      const dateParts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
      }).formatToParts(now).map((part) => [part.type, part.value]))
      const officeDate = `${dateParts.year}-${dateParts.month}-${dateParts.day}`
      const wallTimeToIso = (value) => {
        const [date, time] = value.split('T')
        const [year, month, day] = date.split('-').map(Number)
        const [hour, minute] = time.split(':').map(Number)
        const desired = Date.UTC(year, month - 1, day, hour, minute)
        let timestamp = desired
        const formatter = new Intl.DateTimeFormat('en-CA', {
          timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
        })
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const parts = Object.fromEntries(formatter.formatToParts(new Date(timestamp)).map((part) => [part.type, part.value]))
          timestamp += desired - Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute))
        }
        return new Date(timestamp).toISOString()
      }
      const nextDate = new Date(`${officeDate}T00:00:00Z`)
      nextDate.setUTCDate(nextDate.getUTCDate() + 1)
      const [todayResult, upcomingResult] = await Promise.all([
        supabase.from('appointments').select('*', { count: 'exact', head: true })
          .in('status', ['confirmed', 'rescheduled']).gte('starts_at', wallTimeToIso(`${officeDate}T00:00`)).lt('starts_at', wallTimeToIso(`${nextDate.toISOString().slice(0, 10)}T00:00`)),
        supabase.from('appointments').select('*', { count: 'exact', head: true })
          .in('status', ['confirmed', 'rescheduled']).gte('starts_at', now.toISOString()),
      ])
      if (todayResult.error || upcomingResult.error) { setErr(true); return }
      setCounts({
        clients: results[0].count, staff: results[1].count, newClients: results[2].count,
        appointments: results[3].count, documents: results[4].count, messages: results[5].count,
        requests: results[6].count, notifications: results[7].count, contactMessages: results[8].count,
        todayAppointments: todayResult.count, upcomingAppointments: upcomingResult.count,
      })
    }
    load()
  }, [isAdminLevel])

  const cards = [
    { icon: Users, label: t('adminArea.totalClients'), value: counts.clients },
    { icon: UserPlus, label: t('adminArea.newClients30'), value: counts.newClients },
    { icon: UserCog, label: t('adminArea.staffAccounts'), value: counts.staff },
  ]
  const operations = [
    { path: '/admin/appointments', icon: CalendarDays, label: t('adminArea.apptRequests'), value: counts.appointments },
    { path: '/admin/appointments', icon: CalendarDays, label: t('adminArea.todayAppointments'), value: counts.todayAppointments },
    { path: '/admin/appointments', icon: CalendarDays, label: t('adminArea.upcomingAppointments'), value: counts.upcomingAppointments },
    { path: '/admin/documents', icon: FileText, label: t('adminArea.docsToReview'), value: counts.documents },
    { path: '/admin/messages', icon: MessagesSquare, label: t('adminArea.unreadChats'), value: counts.messages },
    { path: '/admin/requests', icon: ClipboardList, label: t('adminArea.pendingRequests'), value: counts.requests },
    { path: '/admin/notifications', icon: Bell, label: t('adminArea.notifications'), value: counts.notifications },
    { path: '/admin/contact-messages', icon: Mail, label: t('adminArea.contactMessages'), value: counts.contactMessages },
    { path: '/admin/settings', icon: Settings, label: t('adminArea.settings'), value: null },
  ]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-extrabold text-navy">{t('adminArea.welcome')} <span className="text-gold">{profile?.full_name}</span></h1>
        <p className="mt-1 text-ink/70">{t('adminArea.welcomeSub')}</p>
      </div>
      {err && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{t('adminArea.loadFailed')}</div>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(({ icon: Icon, label, value }) => (
          <div key={label} className="bg-white rounded-xl border border-navy/10 shadow-sm p-5">
            <div className="flex items-center gap-3">
              <span className="w-11 h-11 rounded-lg bg-navy text-softgold grid place-items-center"><Icon size={22} /></span>
              <div className="font-bold text-navy text-sm">{label}</div>
            </div>
            <div className="mt-3 text-3xl font-extrabold text-navy">
              {value === null ? <span className="text-ink/40">…</span> : value}
            </div>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-xl border border-navy/10 shadow-sm p-5">
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {operations.filter((item) => (item.path !== '/admin/settings' && item.path !== '/admin/contact-messages') || isAdminLevel).map(({ path, icon: Icon, label, value }) => (
            <Link key={path} to={path} className="flex items-center gap-3 bg-paper rounded-lg p-3 text-sm text-ink/70 hover:ring-1 hover:ring-gold">
              <Icon size={18} className="text-gold shrink-0" /><span className="flex-1">{label}</span>
              {value !== null && <strong className="text-navy">{value ?? '…'}</strong>}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
