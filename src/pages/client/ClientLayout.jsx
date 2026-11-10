import { Link, NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { LayoutDashboard, UserRound, KeyRound, LogOut, Menu, X, Home, FileText, CalendarDays, ClipboardList, MessagesSquare, Bell } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { useLang } from '../../i18n/LanguageContext'

export default function ClientLayout() {
  const { t, lang, setLang } = useLang()
  const { profile, signOut } = useAuth()
  const nav = useNavigate()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  useEffect(() => setOpen(false), [pathname])
  const items = [
    ['/client', 'overview', LayoutDashboard],
    ['/client/documents', 'documents', FileText],
    ['/client/appointments', 'appointments', CalendarDays],
    ['/client/requests', 'requests', ClipboardList],
    ['/client/messages', 'messages', MessagesSquare],
    ['/client/notifications', 'notifications', Bell],
    ['/client/profile', 'profile', UserRound],
    ['/client/security', 'security', KeyRound],
  ]
  const cls = ({ isActive }) =>
    `flex items-center gap-3 px-4 py-3 rounded-lg font-semibold ${isActive ? 'bg-gold text-white' : 'text-white/80 hover:bg-white/10'}`

  const doSignOut = async () => { await signOut(); nav('/', { replace: true }) }

  return (
    <div className="min-h-screen bg-paper">
      <header className="bg-navy text-white sticky top-0 z-40">
        <div className="mx-auto max-w-6xl px-4 h-16 flex items-center justify-between gap-3">
          <Link to="/client" className="flex items-center gap-2">
            <img src="/logo.png" alt={t('brand')} className="h-10 w-auto" />
            <span className="hidden sm:inline font-bold">{t('clientArea.title')}</span>
          </Link>
          <div className="flex items-center gap-2">
            <button className="btn text-sm text-white/80 hover:text-softgold" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}>{lang === 'ar' ? 'EN' : 'ع'}</button>
            <Link to="/" className="btn text-sm text-white/80 hover:text-softgold"><Home size={16} />{t('common.backToSite')}</Link>
            <span className="hidden md:inline text-sm text-white/70">{profile?.full_name}</span>
            <button className="btn btn-gold !py-2 !px-4 text-sm" onClick={doSignOut}><LogOut size={16} />{t('nav.logout')}</button>
            <button className="lg:hidden p-2" aria-label={t('nav.menu')} onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-8 flex gap-8">
        <aside className={`${open ? 'block' : 'hidden'} lg:block w-full lg:w-64 shrink-0`}>
          <nav className="bg-navy rounded-xl p-3 flex flex-col gap-1" aria-label={t('clientArea.title')}>
            {items.map(([to, k, Icon]) => (
              <NavLink key={to} to={to} end={to === '/client'} className={cls}>
                <Icon size={18} />{t(`clientArea.${k}`)}
              </NavLink>
            ))}
          </nav>
          <p className="mt-4 text-xs text-ink/50 px-2 lg:hidden">{t('clientArea.phaseNote')}</p>
        </aside>
        <main className="flex-1 min-w-0">
          <p className="hidden lg:block text-xs text-ink/50 mb-4">{t('clientArea.phaseNote')}</p>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
