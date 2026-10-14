import React, { useEffect, useRef, useState, createContext, useContext } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { api, download, downloadInvoice, getProfile } from './api.js';
import { supabase } from './lib/supabaseClient.js';
import './index.css';
import './brand.css';

const Auth = createContext(); const useAuth = () => useContext(Auth);
const STAFF_ROLES = ['super_admin', 'accountant', 'receptionist'];
const STATUS = { pending: ['قيد المراجعة', 'bg-brass/15 text-brass'], in_progress: ['قيد التنفيذ', 'bg-teal-soft text-teal'], waiting_client: ['بانتظار العميل', 'bg-orange-100 text-orange-700'], completed: ['مكتمل', 'bg-green-100 text-green-700'], rejected: ['مرفوض', 'bg-red-100 text-red-700'], unpaid: ['غير مدفوعة', 'bg-brass/15 text-brass'], paid: ['مدفوعة', 'bg-green-100 text-green-700'], overdue: ['متأخرة', 'bg-red-100 text-red-700'], cancelled: ['ملغاة', 'bg-ink/10 text-ink/70'] };
const Badge = ({ s }) => <span className={`badge ${STATUS[s]?.[1]}`}>{STATUS[s]?.[0]}</span>;
const STAGES = ['استلام المستندات', 'مراجعة المستندات', 'جارٍ التنفيذ', 'اكتمال الطلب'];
const Tracker = ({ stage }) => (
  <ol className="flex items-start gap-2">{STAGES.map((l, i) => <li key={l} className="flex-1 text-center text-sm">
    <div className={`mx-auto mb-1 h-2 rounded-full ${i <= stage ? 'bg-teal' : 'bg-ink/10'}`} /><span className={i <= stage ? 'font-medium' : 'text-ink/50'}>{l}</span></li>)}</ol>);

function Shell({ children }) {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const portalPath = user?.role === 'client' ? '/portal' : '/admin';
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (<>
    <header className={`site-header${menuOpen ? ' menu-open' : ''}${scrolled ? ' scrolled' : ''}`}>
      <div className="topbar"><div className="container topbar-content">
        <span className="topbar-tagline">شريكك في النمو واتخاذ القرار</span>
        <div className="topbar-contacts"><span className="topbar-location">⌖ بورسعيد، مصر</span><a href="tel:0663263849">☎ 0663263849</a><a href="tel:01288253589">☎ 01288253589</a><a href="tel:01221559019">☎ 01221559019</a></div>
      </div></div>
      <nav className="navbar container" aria-label="التنقل الرئيسي">
        <Link to="/" className="brand" aria-label="Y GROUP - الرئيسية" onClick={() => setMenuOpen(false)}><img className="brand-logo" src="/assets/y-group-logo.png" alt="Y GROUP للمحاسبة والمراجعة والأعمال القانونية" /></Link>
        <button className="menu-toggle" type="button" aria-expanded={menuOpen} aria-label={menuOpen ? 'إغلاق القائمة' : 'فتح القائمة'} onClick={() => setMenuOpen(!menuOpen)}><span /><span /><span /></button>
        <div className={`nav-links${menuOpen ? ' open' : ''}`}>
          {[['/', 'الرئيسية'], ['/about', 'من نحن'], ['/services', 'خدماتنا'], [user ? portalPath : '/login', 'بوابة العملاء'], ['/contact', 'تواصل معنا']].map(([to, label]) => <Link key={to} to={to} onClick={() => setMenuOpen(false)}>{label}</Link>)}
        </div>
        <div className="nav-actions">
          {user
            ? <><Link className="button button-navy button-small" to={portalPath}>لوحة التحكم</Link><button className="button button-outline-dark button-small" onClick={logout}>خروج</button></>
            : <><Link className="button button-navy button-small" to="/login">دخول العملاء</Link><Link className="button button-gold button-small" to="/contact">تواصل معنا</Link></>}
        </div>
      </nav>
    </header>
    <main>{children}</main>
    <footer className="site-footer"><div className="container footer-main">
      <div className="footer-brand"><Link to="/" className="footer-logo"><img src="/assets/y-group-logo.png" alt="Y GROUP للمحاسبة والمراجعة والأعمال القانونية" /></Link><p>خدمات محاسبية وضريبية مهنية تساعد أعمالك على التقدم بثقة.</p><a href="https://www.facebook.com/DrYohanaNosshyAttia" target="_blank" rel="noreferrer">Y GROUP على فيسبوك ↗</a></div>
      <div className="footer-column"><h2>روابط سريعة</h2><Link to="/about">من نحن</Link><Link to="/services">خدماتنا</Link><Link to="/contact">تواصل معنا</Link></div>
      <div className="footer-column"><h2>بوابة العملاء</h2><Link to="/signup">إنشاء حساب عميل</Link><Link to="/login">دخول العملاء</Link><Link to="/admin/login">دخول فريق المكتب</Link></div>
      <div className="footer-column"><h2>تواصل معنا</h2><span>بورسعيد، مصر</span><a href="tel:0663263849">0663263849</a><a href="tel:01288253589">01288253589</a><a href="tel:01221559019">01221559019</a></div>
    </div><div className="footer-bottom"><div className="container"><span>© Y GROUP. جميع الحقوق محفوظة.</span><Link to="/">العودة للرئيسية ↑</Link></div></div></footer></>);
}

