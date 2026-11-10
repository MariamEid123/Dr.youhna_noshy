import { useLang } from '../i18n/LanguageContext'
import { Section, PageHeader } from '../components/ui'
export default function About() {
  const { t } = useLang()
  const Block = ({ title, text }) => <div><h2 className="text-2xl font-bold text-navy">{title}</h2><div className="h-1 w-12 bg-gold my-2" /><p className="text-ink/80 leading-8">{text}</p></div>
  return (<>
    <PageHeader title={t('about.title')} />
    <Section><div className="grid gap-10 max-w-3xl">
      <Block title={t('about.introTitle')} text={t('about.intro')} />
      <Block title={t('about.visionTitle')} text={t('about.vision')} />
      <Block title={t('about.missionTitle')} text={t('about.mission')} />
      <div><h2 className="text-2xl font-bold text-navy">{t('about.valuesTitle')}</h2><div className="h-1 w-12 bg-gold my-2" />
        <ul className="flex flex-wrap gap-3 mt-3">{t('about.values').map((v) => <li key={v} className="border border-gold text-navy font-semibold rounded-full px-4 py-1">{v}</li>)}</ul></div>
      <Block title={t('about.expTitle')} text={t('about.exp')} />
    </div></Section>
  </>)
}
