import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase, isSupabaseConfigured } from '../../lib/supabase'
import { authErrorKey } from '../../lib/authErrors'
import { useLang } from '../../i18n/LanguageContext'
import { Section, PageHeader } from '../../components/ui'
import { Alert, SubmitBtn } from '../../components/AuthBits'
import { UserPlus } from 'lucide-react'

export default function Register() {
  const { t } = useLang()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const [form, setForm] = useState({ full_name: '', phone: '', email: '', password: '', confirm: '' })
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const validate = () => {
    if (!form.full_name.trim()) return 'errName'
    if (!/^[\d+\s()-]{6,20}$/.test(form.phone.trim())) return 'errPhone'
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) return 'errMail'
    if (form.password.length < 8) return 'errPass'
    if (form.password !== form.confirm) return 'errConfirm'
    return null
  }

  const submit = async (e) => {
    e.preventDefault()
    const v = validate()
    if (v) { setErr(v); return }
    setErr(null); setBusy(true)
    const { data, error } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: {
        data: { full_name: form.full_name.trim(), phone: form.phone.trim() },
        emailRedirectTo: `${window.location.origin}/login`,
      },
    })
    setBusy(false)
    if (error) { setErr(authErrorKey(error)); return }
    // The DB trigger always creates the profile with role 'client'.
    if (data.session) { nav(params.get('next') || '/client'); return }
    nav('/verify-email', { state: { email: form.email.trim() } })
  }

  if (!isSupabaseConfigured) {
    return (<><PageHeader title={t('auth.registerTitle')} />
      <Section><Alert kind="error">{t('auth.setupNeeded')}</Alert></Section></>)
  }

  return (<>
    <PageHeader title={t('auth.registerTitle')} />
    <Section>
      <div className="max-w-md mx-auto bg-white border border-navy/10 rounded-xl p-6 shadow-sm">
        <h2 className="text-xl font-bold text-navy flex items-center gap-2"><UserPlus size={20} className="text-gold" />{t('auth.registerSub')}</h2>
        <p className="mt-2 text-sm text-ink/70">{t('auth.registerNote')}</p>
        <form onSubmit={submit} noValidate className="mt-6 space-y-4">
          <div><label htmlFor="fn" className="block mb-1 font-semibold text-sm">{t('auth.fullName')}</label>
            <input id="fn" className="field" value={form.full_name} onChange={set('full_name')} autoComplete="name" /></div>
          <div><label htmlFor="ph" className="block mb-1 font-semibold text-sm">{t('auth.phone')}</label>
            <input id="ph" className="field" dir="ltr" value={form.phone} onChange={set('phone')} inputMode="tel" autoComplete="tel" /></div>
          <div><label htmlFor="em" className="block mb-1 font-semibold text-sm">{t('auth.email')}</label>
            <input id="em" type="email" dir="ltr" className="field" value={form.email} onChange={set('email')} autoComplete="email" /></div>
          <div><label htmlFor="pw" className="block mb-1 font-semibold text-sm">{t('auth.password')}</label>
            <input id="pw" type="password" className="field" value={form.password} onChange={set('password')} autoComplete="new-password" />
            <p className="mt-1 text-xs text-ink/60">{t('auth.passHint')}</p></div>
          <div><label htmlFor="pc" className="block mb-1 font-semibold text-sm">{t('auth.confirm')}</label>
            <input id="pc" type="password" className="field" value={form.confirm} onChange={set('confirm')} autoComplete="new-password" /></div>
          {err && <Alert kind="error">{t(`auth.errors.${err}`)}</Alert>}
          <SubmitBtn busy={busy}>{t('auth.createAccount')}</SubmitBtn>
        </form>
        <p className="mt-4 text-sm text-center text-ink/70">
          {t('auth.hasAccount')} <Link to="/login" className="text-gold font-bold hover:underline">{t('nav.login')}</Link>
        </p>
      </div>
    </Section>
  </>)
}
