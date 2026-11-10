import { Link, NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { LayoutDashboard, Users, LogOut, Menu, X, Home, ShieldCheck, FileText, CalendarDays, ClipboardList, MessagesSquare, Bell, Settings, ListChecks, Mail } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { useLang } from '../../i18n/LanguageContext'

export default function AdminLayout() {
  const { t, lang, setLang } = useLang()
  const { profile, role, signOut, isSuperAdmin, isAdminLevel } = useAuth()
  const nav = useNavigate()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  useEffect(() => setOpen(false), [pathname])

  const items = [
    ['/admin', 'overview', LayoutDashboard],
    ['/admin/clients', 'clients', Users],
    ['/admin/documents', 'documents', FileText],
    ['/admin/appointments', 'appointments', CalendarDays],
    ['/admin/requests', 'requests', ClipboardList],
    ['/admin/messages', 'messages', MessagesSquare],
    ['/admin/notifications', 'notifications', Bell],
  ]
  if (isAdminLevel) items.push(['/admin/contact-messages', 'contactMessages', Mail], ['/admin/settings', 'settings', Settings])
  if (isSuperAdmin) items.push(['/admin/staff', 'staff', ShieldCheck])
  if (isSuperAdmin) items.push(['/admin/activity', 'activity', ListChecks])

  const cls = ({ isActive }) =>
    `flex items-center gap-3 px-4 py-3 rounded-lg font-semibold ${isActive ? 'bg-gold text-white' : 'text-white/80 hover:bg-white/10'}`

  const doSignOut = async () => { await signOut(); nav('/', { replace: true }) }

  return (
    <div className="min-h-screen bg-paper">
      <header className="bg-navy text-white sticky top-0 z-40 border-b-4 border-gold">
        <div className="mx-auto max-w-7xl px-4 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button className="lg:hidden p-2" aria-label={t('nav.menu')} onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button>
            <Link to="/admin" className="flex items-center gap-2 min-w-0">
              <img src="/logo.png" alt={t('brand')} className="h-10 w-auto" />
              <span className="hidden sm:inline font-bold">{t('adminArea.title')}</span>
            </Link>
            <span className="hidden md:inline text-xs bg-gold/20 text-softgold px-2 py-1 rounded font-bold">{t(`roles.${role ?? 'staff'}`)}</span>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn text-sm text-white/80 hover:text-softgold" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}>{lang === 'ar' ? 'EN' : 'ع'}</button>
            <Link to="/" className="btn text-sm text-white/80 hover:text-softgold"><Home size={16} />{t('common.backToSite')}</Link>
            <span className="hidden md:inline text-sm text-white/70">{profile?.full_name}</span>
            <button className="btn btn-gold !py-2 !px-4 text-sm" onClick={doSignOut}><LogOut size={16} />{t('nav.logout')}</button>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-4 py-8 flex gap-8">
        <aside className={`${open ? 'block fixed inset-x-4 top-20 z-30 shadow-xl' : 'hidden'} lg:static lg:block w-full lg:w-64 shrink-0`}>
          <nav className="bg-navy rounded-xl p-3 flex flex-col gap-1" aria-label={t('adminArea.title')}>
            {items.map(([to, k, Icon]) => (
              <NavLink key={to} to={to} end={to === '/admin'} className={cls}>
                <Icon size={18} />{t(`adminArea.${k}`)}
              </NavLink>
            ))}
          </nav>
        </aside>
        <main className="flex-1 min-w-0"><Outlet /></main>
      </div>
    </div>
  )
}