const SERVICES = [
  ['الخدمات المحاسبية', 'إعداد وتنظيم الحسابات والتقارير الدورية.'],
  ['الخدمات الضريبية', 'إعداد الإقرارات ومتابعة الالتزامات الضريبية.'],
  ['القوائم المالية', 'إعداد قوائم مالية واضحة لدعم قراراتك.'],
  ['مسك الدفاتر', 'تسجيل منظم لحركة النشاط ومراجعته باستمرار.'],
  ['خدمات الرواتب', 'إدارة الرواتب والالتزامات المرتبطة بها.'],
  ['تأسيس الشركات', 'المساعدة في إجراءات تأسيس الشركات وتسجيلها.'],
  ['الاستشارات المالية', 'تحليل مالي يساعدك على التخطيط بثقة.'],
  ['الاستشارات الضريبية', 'إجابات عملية عن المسائل والقرارات الضريبية.'],
];
function Home() {
  return (<>
    <section className="home-hero">
      <div className="home-hero-inner">
        <div className="home-hero-copy"><p className="eyebrow">شريكك المهني في إدارة أعمالك المالية</p><h1>حلول محاسبية وضريبية<br />تصنع <em>الفرق</em> في أعمالك</h1>
          <p>نساعد أصحاب الأعمال والشركات على إدارة التزاماتهم المالية والضريبية بكفاءة ووضوح، لاتخاذ قرارات أفضل وبناء مستقبل أعمال أكثر استقرارًا.</p>
          <div className="hero-actions"><Link to="/login" className="button button-outline">دخول العملاء <span>♙</span></Link><Link to="/contact" className="button button-gold">تواصل معنا <span>☎</span></Link></div>
        </div>
        <div className="home-hero-image" role="img" aria-label="أدوات وتقارير مالية ومحاسبية" />
      </div>
    </section>
    <section className="trust-strip"><div className="container trust-items">{[['◎', 'حلول متخصصة', 'نقدم حلولًا تناسب طبيعة كل نشاط تجاري'], ['♙', 'الخبرة والكفاءة', 'فريق متخصص في مجالات عملنا'], ['♧', 'سرية وأمان', 'نتعامل مع بياناتك بسرية وأمان'], ['◇', 'الالتزام والشفافية', 'نلتزم بمعايير مهنية واضحة']].map(([icon, title, text]) => <div className="trust-item" key={title}><span className="trust-icon">{icon}</span><span><b>{title}</b><small>{text}</small></span></div>)}</div></section>
    <section className="home-services container" id="services"><div className="section-title"><span>خدماتنا</span><h2>حلول محاسبية وضريبية متكاملة</h2><p>مجموعة متكاملة من الخدمات لمساعدة أعمالك على النمو</p></div><ServiceGrid limit={6} /></section>
    <section className="home-portal container" id="client-portal"><div><span className="eyebrow">بوابة العملاء</span><h2>مكتبك معك أينما كنت</h2><p>أنشئ حسابك لمتابعة طلباتك، ومستنداتك، وفواتيرك من مكان واحد.</p></div><div className="portal-actions"><Link className="button button-navy" to="/login">دخول العملاء ↗</Link><Link className="button button-gold" to="/signup">إنشاء حساب جديد</Link></div></section>
    <section className="home-about"><div className="container home-about-inner"><div><span className="eyebrow">عن Y GROUP</span><h2>شريكك الموثوق<br />في المحاسبة والضرائب</h2><p>نقدم خدمات المحاسبة والمراجعة والضرائب والأعمال القانونية مع اهتمام بالتفاصيل والسرية ووضوح التواصل.</p><Link to="/about" className="text-link">اعرف المزيد عن المكتب ←</Link></div><img src="/assets/y-group-logo.png" alt="الشعار الرسمي لواي جروب" /></div></section>
    <section className="home-cta"><div className="container"><div><span className="eyebrow">لنتحدث عن احتياجك</span><h2>هل تبحث عن شريك موثوق لإدارة أعمالك المالية؟</h2><p>تواصل معنا أو ابدأ باستخدام بوابة العملاء.</p></div><div className="cta-actions"><Link to="/contact" className="button button-gold">تواصل معنا</Link><Link to="/signup" className="button button-outline">إنشاء حساب عميل</Link></div></div></section>
  </>);
}
const ServiceIcon = ({ index }) => {
  const paths = [
    <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 7h8M8 11h1m3 0h1m3 0h.01M8 15h1m3 0h1m3 0h.01M8 18h1m3 0h1" /></>,
    <><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5M9 12h7m-7 3h7m-7 3h4" /></>,
    <><path d="M5 3h14v18H5zM8 7h8m-8 4h8m-8 4h4" /><path d="m14 17 2 2 4-5" /></>,
    <><circle cx="9" cy="7" r="3" /><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5v1" /></>,
    <><path d="M4 21V4h16v17M2 21h20M8 21v-5h8v5M8 8h2m4 0h2m-8 4h2m4 0h2" /></>,
    <><path d="M12 3v17M5 6h14M4 6l-3 7h6L4 6Zm16 0-3 7h6l-3-7ZM8 21h8" /><path d="M2 13a3 3 0 0 0 6 0m8 0a3 3 0 0 0 6 0" /></>,
  ];
  return <svg className="service-icon-svg" viewBox="0 0 24 24" aria-hidden="true">{paths[index % paths.length]}</svg>;
};
const ServiceGrid = ({ limit = SERVICES.length }) => {
  const { user } = useAuth();
  const destination = user ? (user.role === 'client' ? '/portal' : '/admin') : '/signup';
  return <div className="service-grid">{SERVICES.slice(0, limit).map(([name, description], index) => <article key={name} className="service-card"><ServiceIcon index={index} /><h3>{name}</h3><p>{description}</p><Link to={destination} aria-label={`${user ? 'الانتقال إلى لوحة التحكم' : 'إنشاء حساب وطلب'} ${name}`} className="service-link">{user ? 'الانتقال إلى حسابك' : 'اطلب الخدمة'} ←</Link></article>)}</div>;
};
const Page = ({ title, children }) => <section className="page-shell container"><p className="eyebrow">Y GROUP · بورسعيد، مصر</p><h1 className="page-title">{title}</h1>{children}</section>;

const authErrorMessage = (operation, error) => {
  const code = typeof error?.code === 'string' ? error.code : '';
  const status = Number.isInteger(error?.status) ? error.status : undefined;
  const networkFailure = error instanceof TypeError
    || error?.name === 'AuthRetryableFetchError'
    || status === 0;
  const details = {
    category: networkFailure ? 'network' : (code || error?.name || 'unknown'),
    ...(status === undefined ? {} : { status }),
  };
  console.error(`Supabase ${operation} failed.`, details);

  if (networkFailure) return 'تعذر الاتصال بخدمة تسجيل الدخول. تحقق من اتصال الإنترنت وإعداد عنوان Supabase.';
  if (code === 'signup_disabled') return 'إنشاء الحسابات متوقف في إعدادات Supabase Auth.';
  if (code === 'email_address_invalid') return 'صيغة البريد الإلكتروني غير صحيحة.';
  if (code === 'weak_password') return 'كلمة المرور لا تستوفي متطلبات الأمان في Supabase.';
  if (code === 'user_already_exists' || code === 'email_exists') return 'هذا البريد مسجل بالفعل. جرّبي تسجيل الدخول أو استعادة كلمة المرور.';
  if (code === 'email_not_confirmed') return 'يجب تأكيد البريد الإلكتروني قبل تسجيل الدخول.';
  if (code === 'invalid_credentials') return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
  if (code === 'over_email_send_rate_limit' || status === 429) return 'تم تجاوز حد المحاولات مؤقتًا. انتظري قليلًا ثم حاولي مرة أخرى.';
  if (status >= 500) return 'تعذر إكمال العملية بسبب خطأ في خدمة Supabase. راجعي سجلات Auth للمشروع.';
  if (operation === 'sign-up' || operation === 'signup') return 'تعذر إنشاء الحساب. راجعي إعدادات Supabase Auth وسجلات المشروع.';
  if (operation === 'sign-in') return 'تعذر تسجيل الدخول. تحققي من بيانات الحساب وتأكيد البريد.';
  return 'تعذر إكمال الطلب. تحققي من إعدادات البريد ورابط إعادة التعيين.';
};

