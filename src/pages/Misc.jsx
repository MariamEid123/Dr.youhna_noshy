import { Link } from 'react-router-dom'
import { Construction } from 'lucide-react'
import { useLang } from '../i18n/LanguageContext'
import { Section, PageHeader } from '../components/ui'
export const ComingSoon = () => { const { t } = useLang(); return (
  <Section><div className="max-w-md mx-auto text-center py-10">
    <Construction className="mx-auto text-gold" size={48} /><h1 className="mt-4 text-2xl font-bold text-navy">{t('soon.title')}</h1>
    <p className="mt-2 text-ink/75">{t('soon.text')}</p><Link to="/" className="btn btn-navy mt-6">{t('nav.home')}</Link></div></Section>) }
export const Legal = ({ k }) => { const { t } = useLang(); return (<><PageHeader title={t(`legal.${k}.title`)} />
  <Section><div className="max-w-3xl space-y-4 leading-8 text-ink/85">{t(`legal.${k}.body`).map((p) => <p key={p}>{p}</p>)}</div></Section></>) }
