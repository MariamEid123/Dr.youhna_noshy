import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { useLang } from '../i18n/LanguageContext'
import { ShieldAlert } from 'lucide-react'

function NotAllowed({ msg }) {
  return (
    <div className="max-w-md mx-auto text-center py-16 px-4">
      <ShieldAlert className="mx-auto text-gold" size={48} />
      <h1 className="mt-4 text-2xl font-bold text-navy">{msg}</h1>
    </div>
  )
}

export function RequireClient({ children }) {
  const { isAuthed, isClient, loading } = useAuth()
  const { t } = useLang()
  const loc = useLocation()
  if (loading) return <div className="py-24 text-center text-ink/60">{t('common.loading')}</div>
  if (!isAuthed) return <Navigate to="/login" state={{ from: loc.pathname + loc.search }} replace />
  if (!isClient) return <NotAllowed msg={t('auth.notClientArea')} />
  return children
}

export function RequireAdmin({ children }) {
  const { isAuthed, isStaff, loading } = useAuth()
  const { t } = useLang()
  const loc = useLocation()
  if (loading) return <div className="py-24 text-center text-ink/60">{t('common.loading')}</div>
  if (!isAuthed) return <Navigate to="/admin/login" state={{ from: loc.pathname }} replace />
  if (!isStaff) return <NotAllowed msg={t('auth.notAdminArea')} />
  return children
}

export function RequireSuperAdmin({ children }) {
  const { isAuthed, isSuperAdmin, loading } = useAuth()
  const { t } = useLang()
  const loc = useLocation()
  if (loading) return <div className="py-24 text-center text-ink/60">{t('common.loading')}</div>
  if (!isAuthed) return <Navigate to="/admin/login" state={{ from: loc.pathname }} replace />
  if (!isSuperAdmin) return <NotAllowed msg={t('auth.superOnly')} />
  return children
}

export function RequireOfficeAdmin({ children }) {
  const { isAuthed, isAdminLevel, loading } = useAuth()
  const { t } = useLang()
  const loc = useLocation()
  if (loading) return <div className="py-24 text-center text-ink/60">{t('common.loading')}</div>
  if (!isAuthed) return <Navigate to="/admin/login" state={{ from: loc.pathname }} replace />
  if (!isAdminLevel) return <NotAllowed msg={t('workspace.restricted')} />
  return children
}
