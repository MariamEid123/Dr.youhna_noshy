import { Link } from 'react-router-dom'
import { useLang } from '../i18n/LanguageContext'
import { services, site } from '../config/site'
import { Section, Heading, ServiceCard } from '../components/ui'
import Icon from '../components/Icon'
import { useServices } from '../config/ServicesContext'
export default function Home() {
  const { t, lang } = useLang()
  const { services: serviceRows, configured, loading: servicesLoading, error: servicesError } = useServices()
  const visibleServices = configured && !servicesError
    ? serviceRows.map((row) => ({ id: row.code, icon: services.find((service) => service.id === row.code)?.icon || 'Briefcase' }))
    : services
  const why = t('home.why')
  return (<>
    <section className="bg-navy text-white">
      <div className="mx-auto max-w-6xl px-4 py-16 lg:py-24 grid lg:grid-cols-5 gap-10 items-center">
        <div className="lg:col-span-3">
          <h1 className="text-4xl lg:text-5xl font-extrabold leading-snug">{t('home.title')}</h1>
          <p className="mt-6 text-lg text-white/85 max-w-xl">{t('home.sub')}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/register" className="btn btn-gold">{t('nav.register')}</Link>
            <Link to="/login" className="btn btn-ghost-light">{t('nav.login')}</Link>
            <Link to="/services" className="btn btn-ghost-light">{t('home.explore')}</Link>
          </div>
          <div className="mt-4 flex flex-wrap gap-5 text-sm">
            <Link to="/client/appointments" className="text-softgold underline underline-offset-4">{t('common.book')}</Link>
            <Link to="/contact" className="text-softgold underline underline-offset-4">{t('nav.contact')}</Link>
          </div>
        </div>
        <div className="lg:col-span-2 justify-self-center">
          <div className="bg-white rounded-2xl p-6 border-4 border-gold/70"><img src="/logo.png" alt={t('brand')} className="w-64 max-w-full" /></div>
        </div>
      </div>
    </section>
    {site.stats.length > 0 && (
      <Section tone="paper"><div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
        {site.stats.map((s) => <div key={s.en}><div className="text-4xl font-extrabold text-navy">{s.value}</div><div className="text-ink/75">{s[lang]}</div></div>)}
      </div></Section>
    )}
    <Section tone="paper">
      <Heading title={t('home.servicesTitle')} sub={t('home.servicesSub')} />
      {servicesError && <p role="alert" className="mb-5 text-sm text-red-700">{t('services.loadError')}</p>}
      {servicesLoading ? <p className="text-center text-ink/60">{t('common.loading')}</p>
        : <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{visibleServices.map((service) => <ServiceCard key={service.id} {...service} />)}</div>}
    </Section>
    <Section>
      <Heading title={t('home.whyTitle')} />
      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {why.map(([icon, title, text]) => (
          <div key={title} className="border-s-4 border-gold ps-4">
            <Icon name={icon} className="text-gold" size={28} />
            <h3 className="mt-2 font-bold text-navy">{title}</h3><p className="mt-1 text-sm text-ink/75">{text}</p>
          </div>))}
      </div>
    </Section>
    <Section tone="navy">
      <div className="text-center max-w-2xl mx-auto">
        <h2 className="text-3xl font-extrabold">{t('home.ctaTitle')}</h2>
        <p className="mt-3 text-white/80">{t('home.ctaSub')}</p>
        <div className="mt-6 flex justify-center flex-wrap gap-3">
          <Link to="/register" className="btn btn-gold">{t('nav.register')}</Link>
          <Link to="/client/appointments" className="btn btn-ghost-light">{t('common.book')}</Link>
        </div>
      </div>
    </Section>
  </>)
}
