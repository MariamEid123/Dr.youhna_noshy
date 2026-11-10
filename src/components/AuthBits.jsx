import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'

export const Alert = ({ kind, children }) => (
  <div role="alert" className={`flex items-start gap-2 rounded-lg p-3 text-sm border ${kind === 'error'
    ? 'bg-red-50 border-red-200 text-red-800'
    : 'bg-green-50 border-green-200 text-green-800'}`}>
    {kind === 'error'
      ? <AlertCircle size={18} className="shrink-0 mt-0.5" />
      : <CheckCircle2 size={18} className="shrink-0 mt-0.5" />}
    <span>{children}</span>
  </div>
)

export const Spinner = () => (
  <span className="inline-flex items-center gap-2">
    <Loader2 size={18} className="animate-spin" />
  </span>
)

export const SubmitBtn = ({ busy, children, className = 'btn btn-gold w-full' }) => (
  <button type="submit" disabled={busy} className={className}>
    {busy ? <><Loader2 size={18} className="animate-spin" />…</> : children}
  </button>
)

export const Err = ({ t, ekey }) => (ekey ? <Alert kind="error">{t(`auth.errors.${ekey}`)}</Alert> : null)
