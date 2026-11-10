import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useLang } from '../../i18n/LanguageContext'
import { Alert } from '../../components/AuthBits'
import { Search, ShieldCheck, UserCog } from 'lucide-react'
import { useAuth } from '../../auth/AuthContext'

const ROLES = ['client', 'staff', 'office_admin', 'super_admin']

export default function StaffManagement() {
  const { t } = useLang()
  const { user } = useAuth()
  const [rows, setRows] = useState([])
  const [q, setQ] = useState('')
  const [err, setErr] = useState(null)
  const [okMsg, setOkMsg] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone, company_name, role, is_active, created_at')
      .order('created_at', { ascending: false })
    if (error) setErr('loadFailed')
    else { setRows(data); setErr(null) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const changeRole = async (id, role, name) => {
    if (!window.confirm(t('adminArea.confirmRole', { name, role: t(`roles.${role}`) }))) return
    setErr(null); setOkMsg(null)
    const { error } = await supabase.from('profiles').update({ role }).eq('id', id)
    if (error) {
      setErr(error.message.includes('ROLE_CHANGE_FORBIDDEN') ? 'roleChangeForbidden' : 'loadFailed')
      return
    }
    setOkMsg(t('adminArea.roleChanged'))
    load()
  }

  const toggleActive = async (id, next) => {
    if (!window.confirm(next ? t('adminArea.confirmActivate') : t('adminArea.confirmDeactivate'))) return
    setErr(null); setOkMsg(null)
    const { error } = await supabase.from('profiles').update({ is_active: next }).eq('id', id)
    if (error) { setErr('loadFailed'); return }
    setOkMsg(next ? t('adminArea.userActivated') : t('adminArea.userDeactivated'))
    load()
  }

  const filtered = rows.filter((r) =>
    (r.full_name.toLowerCase().includes(q.toLowerCase()) || (r.email || '').toLowerCase().includes(q.toLowerCase()) || r.phone.includes(q))
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-navy flex items-center gap-2"><ShieldCheck className="text-gold" size={26} />{t('adminArea.staff')}</h1>
        <p className="mt-1 text-ink/70 text-sm">{t('adminArea.staffSub')}</p>
      </div>
      <div className="bg-white rounded-xl border border-navy/10 shadow-sm p-5">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={18} className="absolute top-1/2 -translate-y-1/2 start-3 text-ink/40" />
            <input className="field ps-10" placeholder={t('adminArea.searchClients')}
              value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('common.searchNamePhone')} />
          </div>
        </div>
        <div className="mt-4 rounded-lg bg-paper border border-navy/10 p-3 text-sm text-ink/75">
          {t('adminArea.promoteHow')}
        </div>
        {err && <div className="mt-3"><Alert kind="error">{t(`adminArea.errors.${err}`)}</Alert></div>}
        {okMsg && <div className="mt-3"><Alert kind="success">{okMsg}</Alert></div>}
        {loading ? (
          <p className="mt-4 text-ink/50 text-center py-6">{t('common.loading')}</p>
        ) : filtered.length === 0 ? (
          <p className="mt-4 text-ink/50 text-center py-6">{t('adminArea.noStaffYet')}</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="text-start text-navy border-b border-navy/10">
                  <th className="p-2 text-start font-bold">{t('auth.fullName')}</th>
                  <th className="p-2 text-start font-bold">{t('auth.email')}</th>
                  <th className="p-2 text-start font-bold">{t('auth.phone')}</th>
                  <th className="p-2 text-start font-bold">{t('clientArea.role')}</th>
                  <th className="p-2 text-start font-bold">{t('adminArea.status')}</th>
                  <th className="p-2 text-start font-bold">{t('adminArea.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b border-navy/5">
                    <td className="p-2 font-semibold text-navy">{r.full_name || '—'}</td>
                    <td className="p-2" dir="ltr">{r.email || '—'}</td>
                    <td className="p-2" dir="ltr">{r.phone || '—'}</td>
                    <td className="p-2">
                      <select className="field !py-1 !px-2 text-sm" value={r.role} disabled={r.id === user?.id && r.role === 'super_admin'}
                        onChange={(e) => changeRole(r.id, e.target.value, r.full_name)}
                        aria-label={t('adminArea.changeRoleFor', { name: r.full_name })}>
                        {ROLES.map((role) => <option key={role} value={role}>{t(`roles.${role}`)}</option>)}
                      </select>
                    </td>
                    <td className="p-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${r.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {r.is_active ? t('adminArea.active') : t('adminArea.inactive')}
                      </span>
                    </td>
                    <td className="p-2">
                      <button className="btn btn-ghost !py-1 !px-3 text-xs" disabled={r.id === user?.id} onClick={() => toggleActive(r.id, !r.is_active)}>
                        {r.is_active ? t('adminArea.deactivate') : t('adminArea.activate')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