function AuthForm({ mode, staffOnly = false }) {
  const nav = useNavigate(); const { setUser } = useAuth(); const [f, setF] = useState({}); const [err, setErr] = useState(''); const [notice, setNotice] = useState(''); const [submitting, setSubmitting] = useState(false); const submissionLock = useRef(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setNotice('');
    if (submissionLock.current) return;
    submissionLock.current = true;
    setSubmitting(true);
    try {
      const email = typeof f.email === 'string' ? f.email.trim().toLowerCase() : '';
      if (mode === 'signup') {
        const fullName = typeof f.name === 'string' ? f.name.trim() : '';
        const password = typeof f.password === 'string' ? f.password : '';
        if (fullName.length < 2 || fullName.length > 120) {
          throw new Error('اكتبي الاسم كاملًا (من حرفين إلى 120 حرفًا).');
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          throw new Error('أدخلي بريدًا إلكترونيًا صحيحًا.');
        }
        if (password.length < 8 || password.length > 128) {
          throw new Error('يجب أن تتكون كلمة المرور من 8 أحرف على الأقل.');
        }
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName, phone: f.phone?.trim() || null, company_name: f.company?.trim() || null } },
        });
        if (error) throw new Error(authErrorMessage('sign-up', error));
        if (!data.user) throw new Error('لم تُرجع خدمة Supabase حسابًا بعد التسجيل. راجعي سجلات Auth للمشروع.');
        if (!data.session) {
          if (Array.isArray(data.user.identities) && data.user.identities.length === 0) {
            setNotice('تعذر تأكيد إنشاء حساب جديد من الاستجابة. إذا كان لديك حساب بهذا البريد، سجّلي الدخول أو استخدمي استعادة كلمة المرور.');
          } else {
            setNotice('استقبل Supabase طلب التسجيل ولم يُصدر جلسة دخول. إذا كان تأكيد البريد مطلوبًا، افحصي بريدك ورابط إعادة التوجيه.');
          }
          return;
        }
        let profile;
        try {
          profile = await getProfile(data.user);
        } catch {
          setNotice('أنشأ Supabase مستخدم Auth وأصدر جلسة، لكن تعذر تحميل ملف التطبيق. لم يُحذف الحساب؛ راجعي سجلات المتصفح لمعرفة خطأ profiles أو RLS.');
          return;
        }
        setUser(profile);
        nav(profile.role === 'client' ? '/portal' : '/admin');
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !f.password) {
        throw new Error('أدخلي البريد الإلكتروني وكلمة المرور.');
      }
      const { data, error } = await supabase.auth.signInWithPassword({ email, password: f.password });
      if (error) throw new Error(authErrorMessage('sign-in', error));
      if (!data.user) throw new Error('لم تُرجع خدمة Supabase مستخدمًا صالحًا لتسجيل الدخول.');
      let profile;
      try {
        profile = await getProfile(data.user);
      } catch {
        setNotice('تم التحقق من بيانات الدخول في Supabase، لكن تعذر تحميل ملف التطبيق. لم يتم منح صلاحية أو إنشاء بروفايل تلقائيًا؛ راجعي سجلات المتصفح ومخطط profiles.');
        return;
      }
      if (staffOnly && !STAFF_ROLES.includes(profile.role)) {
        const { error: signOutError } = await supabase.auth.signOut();
        if (signOutError) throw new Error(authErrorMessage('sign-out', signOutError));
        setErr('هذا الرابط مخصص لفريق المكتب. استخدم دخول العملاء.');
        return;
      }
      setUser(profile);
      nav(profile.role === 'client' ? '/portal' : '/admin');
    } catch (x) {
      setErr(x.message || 'تعذر إتمام تسجيل الدخول.');
    } finally {
      submissionLock.current = false;
      setSubmitting(false);
    }
  };
  return (<Page title={staffOnly ? 'دخول فريق المكتب' : mode === 'login' ? 'دخول العملاء' : 'إنشاء حساب عميل'}><div className="auth-layout"><div className="auth-intro"><span className="eyebrow">بوابة Y GROUP</span><h2>{staffOnly ? 'مساحة عمل فريق المكتب' : mode === 'login' ? 'أهلًا بعودتك' : 'ابدأ حسابك معنا'}</h2><p>{staffOnly ? 'يسجّل الدخول من هنا فريق المكتب بحسابات الإدارة التي أُنشئت مسبقًا.' : mode === 'login' ? 'سجّل الدخول لمتابعة الطلبات والمستندات والفواتير.' : 'أنشئ حسابًا خاصًا بك لمتابعة خدماتك وطلباتك إلكترونيًا.'}</p></div><form onSubmit={submit} className="card auth-card">
    {mode === 'signup' && <><label>الاسم الكامل<input className="input" autoComplete="name" placeholder="الاسم الكامل" minLength={2} maxLength={120} required onChange={set('name')} /></label><label>رقم الهاتف<input className="input" autoComplete="tel" placeholder="رقم الهاتف" onChange={set('phone')} /></label><label>الشركة (اختياري)<input className="input" autoComplete="organization" placeholder="اسم الشركة" onChange={set('company')} /></label></>}
    <label>البريد الإلكتروني<input className="input" type="email" autoComplete="email" placeholder="name@example.com" required onChange={set('email')} /></label>
    <label>كلمة المرور<input className="input" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'signup' ? 8 : 1} maxLength={128} placeholder={mode === 'signup' ? '8 أحرف على الأقل' : 'كلمة المرور'} required onChange={set('password')} /></label>
    {err && <p role="alert" className="form-error">{err}</p>}{notice && <p role="status" className="text-teal">{notice}</p>}<button className="button button-navy auth-submit" disabled={submitting}>{submitting ? 'جارٍ التحقق...' : mode === 'login' ? 'تسجيل الدخول' : 'إنشاء حساب عميل'}</button>{mode === 'login' && <Link to="/forgot" className="auth-link">نسيت كلمة المرور؟</Link>}
    {mode === 'login' && !staffOnly && <p className="auth-switch">تعمل في المكتب؟ <Link to="/admin/login">دخول فريق المكتب</Link></p>}
    {mode === 'login' && staffOnly && <p className="auth-switch">عميل؟ <Link to="/login">دخول العملاء</Link></p>}
    {mode === 'signup' && <p className="auth-switch">لديك حساب بالفعل؟ <Link to="/login">سجّل الدخول</Link></p>}
  </form></div></Page>);
}

