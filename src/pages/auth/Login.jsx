import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { supabase, isSupabaseConfigured } from '../../lib/supabase'
import { authErrorKey } from '../../lib/authErrors'
import { useLang } from '../../i18n/LanguageContext'
import { Section, PageHeader } from '../../components/ui'
import { Alert, SubmitBtn } from '../../components/AuthBits'
import { LogIn } from 'lucide-react'

export default function Login() {
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
    // Route by role, read fresh from the database (context updates async).
    const { data: { user } } = await supabase.auth.getUser()
    const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    const role = prof?.role
    if (['staff', 'office_admin', 'super_admin'].includes(role)) nav('/admin', { replace: true })
    else nav(loc.state?.from || '/client', { replace: true })
  }

  if (!isSupabaseConfigured) {
    return (<><PageHeader title={t('auth.loginTitle')} />
      <Section><Alert kind="error">{t('auth.setupNeeded')}</Alert></Section></>)
  }

  return (<>
    <PageHeader title={t('auth.loginTitle')} />
    <Section>
      <div className="max-w-md mx-auto bg-white border border-navy/10 rounded-xl p-6 shadow-sm">
        <h2 className="text-xl font-bold text-navy flex items-center gap-2"><LogIn size={20} className="text-gold" />{t('auth.loginSub')}</h2>
        {loc.state?.resetOk && <div className="mt-3"><Alert kind="success">{t('auth.passwordChangedLogin')}</Alert></div>}
        <form onSubmit={submit} noValidate className="mt-6 space-y-4">
          <div><label htmlFor="em" className="block mb-1 font-semibold text-sm">{t('auth.email')}</label>
            <input id="em" type="email" dir="ltr" className="field" value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" /></div>
          <div><label htmlFor="pw" className="block mb-1 font-semibold text-sm">{t('auth.password')}</label>
            <input id="pw" type="password" className="field" value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="current-password" /></div>
          {err && <Alert kind="error">{t(`auth.errors.${err}`)}</Alert>}
          <SubmitBtn busy={busy}>{t('nav.login')}</SubmitBtn>
        </form>
        <div className="mt-4 flex flex-col gap-2 text-sm text-center text-ink/70">
          <p>{t('auth.noAccount')} <Link to="/register" className="text-gold font-bold hover:underline">{t('nav.register')}</Link></p>
          <p><Link to="/forgot-password" className="text-gold font-bold hover:underline">{t('auth.forgot')}</Link></p>
          <p className="text-xs text-ink/50">{t('auth.staffLoginHint')} <Link to="/admin/login" className="underline">{t('auth.staffLoginLink')}</Link></p>
        </div>
      </div>
    </Section>
  </>)
}
