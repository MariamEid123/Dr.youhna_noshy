import { Link, useParams, Navigate } from 'react-router-dom'
import { useLang } from '../i18n/LanguageContext'
import { services } from '../config/site'
import { Section, PageHeader, ServiceCard } from '../components/ui'
import Icon from '../components/Icon'
import { useServices } from '../config/ServicesContext'
export function Services() {
  const { t } = useLang()
  const { services: rows, loading, error, configured } = useServices()
  const list = configured && !error ? rows.map((row) => ({ id: row.code, icon: services.find((service) => service.id === row.code)?.icon || 'Briefcase' })) : services
  return (<><PageHeader title={t('services.title')} sub={t('services.sub')} />
    <Section tone="paper">
      {error && <p role="alert" className="mb-5 text-sm text-red-700">{t('services.loadError')}</p>}
      {loading ? <p className="text-center text-ink/60">{t('common.loading')}</p> : list.length
        ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{list.map((service) => <ServiceCard key={service.id} {...service} />)}</div>
        : <p className="text-center text-ink/60">{t('services.empty')}</p>}
    </Section></>)
}
export function ServiceDetail() {
  const { id } = useParams(); const { t, lang } = useLang()
  const { services: rows, configured, loading, error } = useServices()
  const s = services.find((x) => x.id === id)
  const row = rows.find((item) => item.code === id)
  if (loading) return <Section><p className="text-center text-ink/60">{t('common.loading')}</p></Section>
  if (!s || (configured && !error && !row)) return <Navigate to="/services" replace />
  const title = row ? (lang === 'ar' ? row.title_ar : row.title_en) : t(`services.${id}.title`)
  const short = row ? ((lang === 'ar' ? row.short_ar : row.short_en) || t(`services.${id}.short`)) : t(`services.${id}.short`)
  const details = row ? ((lang === 'ar' ? row.details_ar : row.details_en) || t(`services.${id}.long`)) : t(`services.${id}.long`)
  return (<><PageHeader title={title} sub={short} />
    <Section><div className="max-w-3xl">
      <div className="w-14 h-14 rounded-lg bg-navy text-softgold grid place-items-center"><Icon name={s.icon} size={28} /></div>
      <h2 className="mt-6 text-2xl font-bold text-navy">{t('services.detailsTitle')}</h2>
      <p className="mt-3 leading-8 text-ink/80">{details}</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link to={`/client/requests?service=${id}`} className="btn btn-gold">{t('common.request')}</Link>
        <Link to={`/client/appointments?service=${id}`} className="btn btn-ghost">{t('common.book')}</Link>
        <Link to="/services" className="btn text-navy">{t('services.all')}</Link>
      </div></div></Section></>)
}
