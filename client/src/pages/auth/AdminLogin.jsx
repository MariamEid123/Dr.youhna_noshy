import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { supabase, isSupabaseConfigured } from '../../lib/supabase'
import { authErrorKey } from '../../lib/authErrors'
import { useLang } from '../../i18n/LanguageContext'
import { Section } from '../../components/ui'
import { Alert, SubmitBtn } from '../../components/AuthBits'
import { ShieldCheck } from 'lucide-react'

export default function AdminLogin() {
  const { t } = useLang()
  const nav = useNavigate()
  const loc = useLocation()
  const [form, setForm] = useState({ email: '', password: '' })
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (!form.email.trim() || !form.password) { setErr('errRequired'); return }
    setErr(null); setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: form.email.trim(), password: form.password,
    })
    if (error) { setBusy(false); setErr(authErrorKey(error)); return }
    // Real authorization check: read the role from the database.
    const { data: { user } } = await supabase.auth.getUser()
    const { data: prof, error: perr } = await supabase
      .from('profiles').select('role, is_active').eq('id', user.id).single()
    if (perr || !prof) {
      await supabase.auth.signOut(); setBusy(false); setErr('generic'); return
    }
    if (!prof.is_active) {
      await supabase.auth.signOut(); setBusy(false); setErr('accountDisabled'); return
    }
    if (!['staff', 'office_admin', 'super_admin'].includes(prof.role)) {
      // This is a client account — not allowed in the admin area.
      await supabase.auth.signOut(); setBusy(false); setErr('notStaff'); return
    }
    nav(loc.state?.from || '/admin', { replace: true })
  }

  if (!isSupabaseConfigured) {
    return (
      <Section className="pt-16"><div className="max-w-md mx-auto">
        <Alert kind="error">{t('auth.setupNeeded')}</Alert>
      </div></Section>
    )
  }

  return (
    <Section className="pt-16">
      <div className="max-w-md mx-auto bg-navy text-white rounded-2xl p-8 border-4 border-gold/60 shadow-lg">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt={t('brand')} className="h-14 w-auto" />
          <div>
            <h1 className="text-xl font-extrabold">{t('auth.adminLoginTitle')}</h1>
            <p className="text-sm text-white/70">{t('auth.adminLoginSub')}</p>
          </div>
        </div>
        <form onSubmit={submit} noValidate className="mt-8 space-y-4">
          <div><label htmlFor="aem" className="block mb-1 font-semibold text-sm">{t('auth.email')}</label>
            <input id="aem" type="email" dir="ltr" className="field" value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" /></div>
          <div><label htmlFor="apw" className="block mb-1 font-semibold text-sm">{t('auth.password')}</label>
            <input id="apw" type="password" className="field" value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="current-password" /></div>
          {err && <Alert kind="error">{t(`auth.errors.${err}`)}</Alert>}
          <SubmitBtn busy={busy} className="btn btn-gold w-full">{t('auth.adminLoginBtn')}</SubmitBtn>
        </form>
        <p className="mt-5 text-sm text-center text-white/60 flex items-center justify-center gap-1">
          <ShieldCheck size={14} />{t('auth.adminSecureNote')}
        </p>
        <p className="mt-2 text-xs text-center">
          <Link to="/" className="text-softgold hover:underline">{t('common.backToSite')}</Link>
        </p>
      </div>
    </Section>
  )
}
