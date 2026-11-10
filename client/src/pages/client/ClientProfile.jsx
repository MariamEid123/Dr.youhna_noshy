import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { authErrorKey } from '../../lib/authErrors'
import { useAuth } from '../../auth/AuthContext'
import { useLang } from '../../i18n/LanguageContext'
import { Alert, SubmitBtn } from '../../components/AuthBits'

export default function ClientProfile() {
  const { t } = useLang()
  const { profile, user, refreshProfile } = useAuth()
  const [form, setForm] = useState({
    full_name: profile?.full_name ?? '',
    phone: profile?.phone ?? '',
    company_name: profile?.company_name ?? '',
  })
  const [err, setErr] = useState(null)
  const [ok, setOk] = useState(false)
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => { setOk(false); setForm({ ...form, [k]: e.target.value }) }

  const submit = async (e) => {
    e.preventDefault()
    if (!form.full_name.trim()) { setErr('errName'); return }
    if (!/^[\d+\s()-]{6,20}$/.test(form.phone.trim())) { setErr('errPhone'); return }
    setErr(null); setOk(false); setBusy(true)
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: form.full_name.trim(),
        phone: form.phone.trim(),
        company_name: form.company_name.trim(),
      })
      .eq('id', profile.id)
    setBusy(false)
    if (error) { setErr(authErrorKey(error) || 'generic'); return }
    await refreshProfile()
    setOk(true)
  }

  return (
    <div className="max-w-xl mx-auto bg-white rounded-xl border border-navy/10 shadow-sm p-6">
      <h1 className="text-xl font-extrabold text-navy">{t('clientArea.profile')}</h1>
      <div className="mt-4 grid sm:grid-cols-2 gap-3 text-sm">
        <div className="bg-paper rounded-lg p-3">
          <div className="font-bold text-navy">{t('auth.email')}</div>
          <div className="mt-1 text-ink/80 break-all" dir="ltr">{user?.email ?? ''}</div>
        </div>
        <div className="bg-paper rounded-lg p-3">
          <div className="font-bold text-navy">{t('clientArea.role')}</div>
          <div className="mt-1 text-ink/80">{t(`roles.${profile?.role ?? 'client'}`)}</div>
        </div>
      </div>
      <form onSubmit={submit} noValidate className="mt-6 space-y-4">
        <div><label htmlFor="pf-fn" className="block mb-1 font-semibold text-sm">{t('auth.fullName')}</label>
          <input id="pf-fn" className="field" value={form.full_name} onChange={set('full_name')} /></div>
        <div><label htmlFor="pf-ph" className="block mb-1 font-semibold text-sm">{t('auth.phone')}</label>
          <input id="pf-ph" className="field" dir="ltr" value={form.phone} onChange={set('phone')} inputMode="tel" /></div>
        <div><label htmlFor="pf-co" className="block mb-1 font-semibold text-sm">{t('clientArea.company')}</label>
          <input id="pf-co" className="field" value={form.company_name} onChange={set('company_name')} /></div>
        {err && <Alert kind="error">{t(`auth.errors.${err}`)}</Alert>}
        {ok && <Alert kind="success">{t('clientArea.profileSaved')}</Alert>}
        <SubmitBtn busy={busy} className="btn btn-navy w-full">{t('common.save')}</SubmitBtn>
      </form>
    </div>
  )
}
