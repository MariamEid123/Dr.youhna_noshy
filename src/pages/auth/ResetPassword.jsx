import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, isSupabaseConfigured } from '../../lib/supabase'
import { authErrorKey } from '../../lib/authErrors'
import { useLang } from '../../i18n/LanguageContext'
import { Section, PageHeader } from '../../components/ui'
import { Alert, SubmitBtn } from '../../components/AuthBits'

export default function ResetPassword() {
  const { t } = useLang()
  const nav = useNavigate()
  const [ready, setReady] = useState(false)
  const [form, setForm] = useState({ password: '', confirm: '' })
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!isSupabaseConfigured) return
    // The recovery link lands here with a session token in the URL.
    supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY' && s) setReady(true)
    })
  }, [])

  const submit = async (e) => {
    e.preventDefault()
    if (form.password.length < 8) { setErr('errPass'); return }
    if (form.password !== form.confirm) { setErr('errConfirm'); return }
    setErr(null); setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: form.password })
    setBusy(false)
    if (error) { setErr(authErrorKey(error)); return }
    nav('/login', { state: { resetOk: true } })
  }

  if (!isSupabaseConfigured) {
    return (<><PageHeader title={t('auth.resetTitle')} />
      <Section><Alert kind="error">{t('auth.setupNeeded')}</Alert></Section></>)
  }

  return (<>
    <PageHeader title={t('auth.resetTitle')} />
    <Section>
      <div className="max-w-md mx-auto bg-white border border-navy/10 rounded-xl p-6 shadow-sm">
        {ready ? (
          <form onSubmit={submit} noValidate className="space-y-4">
            <p className="text-sm text-ink/70">{t('auth.resetSub')}</p>
            <div><label htmlFor="rp-pw" className="block mb-1 font-semibold text-sm">{t('auth.newPassword')}</label>
              <input id="rp-pw" type="password" className="field" value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" />
              <p className="mt-1 text-xs text-ink/60">{t('auth.passHint')}</p></div>
            <div><label htmlFor="rp-pc" className="block mb-1 font-semibold text-sm">{t('auth.confirm')}</label>
              <input id="rp-pc" type="password" className="field" value={form.confirm}
                onChange={(e) => setForm({ ...form, confirm: e.target.value })} autoComplete="new-password" /></div>
            {err && <Alert kind="error">{t(`auth.errors.${err}`)}</Alert>}
            <SubmitBtn busy={busy}>{t('auth.saveNewPassword')}</SubmitBtn>
          </form>
        ) : (
          <div className="space-y-4 text-center">
            <Alert kind="error">{t('auth.resetBadLink')}</Alert>
            <Link to="/forgot-password" className="btn btn-navy">{t('auth.forgot')}</Link>
          </div>
        )}
      </div>
    </Section>
  </>)
}
