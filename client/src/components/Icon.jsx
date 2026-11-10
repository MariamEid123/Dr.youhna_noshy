import { Calculator, FileText, Percent, Building2, FileSignature, Users, Scale, Briefcase, ShieldCheck, MessagesSquare, CalendarCheck, Layers, Circle } from 'lucide-react'
const map = { Calculator, FileText, Percent, Building2, FileSignature, Users, Scale, Briefcase, ShieldCheck, MessagesSquare, CalendarCheck, Layers }
export default function Icon({ name, ...p }) { const C = map[name] || Circle; return <C aria-hidden="true" {...p} /> }
