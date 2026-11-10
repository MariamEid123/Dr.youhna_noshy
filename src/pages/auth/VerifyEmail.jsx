import { Link, useLocation } from 'react-router-dom'
import { MailCheck } from 'lucide-react'
import { useLang } from '../../i18n/LanguageContext'
import { Section } from '../../components/ui'

export default function VerifyEmail() {
  const { t } = useLang()
  const { state } = useLocation()
  return (
    <Section>
      <div className="max-w-md mx-auto text-center py-10 bg-white border border-navy/10 rounded-xl shadow-sm px-6">
        <MailCheck className="mx-auto text-gold" size={56} />
        <h1 className="mt-4 text-2xl font-bold text-navy">{t('auth.verifyTitle')}</h1>
        <p className="mt-3 text-ink/75">{t('auth.verifySub')}</p>
        {state?.email && <p className="mt-2 font-bold text-navy" dir="ltr">{state.email}</p>}
        <p className="mt-4 text-sm text-ink/60">{t('auth.verifySpam')}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link to="/login" className="btn btn-gold">{t('nav.login')}</Link>
          <Link to="/" className="btn btn-ghost">{t('nav.home')}</Link>
        </div>
      </div>
    </Section>
  )
}
