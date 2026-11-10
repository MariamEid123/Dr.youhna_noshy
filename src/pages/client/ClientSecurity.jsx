import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { authErrorKey } from '../../lib/authErrors'
import { useAuth } from '../../auth/AuthContext'
import { useLang } from '../../i18n/LanguageContext'
import { Alert, SubmitBtn } from '../../components/AuthBits'
import { ShieldCheck } from 'lucide-react'

export default function ClientSecurity() {
  const { t } = useLang()
  const { signOut } = useAuth()
  const [form, setForm] = useState({ password: '', confirm: '' })
  const [err, setErr] = useState(null)
  const [ok, setOk] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (form.password.length < 8) { setErr('errPass'); setOk(false); return }
    if (form.password !== form.confirm) { setErr('errConfirm'); setOk(false); return }
    setErr(null); setOk(false); setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: form.password })
    setBusy(false)
    if (error) { setErr(authErrorKey(error)); return }
    setOk(true)
    setForm({ password: '', confirm: '' })
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="bg-white rounded-xl border border-navy/10 shadow-sm p-6">
        <h1 className="text-xl font-extrabold text-navy flex items-center gap-2"><ShieldCheck size={22} className="text-gold" />{t('clientArea.security')}</h1>
        <form onSubmit={submit} noValidate className="mt-6 space-y-4">
          <div><label htmlFor="sc-pw" className="block mb-1 font-semibold text-sm">{t('auth.newPassword')}</label>
            <input id="sc-pw" type="password" className="field" value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" />
            <p className="mt-1 text-xs text-ink/60">{t('auth.passHint')}</p></div>
          <div><label htmlFor="sc-pc" className="block mb-1 font-semibold text-sm">{t('auth.confirm')}</label>
            <input id="sc-pc" type="password" className="field" value={form.confirm}
              onChange={(e) => setForm({ ...form, confirm: e.target.value })} autoComplete="new-password" /></div>
          {err && <Alert kind="error">{t(`auth.errors.${err}`)}</Alert>}
          {ok && <Alert kind="success">{t('clientArea.passwordSaved')}</Alert>}
          <SubmitBtn busy={busy} className="btn btn-navy w-full">{t('clientArea.changePassword')}</SubmitBtn>
        </form>
      </div>
      <div className="bg-white rounded-xl border border-navy/10 shadow-sm p-6">
        <h2 className="font-bold text-navy">{t('clientArea.logoutTitle')}</h2>
        <p className="mt-1 text-sm text-ink/70">{t('clientArea.logoutSub')}</p>
        <button className="btn btn-ghost mt-4" onClick={signOut}>{t('nav.logout')}</button>
      </div>
    </div>
  )
}
