import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, isSupabaseConfigured } from '../../lib/supabase'
import { authErrorKey } from '../../lib/authErrors'
import { useLang } from '../../i18n/LanguageContext'
import { Section, PageHeader } from '../../components/ui'
import { Alert, SubmitBtn } from '../../components/AuthBits'

export default function ForgotPassword() {
  const { t } = useLang()
  const [email, setEmail] = useState('')
  const [err, setErr] = useState(null)
  const [ok, setOk] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setErr('errMail'); return }
    setErr(null); setBusy(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setBusy(false)
    if (error) { setErr(authErrorKey(error)); return }
    setOk(true)
  }

  if (!isSupabaseConfigured) {
    return (<><PageHeader title={t('auth.forgotTitle')} />
      <Section><Alert kind="error">{t('auth.setupNeeded')}</Alert></Section></>)
  }

  return (<>
    <PageHeader title={t('auth.forgotTitle')} />
    <Section>
      <div className="max-w-md mx-auto bg-white border border-navy/10 rounded-xl p-6 shadow-sm">
        {ok ? (
          <div className="space-y-4 text-center">
            <Alert kind="success">{t('auth.resetSent')}</Alert>
            <Link to="/login" className="btn btn-navy">{t('nav.login')}</Link>
          </div>
        ) : (
          <>
            <p className="text-sm text-ink/70">{t('auth.forgotSub')}</p>
            <form onSubmit={submit} noValidate className="mt-6 space-y-4">
              <div><label htmlFor="fp-em" className="block mb-1 font-semibold text-sm">{t('auth.email')}</label>
                <input id="fp-em" type="email" dir="ltr" className="field" value={email}
                  onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></div>
              {err && <Alert kind="error">{t(`auth.errors.${err}`)}</Alert>}
              <SubmitBtn busy={busy}>{t('auth.sendResetLink')}</SubmitBtn>
            </form>
            <p className="mt-4 text-sm text-center"><Link to="/login" className="text-gold font-bold hover:underline">{t('common.back')}</Link></p>
          </>
        )}
      </div>
    </Section>
  </>)
}