const Stat = ({ l, v }) => <div className="card"><div className="text-3xl font-bold">{v ?? '—'}</div><div className="text-ink/60">{l}</div></div>;
function Portal() {
  const { user } = useAuth(); const [d, setD] = useState({ requests: [], documents: [], invoices: [], required: [], services: [], notes: [], appointments: [] }); const [f, setF] = useState({}); const [msg, setMsg] = useState('');
  const load = async () => { const [requests, documents, invoices, required, services, notes, appointments] = await Promise.all(['/requests', '/documents', '/invoices', '/required-docs', '/services', '/notifications', '/appointments'].map((p) => api(p))); setD({ requests, documents, invoices, required, services, notes, appointments }); };
  useEffect(() => { load(); }, []);
  const create = async (e) => { e.preventDefault(); try { await api('/requests', { method: 'POST', body: f }); setMsg('تم إرسال طلبك'); e.target.reset(); load(); } catch (x) { setMsg(x.message); } };
  const up = async (e, requiredId) => { const fd = new FormData(); fd.append('file', e.target.files[0]); if (requiredId) fd.append('requiredId', requiredId); try { const uploaded = await api('/documents', { method: 'POST', form: fd }); setMsg(uploaded.warning || 'تم رفع المستند بنجاح.'); load(); } catch (x) { setMsg(x.message); } };
  const active = d.requests.filter((r) => ['pending', 'in_progress', 'waiting_client'].includes(r.status)).length;
  return (<Page title={`أهلاً ${user.name}`}><PortalNav /><div className="grid gap-4 sm:grid-cols-3"><Stat l="طلبات نشطة" v={active} /><Stat l="مستندات متاحة" v={d.documents.filter((x) => x.direction === 'from_office').length} /><Stat l="فواتير مستحقة" v={d.invoices.filter((i) => i.status !== 'paid').length} /></div>
    {msg && <p role="status" className="mt-4 text-teal">{msg}</p>}
    <div className="mt-8 grid gap-6 lg:grid-cols-3"><div className="space-y-4 lg:col-span-2"><h2 className="text-xl font-bold">طلباتي</h2>
      {d.requests.length === 0 && <p className="card text-ink/60">لا توجد طلبات بعد. ابدأ بطلب أول خدمة من النموذج المجاور.</p>}
      {d.requests.map((r) => <div key={r._id} className="card"><div className="mb-3 flex justify-between"><b>#{r.code} — {r.service?.name}</b><Badge s={r.status} /></div><Tracker stage={r.stage} /></div>)}
      <h2 className="pt-4 text-xl font-bold">المستندات</h2>
      {d.required.length > 0 && <div className="card border-brass/40"><b>مستندات مطلوبة منك</b>{d.required.map((r) => <label key={r._id} className="mt-3 flex items-center justify-between gap-3"><span>{r.title}</span><input type="file" onChange={(e) => up(e, r._id)} /></label>)}</div>}
      <div className="card divide-y divide-ink/10">{d.documents.map((x) => <div key={x._id} className="flex items-center justify-between py-2"><span>{x.name}<small className="block text-ink/50">{new Date(x.createdAt).toLocaleDateString('ar-EG')}</small></span><span className="flex items-center gap-3"><Badge s={x.status === 'ready' ? 'completed' : 'pending'} /><button className="text-teal underline" onClick={() => download(x._id, x.name).catch((e) => setMsg(e.message))}>تحميل</button></span></div>)}
        <label className="block pt-3">رفع مستند جديد (PDF أو صورة أو Word/Excel، حتى 10MB)<input type="file" accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx" className="mt-2 block" onChange={up} /></label></div>
      <h2 className="pt-4 text-xl font-bold">الفواتير</h2>
      <div className="card divide-y divide-ink/10">{d.invoices.length === 0 && <p className="text-ink/60">لا توجد فواتير.</p>}{d.invoices.map((i) => <div key={i._id} className="flex flex-wrap justify-between gap-2 py-2"><span>#{i.number} — {i.service}</span><span className="flex items-center gap-2">{i.amount} ج.م <Badge s={i.status} /><button className="text-teal underline" onClick={() => downloadInvoice(i)}>تنزيل الفاتورة</button></span></div>)}</div></div>
      <aside className="space-y-4"><form onSubmit={create} className="card space-y-3"><h2 className="font-bold">طلب خدمة جديدة</h2>
        <select className="input" required onChange={(e) => setF({ ...f, service: e.target.value })}><option value="">اختر الخدمة</option>{d.services.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}</select>
        <textarea className="input" rows="4" required minLength="5" placeholder="اشرح ما تحتاجه" onChange={(e) => setF({ ...f, description: e.target.value })} /><button className="btn-primary w-full">إرسال الطلب</button></form>
        <div className="card"><h2 className="mb-2 font-bold">المواعيد القادمة</h2>{d.appointments.filter((a) => a.status === 'booked' && new Date(a.start) >= new Date()).slice(0, 4).map((a) => <p key={a._id} className="border-b border-ink/10 py-2 text-sm">{a.service?.name} — {fd(a.start)}</p>)}{d.appointments.every((a) => a.status !== 'booked' || new Date(a.start) < new Date()) && <p className="text-sm text-ink/60">لا توجد مواعيد قادمة.</p>}<Link to="/portal/appointments" className="mt-3 inline-block text-teal underline">إدارة المواعيد</Link></div>
        <div className="card"><h2 className="mb-2 font-bold">آخر الإشعارات</h2>{d.notes.slice(0, 6).map((n) => <p key={n._id} className="border-b border-ink/10 py-2 text-sm">{n.text}</p>)}</div></aside></div></Page>);
}

function Admin() {
  const { user } = useAuth(); const isReceptionist = user.role === 'receptionist';
  const [s, setS] = useState(); const [reqs, setReqs] = useState([]); const [clients, setClients] = useState([]); const [services, setServices] = useState([]); const [q, setQ] = useState(''); const [requestSearch, setRequestSearch] = useState(''); const [requestStatus, setRequestStatus] = useState(''); const [requestService, setRequestService] = useState(''); const [staffMsg, setStaffMsg] = useState('');
  const load = () => {
    if (!isReceptionist) {
      api('/admin/stats').then(setS);
      const filters = new URLSearchParams();
      if (requestStatus) filters.set('status', requestStatus);
      if (requestService) filters.set('service', requestService);
      api('/requests' + (filters.size ? '?' + filters : '')).then(setReqs);
    }
    api('/admin/clients?search=' + q).then(setClients);
    api('/services').then(setServices);
  };
  useEffect(load, [q, requestStatus, requestService]);
  const upd = async (id, body) => { await api('/requests/' + id, { method: 'PATCH', body }); load(); };
  const max = Math.max(1, ...(s?.monthly.map((m) => m.n) || [1]));
  const visibleReqs = reqs.filter((r) => !requestSearch || [r.code, r.client?.name, r.service?.name, r.description].some((v) => v?.toLowerCase().includes(requestSearch.toLowerCase())));
  return (<Page title="لوحة إدارة المكتب"><AdminNav />{!isReceptionist && <div className="grid grid-cols-2 gap-4 md:grid-cols-4">{s && [['العملاء', s.clients], ['طلبات نشطة', s.activeRequests], ['طلبات جديدة', s.pendingRequests], ['طلبات مكتملة', s.completedRequests], ['المستندات', s.documents], ['مستندات مطلوبة', s.pendingDocuments], ['فواتير غير مسددة', s.unpaidInvoices], ['مواعيد قادمة', s.upcomingAppointments]].map(([l, v]) => <Stat key={l} l={l} v={v} />)}</div>}
    {!isReceptionist && s && <div className="card mt-6"><b>الطلبات شهريًا</b><div className="mt-4 flex h-32 items-end gap-2">{s.monthly.map((m) => <div key={m._id} className="flex-1 text-center text-xs"><div className="rounded-t bg-teal" style={{ height: `${(m.n / max) * 100}%` }} />{m._id.slice(5)}</div>)}</div></div>}
    {!isReceptionist && <><h2 className="mb-3 mt-8 text-xl font-bold">الطلبات</h2><div className="mb-3 grid gap-2 sm:grid-cols-3"><input className="input" value={requestSearch} onChange={(e) => setRequestSearch(e.target.value)} placeholder="ابحث بالرقم أو العميل أو الوصف" /><select className="input" value={requestStatus} onChange={(e) => setRequestStatus(e.target.value)}><option value="">كل الحالات</option>{Object.keys(STATUS).slice(0, 5).map((k) => <option key={k} value={k}>{STATUS[k][0]}</option>)}</select><select className="input" value={requestService} onChange={(e) => setRequestService(e.target.value)}><option value="">كل الخدمات</option>{services.map((service) => <option key={service._id} value={service._id}>{service.name}</option>)}</select></div><div className="card overflow-x-auto"><table className="w-full text-start"><tbody>{visibleReqs.map((r) => <tr key={r._id} className="border-b border-ink/10"><td className="py-2">#{r.code}</td><td>{r.client?.name}</td><td>{r.service?.name}</td><td><select className="input" value={r.status} onChange={(e) => upd(r._id, { status: e.target.value })}>{Object.keys(STATUS).slice(0, 5).map((k) => <option key={k} value={k}>{STATUS[k][0]}</option>)}</select></td><td><select className="input" value={r.stage} onChange={(e) => upd(r._id, { stage: +e.target.value })}>{STAGES.map((l, i) => <option key={l} value={i}>{l}</option>)}</select></td><td><Link className="text-teal underline" to={`/admin/clients/${r.client?._id}`}>فتح العميل</Link></td></tr>)}</tbody></table>{visibleReqs.length === 0 && <p className="text-ink/60">لا توجد طلبات مطابقة.</p>}</div></>}
    <h2 className="mb-3 mt-8 text-xl font-bold">العملاء</h2><input className="input mb-3 max-w-sm" placeholder="ابحث بالاسم أو البريد أو الشركة" onChange={(e) => setQ(e.target.value)} />
    <div className="card divide-y divide-ink/10">{clients.map((c) => <Link key={c._id} to={`/admin/clients/${c._id}`} className="flex justify-between py-2 hover:bg-teal-soft"><b>{c.name}</b><span className="text-ink/60">{c.company} {c.phone} {c.email}</span></Link>)}</div>
    {user.role === 'super_admin' && <form className="card mt-8 grid gap-3 sm:grid-cols-2" onSubmit={async (e) => { e.preventDefault(); setStaffMsg(''); try { await api('/admin/staff', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); setStaffMsg('تم إنشاء حساب الموظف'); e.target.reset(); } catch (x) { setStaffMsg(x.message); } }}>
      <h2 className="text-xl font-bold sm:col-span-2">إضافة موظف</h2><input name="name" required minLength="2" className="input" placeholder="الاسم الكامل" /><input name="email" type="email" required className="input" placeholder="البريد الإلكتروني" /><input name="password" type="password" required minLength="12" className="input" placeholder="كلمة المرور (12 حرفًا على الأقل)" /><select name="role" className="input"><option value="accountant">محاسب</option><option value="receptionist">استقبال</option></select><button className="btn-primary sm:col-span-2">إنشاء حساب موظف</button>{staffMsg && <p role="status" className="sm:col-span-2">{staffMsg}</p>}
    </form>}</Page>);
}

const fd = (d) => new Date(d).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });
const PortalNav = () => <div className="mb-6 flex flex-wrap gap-2">{[['/portal', 'الرئيسية'], ['/portal/appointments', 'المواعيد'], ['/portal/messages', 'الرسائل'], ['/portal/profile', 'ملفي الشخصي']].map(([to, l]) => <Link key={to} className="btn-ghost" to={to}>{l}</Link>)}</div>;
const AdminNav = () => <div className="mb-6 flex flex-wrap gap-2">{[['/admin', 'الرئيسية'], ['/admin/appointments', 'المواعيد']].map(([to, l]) => <Link key={to} className="btn-ghost" to={to}>{l}</Link>)}</div>;
const Note = ({ m }) => m ? <p role="status" className="mb-4 rounded-lg bg-teal-soft p-3 text-teal">{m}</p> : null;

const Thread = ({ items, onSend }) => { const [t, setT] = useState(''); return (<div>
  <div className="mb-4 max-h-96 space-y-2 overflow-y-auto">{items.length === 0 && <p className="text-ink/60">لا توجد رسائل بعد. اكتب أول رسالة.</p>}
    {items.map((m) => <div key={m._id} className={`max-w-[80%] rounded-2xl px-4 py-2 ${m.fromOffice ? 'bg-teal-soft' : 'mr-auto border border-ink/10 bg-white'}`}>{m.body}<small className="block text-ink/50">{m.fromOffice ? 'المكتب' : 'العميل'} — {fd(m.createdAt)}</small></div>)}</div>
  <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (t.trim()) { onSend(t); setT(''); } }}><input className="input" value={t} onChange={(e) => setT(e.target.value)} placeholder="اكتب رسالتك" /><button className="btn-primary">إرسال</button></form></div>); };

const HOURS = [9, 10, 11, 12, 13, 14, 15];
const SlotPicker = ({ services = [], taken = [], onSubmit, needService = true, label }) => {
  const [f, setF] = useState({}); const today = new Date().toISOString().slice(0, 10);
  const at = (h) => new Date(`${f.date}T${String(h).padStart(2, '0')}:00`);
  const busy = (h) => taken.some((t) => +new Date(t) === +at(h));
  return (<form className="card space-y-3" onSubmit={(e) => { e.preventDefault(); onSubmit(f.service, at(f.hour).toISOString()); }}>
    {needService && <select className="input" required onChange={(e) => setF({ ...f, service: e.target.value })}><option value="">اختر الخدمة</option>{services.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}</select>}
    <input type="date" min={today} required className="input" onChange={(e) => setF({ ...f, date: e.target.value, hour: '' })} />
    <select required className="input" value={f.hour || ''} onChange={(e) => setF({ ...f, hour: e.target.value })}><option value="">{f.date ? 'اختر الوقت' : 'اختر التاريخ أولاً'}</option>{f.date && HOURS.filter((h) => !busy(h) && at(h) > new Date()).map((h) => <option key={h} value={h}>{h > 12 ? h - 12 : h}:00 {h >= 12 ? 'م' : 'ص'}</option>)}</select>
    <button className="btn-primary w-full">{label}</button></form>);
};

function Appointments() {
  const [list, setList] = useState([]); const [taken, setTaken] = useState([]); const [services, setServices] = useState([]); const [re, setRe] = useState(null); const [msg, setMsg] = useState('');
  const load = () => { api('/appointments').then(setList); api('/appointments/taken').then(setTaken); api('/services').then(setServices); }; useEffect(load, []);
  const run = async (fn, ok) => { try { await fn(); setMsg(ok); setRe(null); load(); } catch (x) { setMsg(x.message); } };
  return (<Page title="مواعيدي"><PortalNav /><Note m={msg} /><div className="grid gap-6 md:grid-cols-3"><div className="space-y-3 md:col-span-2">
    {list.filter((a) => a.status === 'booked').length === 0 && <p className="card text-ink/60">لا توجد مواعيد قادمة. احجز موعدك من النموذج.</p>}
    {list.filter((a) => a.status === 'booked').map((a) => <div key={a._id} className="card flex flex-wrap items-center justify-between gap-2"><span><b>{a.service?.name}</b><small className="block text-ink/60">{fd(a.start)}</small></span>
      <span className="flex gap-2"><button className="btn-ghost" onClick={() => setRe(a._id)}>تعديل الموعد</button><button className="btn-ghost" onClick={() => run(() => api(`/appointments/${a._id}/cancel`, { method: 'PATCH' }), 'تم إلغاء الموعد')}>إلغاء</button></span></div>)}
    <p className="text-sm text-ink/60">الإلغاء والتعديل متاحان قبل الموعد بـ 24 ساعة على الأقل. مواعيد العمل من 9 صباحًا حتى 4 مساءً.</p></div>
    <div><h2 className="mb-3 font-bold">{re ? 'اختر الموعد الجديد' : 'حجز موعد جديد'}</h2>
      <SlotPicker services={services} taken={taken} needService={!re} label={re ? 'تأكيد التعديل' : 'احجز الموعد'} onSubmit={(service, start) => run(() => re ? api('/appointments/' + re, { method: 'PATCH', body: { start } }) : api('/appointments', { method: 'POST', body: { service, start } }), 'تم تسجيل موعدك')} />
      {re && <button className="btn-ghost mt-2 w-full" onClick={() => setRe(null)}>إلغاء التعديل</button>}</div></div></Page>);
}
function MessagesPage() {
  const [items, setItems] = useState([]); const load = () => api('/messages').then(setItems); useEffect(() => { load(); }, []);
  return <Page title="الرسائل"><PortalNav /><div className="card"><Thread items={items} onSend={async (body) => { await api('/messages', { method: 'POST', body: { body } }); load(); }} /></div></Page>;
}
function Profile() {
  const { user, setUser } = useAuth(); const [me, setMe] = useState({}); const [msg, setMsg] = useState('');
  useEffect(() => { api('/me').then(setMe); }, []);
  const save = async (e) => { e.preventDefault(); try { const u = await api('/me', { method: 'PUT', body: Object.fromEntries(new FormData(e.target)) }); setUser({ ...user, name: u.name }); setMsg('تم حفظ بياناتك'); } catch (x) { setMsg(x.message); } };
  return <Page title="ملفي الشخصي"><PortalNav /><Note m={msg} />{me.email && <form onSubmit={save} className="card max-w-md space-y-3">
    {[['name', 'الاسم'], ['phone', 'الهاتف'], ['company', 'الشركة'], ['address', 'العنوان']].map(([k, l]) => <label key={k} className="block">{l}<input name={k} className="input mt-1" defaultValue={me[k] || ''} /></label>)}
    <p className="text-ink/60">البريد: {me.email}</p><button className="btn-primary">حفظ</button></form>}</Page>;
}
function Forgot() { const [sent, setSent] = useState(false); const [err, setErr] = useState(''); return <Page title="نسيت كلمة المرور"><form className="card max-w-md space-y-4" onSubmit={async (e) => { e.preventDefault(); setErr(''); try { const { error } = await supabase.auth.resetPasswordForEmail(e.target.email.value, { redirectTo: `${window.location.origin}/reset` }); if (error) throw error; setSent(true); } catch (error) { setErr(authErrorMessage('password-reset', error)); } }}>
  <input name="email" type="email" required className="input" placeholder="البريد الإلكتروني" /><button className="btn-primary w-full">إرسال رابط الاستعادة</button>{err && <p role="alert" className="text-red-700">{err}</p>}{sent && <p role="status" className="text-teal">إذا كان البريد مسجلًا فسيصلك رابط الاستعادة.</p>}</form></Page>; }
function Reset() { const nav = useNavigate(); const [err, setErr] = useState(''); return <Page title="كلمة مرور جديدة"><form className="card max-w-md space-y-4" onSubmit={async (e) => { e.preventDefault(); try { const { error } = await supabase.auth.updateUser({ password: e.target.password.value }); if (error) { setErr(authErrorMessage('password-reset', error)); return; } nav('/login'); } catch (error) { setErr(error.message || 'رابط الاستعادة غير صالح أو منتهي. اطلب رابطًا جديدًا.'); } }}>
  <input name="password" type="password" minLength="8" required className="input" placeholder="كلمة المرور الجديدة (8 أحرف على الأقل)" />{err && <p role="alert" className="text-red-700">{err}</p>}<button className="btn-primary w-full">حفظ</button></form></Page>; }

function ReqRow({ r, can, act }) {
  const [note, setNote] = useState(''); const [doc, setDoc] = useState(''); const patch = (body, ok) => act(() => api('/requests/' + r._id, { method: 'PATCH', body }), ok);
  return (<div className="card space-y-3"><div className="flex justify-between"><b>#{r.code} — {r.service?.name}</b><Badge s={r.status} /></div><p className="text-ink/70">{r.description}</p><Tracker stage={r.stage} />
    {can && <><div className="grid gap-2 sm:grid-cols-2"><select className="input" value={r.status} onChange={(e) => patch({ status: e.target.value }, 'تم تحديث الحالة')}>{Object.keys(STATUS).slice(0, 5).map((k) => <option key={k} value={k}>{STATUS[k][0]}</option>)}</select>
      <select className="input" value={r.stage} onChange={(e) => patch({ stage: +e.target.value }, 'تم تحديث المرحلة')}>{STAGES.map((l, i) => <option key={l} value={i}>{l}</option>)}</select></div>
      <div className="flex gap-2"><input className="input" placeholder="ملاحظة داخلية" value={note} onChange={(e) => setNote(e.target.value)} /><button className="btn-ghost" onClick={() => note && patch({ note }, 'تمت إضافة الملاحظة').then(() => setNote(''))}>إضافة</button></div>
      <div className="flex gap-2"><input className="input" placeholder="اطلب مستندًا من العميل، مثل: كشف حساب بنكي" value={doc} onChange={(e) => setDoc(e.target.value)} /><button className="btn-ghost" onClick={() => doc && act(() => api(`/requests/${r._id}/required-docs`, { method: 'POST', body: { title: doc } }), 'تم طلب المستند من العميل').then(() => setDoc(''))}>طلب مستند</button></div></>}
    {r.notes?.map((n, i) => <p key={i} className="rounded-lg bg-paper p-2 text-sm">{n.text}</p>)}</div>);
}

function ClientPage() {
  const { id } = useParams(); const { user } = useAuth(); const can = user.role !== 'receptionist'; const [d, setD] = useState(); const [tab, setTab] = useState('overview'); const [msg, setMsg] = useState('');
  const load = async () => {
    if (user.role === 'receptionist') {
      const [c, services, taken] = await Promise.all([api('/admin/clients/' + id), api('/services'), api('/appointments/taken')]);
      setD({ user: c.user, requests: [], documents: [], invoices: [], appointments: c.appointments, messages: [], required: [], services, taken });
      return;
    }
    const [c, ...r] = await Promise.all([api('/admin/clients/' + id), ...['requests', 'documents', 'invoices', 'appointments', 'messages', 'required-docs'].map((p) => api(`/${p}?client=${id}`)), api('/services'), api('/appointments/taken')]);
    const [requests, documents, invoices, appointments, messages, required, services, taken] = r; setD({ user: c.user, requests, documents, invoices, appointments, messages, required, services, taken });
  };
  useEffect(() => { load(); }, [id]);
  const act = async (fn, ok = 'تم') => { try { const result = await fn(); setMsg(result?.warning || ok); load(); } catch (x) { setMsg(x.message); } };
  if (!d) return <Page title="جارٍ التحميل…" />;
  const TABS = user.role === 'receptionist' ? [['overview', 'نظرة عامة'], ['appointments', 'المواعيد']] : [['overview', 'نظرة عامة'], ['requests', `الطلبات (${d.requests.length})`], ['documents', `المستندات (${d.documents.length})`], ['invoices', 'الفواتير'], ['appointments', 'المواعيد'], ['messages', 'الرسائل']];
  const u = d.user;
  return (<Page title={u.name}><AdminNav /><Link to="/admin" className="mb-4 inline-block text-teal underline">← كل العملاء</Link><Note m={msg} />
    <div className="mb-6 flex flex-wrap gap-2 border-b border-ink/10 pb-3">{TABS.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`btn ${tab === k ? 'bg-ink text-white' : 'hover:bg-white'}`}>{l}</button>)}</div>
    {tab === 'overview' && <form className="card grid max-w-2xl gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); act(() => api('/admin/clients/' + id, { method: 'PUT', body: Object.fromEntries(new FormData(e.target)) }), 'تم حفظ بيانات العميل'); }}>
      {[['name', 'الاسم'], ['phone', 'الهاتف'], ['company', 'الشركة'], ['address', 'العنوان']].map(([k, l]) => <label key={k}>{l}<input name={k} className="input mt-1" defaultValue={u[k] || ''} /></label>)}
      <p className="text-ink/60 sm:col-span-2">البريد: {u.email} — تاريخ التسجيل: {fd(u.createdAt)}</p><button className="btn-primary sm:col-span-2">حفظ التعديلات</button></form>}
    {tab === 'requests' && <div className="space-y-4">{d.requests.length === 0 && <p className="card text-ink/60">لم يقدّم هذا العميل أي طلبات.</p>}{d.requests.map((r) => <ReqRow key={r._id} r={r} can={can} act={act} />)}</div>}
    {tab === 'documents' && <div className="space-y-4">
      {d.required.length > 0 && <div className="card border-brass/40"><b>مستندات مطلوبة ولم تُرفع بعد</b>{d.required.map((r) => <p key={r._id} className="mt-2">{r.title}</p>)}</div>}
      <div className="card divide-y divide-ink/10">{d.documents.length === 0 && <p className="text-ink/60">لا توجد مستندات.</p>}{d.documents.map((x) => <div key={x._id} className="flex items-center justify-between py-2"><span>{x.name}<small className="block text-ink/50">{x.direction === 'from_client' ? 'رفعه العميل' : 'رفعه المكتب'} — {fd(x.createdAt)}</small></span><button className="text-teal underline" onClick={() => download(x._id, x.name)}>تحميل</button></div>)}</div>
      {can && <form className="card space-y-3" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.target); f.append('client', id); if (!f.get('request')) f.delete('request'); act(() => api('/documents', { method: 'POST', form: f }), 'تم رفع المستند للعميل'); e.target.reset(); }}>
        <b>رفع مستند إلى حساب العميل</b><input name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx" required /><select name="request" className="input"><option value="">غير مرتبط بطلب</option>{d.requests.map((r) => <option key={r._id} value={r._id}>#{r.code}</option>)}</select><button className="btn-primary">رفع</button></form>}</div>}
    {tab === 'invoices' && <div className="space-y-4">{can && <form className="card grid gap-3 sm:grid-cols-4" onSubmit={(e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); act(() => api('/invoices', { method: 'POST', body: { client: id, service: f.service, amount: +f.amount, dueDate: f.dueDate } }), 'تم إنشاء الفاتورة'); e.target.reset(); }}>
      <input name="service" required className="input" placeholder="الخدمة" /><input name="amount" type="number" min="1" required className="input" placeholder="المبلغ (ج.م)" /><input name="dueDate" type="date" required className="input" /><button className="btn-primary">إنشاء فاتورة</button></form>}
      <div className="card divide-y divide-ink/10">{d.invoices.length === 0 && <p className="text-ink/60">لا توجد فواتير.</p>}{d.invoices.map((i) => <div key={i._id} className="flex flex-wrap items-center justify-between gap-2 py-2"><span>#{i.number} — {i.service} — استحقاق {new Date(i.dueDate).toLocaleDateString('ar-EG')}</span><span className="flex items-center gap-3">{i.amount} ج.م <Badge s={i.status} /><button className="text-teal underline" onClick={() => downloadInvoice(i)}>تنزيل</button>{can && i.status !== 'paid' && <button className="text-teal underline" onClick={() => act(() => api(`/invoices/${i._id}/paid`, { method: 'PATCH' }), 'تم تسجيل الدفع')}>تسجيل كمدفوعة</button>}</span></div>)}</div></div>}
    {tab === 'appointments' && <div className="grid gap-6 md:grid-cols-3"><div className="card divide-y divide-ink/10 md:col-span-2">{d.appointments.length === 0 && <p className="text-ink/60">لا توجد مواعيد.</p>}{d.appointments.map((a) => <div key={a._id} className="flex items-center justify-between py-2"><span>{a.service?.name} — {fd(a.start)}</span><span className="flex gap-2 text-sm">{a.status === 'booked' ? <><button className="text-teal underline" onClick={() => act(() => api('/appointments/' + a._id, { method: 'PATCH', body: { status: 'done' } }))}>تم</button><button className="text-red-700 underline" onClick={() => act(() => api(`/appointments/${a._id}/cancel`, { method: 'PATCH' }), 'تم الإلغاء')}>إلغاء</button></> : a.status === 'done' ? 'منتهي' : 'ملغي'}</span></div>)}</div>
      <div><h3 className="mb-2 font-bold">حجز موعد لهذا العميل</h3><SlotPicker services={d.services} taken={d.taken} label="احجز" onSubmit={(service, start) => act(() => api('/appointments', { method: 'POST', body: { client: id, service, start } }), 'تم حجز الموعد')} /></div></div>}
    {tab === 'messages' && <div className="card"><Thread items={d.messages} onSend={(body) => act(() => api('/messages', { method: 'POST', body: { client: id, body } }), 'تم إرسال الرسالة')} /></div>}</Page>);
}

function AdminAppointments() {
  const [list, setList] = useState([]); const [taken, setTaken] = useState([]); const [re, setRe] = useState(null); const [msg, setMsg] = useState('');
  const load = () => { api('/appointments').then(setList); api('/appointments/taken').then(setTaken); }; useEffect(load, []);
  const run = async (fn, ok) => { try { await fn(); setMsg(ok); setRe(null); load(); } catch (x) { setMsg(x.message); } };
  return (<Page title="مواعيد المكتب"><AdminNav /><Note m={msg} /><div className="grid gap-6 md:grid-cols-3"><div className="card divide-y divide-ink/10 md:col-span-2">{list.length === 0 && <p className="text-ink/60">لا توجد مواعيد.</p>}
    {list.map((a) => <div key={a._id} className="flex flex-wrap items-center justify-between gap-2 py-3"><span><Link to={`/admin/clients/${a.client?._id}`} className="font-bold text-teal">{a.client?.name}</Link> — {a.service?.name}<small className="block text-ink/60">{fd(a.start)}</small></span>
      {a.status === 'booked' ? <span className="flex gap-3 text-sm"><button className="text-teal underline" onClick={() => setRe(a._id)}>تعديل</button><button className="underline" onClick={() => run(() => api('/appointments/' + a._id, { method: 'PATCH', body: { status: 'done' } }), 'تم')}>تم</button><button className="text-red-700 underline" onClick={() => run(() => api(`/appointments/${a._id}/cancel`, { method: 'PATCH' }), 'تم الإلغاء')}>إلغاء</button></span> : <span className="text-ink/60">{a.status === 'done' ? 'منتهي' : 'ملغي'}</span>}</div>)}</div>
    {re && <div><h3 className="mb-2 font-bold">الموعد الجديد</h3><SlotPicker needService={false} taken={taken} label="تأكيد التعديل" onSubmit={(_, start) => run(() => api('/appointments/' + re, { method: 'PATCH', body: { start } }), 'تم تعديل الموعد وإشعار العميل')} /></div>}</div></Page>);
}


function App() {
  const [user, setUser] = useState(); const [ready, setReady] = useState(false); const [profileIssue, setProfileIssue] = useState(false); const [restoreAttempt, setRestoreAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    let revision = 0;
    const syncSession = async (session) => {
      const currentRevision = ++revision;
      if (!session?.user) {
        if (active && currentRevision === revision) {
          setUser(null);
          setProfileIssue(false);
          setReady(true);
        }
        return;
      }
      try {
        const profile = await getProfile(session.user);
        if (active && currentRevision === revision) {
          setUser(profile);
          setProfileIssue(false);
        }
      } catch (error) {
        if (active && currentRevision === revision) {
          console.error('Unable to restore Supabase profile.', {
            category: typeof error?.code === 'string' ? error.code : (error?.name || 'profile_unavailable'),
            ...(Number.isInteger(error?.status) ? { status: error.status } : {}),
          });
          setUser(null);
          setProfileIssue(true);
        }
      } finally {
        if (active && currentRevision === revision) setReady(true);
      }
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      queueMicrotask(() => { void syncSession(session); });
    });
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) throw error;
      return syncSession(data.session);
    }).catch((error) => {
      console.error('Supabase session restoration failed.', {
        category: typeof error?.code === 'string' ? error.code : (error?.name || 'unknown'),
        ...(Number.isInteger(error?.status) ? { status: error.status } : {}),
      });
      if (active) {
        setUser(null);
        setProfileIssue(true);
        setReady(true);
      }
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [restoreAttempt]);
  const retryProfile = () => {
    setReady(false);
    setRestoreAttempt((attempt) => attempt + 1);
  };
  const logout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(authErrorMessage('sign-out', error));
    setUser(null);
    setProfileIssue(false);
  };
  if (!ready) return null;
  if (profileIssue) return <main className="page-shell container"><h1 className="page-title">تعذر استعادة الحساب</h1><p role="alert" className="form-error">تعذر استعادة الجلسة أو تحميل ملف التطبيق. قد تكون المشكلة في profiles أو الصلاحيات أو دالة تهيئة العميل. لم نسجل خروجك تلقائيًا ولم نغيّر أي بيانات.</p><div className="flex flex-wrap gap-3"><button className="button button-navy" onClick={retryProfile}>إعادة المحاولة</button><button className="button button-outline-dark" onClick={() => logout().catch((error) => { setProfileIssue(true); console.error('Supabase sign-out failed.', { category: error?.name || 'unknown' }); })}>تسجيل الخروج</button></div></main>;
  const guard = (el, staff) => (!user ? <Navigate to="/login" /> : staff ? (STAFF_ROLES.includes(user.role) ? el : <Navigate to="/" />) : user.role === 'client' ? el : <Navigate to="/" />);
  return (<Auth.Provider value={{ user, setUser, logout }}><BrowserRouter><Shell><Routes>
    <Route path="/" element={<Home />} />
    <Route path="/about" element={<Page title="من نحن"><div className="about-page"><div><span className="eyebrow">Y GROUP · بورسعيد، مصر</span><h2>خبرة تركز على ما يهم أعمالك</h2><p>تقدم واي جروب للمحاسبة والمراجعة والأعمال القانونية خدمات محاسبية وضريبية ومهنية، مع التركيز على الدقة والسرية وجودة خدمة العملاء.</p><p>نساعد أصحاب الأعمال على تنظيم حساباتهم ومتابعة التزاماتهم، ونوفر للعملاء بوابة رقمية لمتابعة الطلبات والمستندات والفواتير والمواعيد.</p><div className="about-actions"><Link to="/services" className="button button-navy">استكشف خدماتنا</Link><Link to="/contact" className="button button-gold">تواصل معنا</Link></div></div><img src="/assets/y-group-logo.png" alt="الشعار الرسمي لواي جروب للمحاسبة والمراجعة والأعمال القانونية" /></div></Page>} />
    <Route path="/services" element={<Page title="خدماتنا"><ServiceGrid /></Page>} />
    <Route path="/contact" element={<Page title="تواصل معنا"><div className="contact-page"><div className="contact-info"><h2>يسعدنا تواصلك</h2><p>تواصل مع فريق واي جروب للاستفسار عن خدماتنا أو لمتابعة طلبك.</p><span>⌖ بورسعيد، مصر</span><a href="tel:0663263849">☎ 0663263849</a><a href="tel:01288253589">☎ 01288253589</a><a href="tel:01221559019">☎ 01221559019</a><a href="https://www.facebook.com/DrYohanaNosshyAttia" target="_blank" rel="noreferrer">صفحة Y GROUP على فيسبوك ↗</a></div><div className="contact-portal"><h3>تحتاج إلى خدمة أو متابعة طلب؟</h3><p>أنشئ حساب عميل لتقديم طلبك ورفع مستنداتك ومتابعة الخدمة إلكترونيًا.</p><div className="about-actions"><Link to="/signup" className="button button-gold">إنشاء حساب عميل</Link><Link to="/login" className="button button-navy">دخول العملاء</Link></div></div></div></Page>} />
    <Route path="/login" element={<AuthForm mode="login" />} /><Route path="/signup" element={<AuthForm mode="signup" />} />
    <Route path="/admin/login" element={<AuthForm mode="login" staffOnly />} />
    <Route path="/portal" element={guard(<Portal />, false)} /><Route path="/admin" element={guard(<Admin />, true)} /><Route path="/admin/clients/:id" element={guard(<ClientPage />, true)} /><Route path="/admin/appointments" element={guard(<AdminAppointments />, true)} />
    <Route path="/portal/appointments" element={guard(<Appointments />, false)} /><Route path="/portal/messages" element={guard(<MessagesPage />, false)} /><Route path="/portal/profile" element={guard(<Profile />, false)} /><Route path="/forgot" element={<Forgot />} /><Route path="/reset" element={<Reset />} />
  </Routes></Shell></BrowserRouter></Auth.Provider>);
}
createRoot(document.getElementById('root')).render(<App />);
