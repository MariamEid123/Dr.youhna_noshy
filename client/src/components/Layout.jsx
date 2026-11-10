import { useState, useEffect } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Menu, X, Languages, Phone, Mail, LogOut, LayoutDashboard, ShieldCheck } from 'lucide-react'
import { useLang } from '../i18n/LanguageContext'
import { useAuth } from '../auth/AuthContext'
import { useOfficeSettings } from '../config/OfficeSettingsContext'

function Header() {
  const { t, lang, setLang } = useLang()
  const { isAuthed, isClient, isStaff, profile, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  useEffect(() => setOpen(false), [pathname])
  const links = [['/', 'home'], ['/about', 'about'], ['/services', 'services'], ['/contact', 'contact']]
  const cls = ({ isActive }) => `px-3 py-2 font-semibold border-b-2 ${isActive ? 'border-gold text-navy' : 'border-transparent text-ink hover:text-gold'}`
  const dashTo = isStaff ? '/admin' : '/client'
  const doSignOut = async () => { await signOut() }
  return (
    <header className="sticky top-0 z-40 bg-white border-b border-gold/40">
      <div className="mx-auto max-w-6xl px-4 flex items-center justify-between gap-4 h-20">
        <Link to="/" aria-label={t('brandFull')}><img src="/logo.png" alt={t('brand')} className="h-16 w-auto" /></Link>
        <nav className="hidden lg:flex items-center" aria-label="Main">
          {links.map(([to, k]) => <NavLink key={to} to={to} end={to === '/'} className={cls}>{t('nav.' + k)}</NavLink>)}
        </nav>
        <div className="hidden lg:flex items-center gap-2">
          <button className="btn text-navy hover:text-gold" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}><Languages size={18} />{t('nav.lang')}</button>
          {isAuthed ? (
            <>
              <Link to={dashTo} className="btn btn-navy">{isStaff ? <ShieldCheck size={18} /> : <LayoutDashboard size={18} />}{isStaff ? t('nav.adminArea') : t('nav.myArea')}</Link>
              <button className="btn btn-ghost" onClick={doSignOut} title={profile?.full_name}><LogOut size={18} />{t('nav.logout')}</button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn btn-ghost">{t('nav.login')}</Link>
              <Link to="/register" className="btn btn-gold">{t('nav.register')}</Link>
            </>
          )}
        </div>
        <button className="lg:hidden p-2 text-navy" aria-label={t('nav.menu')} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button>
      </div>
      {open && (
        <div className="lg:hidden border-t border-gold/30 bg-white px-4 pb-4 flex flex-col gap-1">
          {links.map(([to, k]) => <NavLink key={to} to={to} end={to === '/'} className={cls}>{t('nav.' + k)}</NavLink>)}
          <div className="flex flex-wrap gap-2 pt-3">
            {isAuthed ? (
              <>
                <Link to={dashTo} className="btn btn-navy flex-1">{isStaff ? t('nav.adminArea') : t('nav.myArea')}</Link>
                <button className="btn btn-ghost flex-1" onClick={doSignOut}>{t('nav.logout')}</button>
              </>
            ) : (
              <>
                <Link to="/login" className="btn btn-ghost flex-1">{t('nav.login')}</Link>
                <Link to="/register" className="btn btn-gold flex-1">{t('nav.register')}</Link>
              </>
            )}
          </div>
          <button className="btn text-navy self-start" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}><Languages size={18} />{t('nav.lang')}</button>
        </div>
      )}
    </header>
  )
}

function Footer() {
  const { t } = useLang()
  const { office } = useOfficeSettings()
  const l = 'hover:text-softgold'
  const phones = (office.phone || '').split(',').map((phone) => phone.trim()).filter(Boolean)
  const whatsapp = (office.whatsapp || '').replace(/\D/g, '')
  const safeFacebook = (() => {
    try {
      const url = new URL(office.facebook || '')
      return ['http:', 'https:'].includes(url.protocol) ? url.href : ''
    } catch { return '' }
  })()
  return (
    <footer className="bg-navy text-white/85 mt-auto">
      <div className="mx-auto max-w-6xl px-4 py-12 grid gap-10 md:grid-cols-3">
        <div>
          <div className="bg-white rounded-lg p-2 inline-block"><img src="/logo.png" alt={t('brand')} className="h-20" /></div>
          <p className="mt-4 text-sm">{t('brandFull')}</p>
        </div>
        <div>
          <h3 className="font-bold text-softgold mb-3">{t('footer.links')}</h3>
          <ul className="space-y-2">
            <li><Link className={l} to="/about">{t('nav.about')}</Link></li>
            <li><Link className={l} to="/services">{t('nav.services')}</Link></li>
            <li><Link className={l} to="/contact">{t('nav.contact')}</Link></li>
            <li><Link className={l} to="/privacy">{t('legal.privacy.title')}</Link></li>
            <li><Link className={l} to="/terms">{t('legal.terms.title')}</Link></li>
            <li><Link className={l} to="/upload-disclaimer">{t('legal.disclaimer.title')}</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="font-bold text-softgold mb-3">{t('footer.contact')}</h3>
          <ul className="space-y-2">
            {phones.map((p) => <li key={p} className="flex items-center gap-2"><Phone size={16} /><span dir="ltr">{p}</span></li>)}
            {office.email && <li className="flex items-center gap-2"><Mail size={16} /><span dir="ltr">{office.email}</span></li>}
            {safeFacebook && <li><a className={l} href={safeFacebook} target="_blank" rel="noreferrer">{t('contact.facebook')}</a></li>}
            {whatsapp && <li><a className={l} href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer">{t('contact.whatsapp')}</a></li>}
          </ul>
        </div>
      </div>
      <div className="border-t border-white/15 py-4 text-center text-sm">© {new Date().getFullYear()} {t('brand')} — {t('footer.rights')}</div>
    </footer>
  )
}

export default function Layout() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return <div className="min-h-screen flex flex-col"><Header /><main className="flex-1"><Outlet /></main><Footer /></div>
}
