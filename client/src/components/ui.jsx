import { Link } from 'react-router-dom'
import Icon from './Icon'
import { useLang } from '../i18n/LanguageContext'
import { useServices } from '../config/ServicesContext'
export const Section = ({ children, tone = 'white', className = '' }) => (
  <section className={`py-16 ${tone === 'paper' ? 'bg-paper' : tone === 'navy' ? 'bg-navy text-white' : 'bg-white'} ${className}`}>
    <div className="mx-auto max-w-6xl px-4">{children}</div>
  </section>
)
export const Heading = ({ title, sub, light }) => (
  <div className="mb-10 max-w-2xl">
    <h2 className={`text-3xl font-extrabold ${light ? 'text-white' : 'text-navy'}`}>{title}</h2>
    <div className="h-1 w-16 bg-gold mt-3" />
    {sub && <p className={`mt-4 ${light ? 'text-white/80' : 'text-ink/75'}`}>{sub}</p>}
  </div>
)
export const PageHeader = ({ title, sub }) => (
  <div className="bg-navy text-white py-14"><div className="mx-auto max-w-6xl px-4">
    <h1 className="text-4xl font-extrabold">{title}</h1><div className="h-1 w-16 bg-gold mt-3" />
    {sub && <p className="mt-4 text-white/80 max-w-2xl">{sub}</p>}
  </div></div>
)
export function ServiceCard({ id, icon }) {
  const { t, lang } = useLang()
  const { services } = useServices()
  const service = services.find((item) => item.code === id)
  return (
    <article className="bg-white border border-navy/10 rounded-xl p-6 shadow-sm hover:shadow-md hover:border-gold transition-shadow flex flex-col">
      <div className="w-12 h-12 rounded-lg bg-navy text-softgold grid place-items-center"><Icon name={icon} size={24} /></div>
      <h3 className="mt-4 text-lg font-bold text-navy">{service ? (lang === 'ar' ? service.title_ar : service.title_en) : t(`services.${id}.title`)}</h3>
      <p className="mt-2 text-sm text-ink/75 flex-1">{(lang === 'ar' ? service?.short_ar : service?.short_en) || t(`services.${id}.short`)}</p>
      <div className="mt-5 flex flex-wrap gap-2">
        <Link to={`/services/${id}`} className="btn btn-ghost !py-1.5 !px-3 text-sm">{t('common.learnMore')}</Link>
        <Link to={`/client/requests?service=${id}`} className="btn btn-navy !py-1.5 !px-3 text-sm">{t('common.request')}</Link>
      </div>
    </article>
  )
}
