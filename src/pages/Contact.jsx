import { useState } from 'react'
import { Phone, Mail, MapPin, MessageCircle, Facebook } from 'lucide-react'
import { useLang } from '../i18n/LanguageContext'
import { site } from '../config/site'
import { useOfficeSettings } from '../config/OfficeSettingsContext'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { Section, PageHeader } from '../components/ui'

const safeWebUrl = (value) => {
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) ? url.href : ''
  } catch { return '' }
}

export default function Contact() {
  const { t } = useLang()
  const { office, error: settingsError } = useOfficeSettings()
  const [f, setF] = useState({ name: '', mail: '', phone: '', message: '' })
  const [err, setErr] = useState({}); const [ok, setOk] = useState(false)
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    const n = {}
    if (!f.name.trim() || f.name.trim().length > 120) n.name = t('contact.errName')
    if (f.mail.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.mail.trim())) n.mail = t('contact.errMail')
    if (f.phone.trim().length > 40) n.phone = t('contact.errPhone')
    if (!f.message.trim() || f.message.trim().length > 5000) n.message = t('contact.errMsg')
    setErr(n); setOk(false)
    if (Object.keys(n).length) return
    if (!isSupabaseConfigured) { setErr({ submit: t('contact.sendFailed') }); return }
    setBusy(true)
    const { error: sendError } = await supabase.from('contact_messages').insert({
      name: f.name.trim(),
      email: f.mail.trim().toLowerCase(),
      phone: f.phone.trim(),
      body: f.message.trim(),
    })
    setBusy(false)
    if (sendError) {
      setErr({ submit: sendError.message.includes('CONTACT_RATE_LIMITED') ? t('contact.rateLimited') : t('contact.sendFailed') })
      return
    }
    setF({ name: '', mail: '', phone: '', message: '' })
    setOk(true)
  }
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const phones = (office.phone || '').split(',').map((phone) => phone.trim()).filter(Boolean)
  const whatsapp = (office.whatsapp || '').replace(/\D/g, '')
  const facebook = safeWebUrl(office.facebook || '')
  const mapUrl = safeWebUrl(office.map_url || site.mapEmbedUrl)
  const Field = ({ k, label, type = 'text', area }) => {
    const P = area ? 'textarea' : 'input'
    return <div><label htmlFor={k} className="block font-semibold mb-1">{label}</label>
      <P id={k} type={type} rows={5} maxLength={k === 'name' ? 120 : k === 'mail' ? 254 : k === 'phone' ? 40 : 5000}
        className="field" value={f[k]} onChange={set(k)} aria-invalid={!!err[k]} aria-describedby={err[k] ? k + '-e' : undefined} />
      {err[k] && <p id={k + '-e'} role="alert" className="text-sm text-[#b3261e] mt-1">{err[k]}</p>}</div>
  }
  const Row = ({ icon: I, label, children }) => <li className="flex gap-3"><I className="text-gold shrink-0 mt-1" size={20} /><div><div className="font-bold text-navy">{label}</div><div className="text-ink/80">{children}</div></div></li>
  return (<><PageHeader title={t('contact.title')} sub={t('contact.sub')} />
    <Section><div className="grid lg:grid-cols-2 gap-10">
      <div>
        <ul className="space-y-5">
          <Row icon={Phone} label={t('contact.phones')}>{phones.length ? phones.map((p) => <div key={p} dir="ltr" className="text-start">{p}</div>) : t('contact.notSet')}</Row>
          <Row icon={Mail} label={t('contact.email')}><span dir="ltr">{office.email || t('contact.notSet')}</span></Row>
          <Row icon={MapPin} label={t('contact.address')}>{office.address || t('contact.notSet')}</Row>
          <Row icon={MessageCircle} label={t('contact.whatsapp')}>{whatsapp ? <a className="text-navy underline" href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer">{t('contact.whatsapp')}</a> : t('contact.notSet')}</Row>
          <Row icon={Facebook} label={t('contact.facebook')}>{facebook ? <a className="text-navy underline" href={facebook} target="_blank" rel="noreferrer">{t('contact.facebook')}</a> : t('contact.notSet')}</Row>
        </ul>
        {settingsError && <p role="alert" className="mt-4 text-sm text-red-700">{t('contact.settingsFailed')}</p>}
        <h2 className="mt-8 font-bold text-navy">{t('contact.map')}</h2>
        {mapUrl ? <iframe title={t('contact.map')} src={mapUrl} className="mt-2 w-full h-64 rounded-lg border" loading="lazy" />
          : <div className="mt-2 h-48 rounded-lg bg-paper border border-dashed border-gold grid place-items-center text-sm text-ink/70 px-4 text-center">{t('contact.mapNote')}</div>}
      </div>
      <form onSubmit={submit} noValidate className="bg-paper rounded-xl p-6 space-y-4">
        <h2 className="text-xl font-bold text-navy">{t('contact.form')}</h2>
        <p className="text-sm bg-white border-s-4 border-gold p-3">{t('contact.demo')}</p>
        <Field k="name" label={t('contact.name')} /><Field k="mail" label={t('contact.mail')} type="email" />
        <Field k="phone" label={t('contact.phone')} type="tel" /><Field k="message" label={t('contact.message')} area />
        <button className="btn btn-navy" type="submit" disabled={busy}>{busy ? t('common.loading') : t('common.send')}</button>
        {err.submit && <p role="alert" className="text-sm text-[#b3261e]">{err.submit}</p>}
        {ok && <p role="status" className="text-navy font-semibold">{t('contact.ok')}</p>}
      </form>
    </div></Section></>)
}
