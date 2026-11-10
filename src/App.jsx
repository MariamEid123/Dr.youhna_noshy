import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import About from './pages/About'
import { Services, ServiceDetail } from './pages/Services'
import Contact from './pages/Contact'
import { ComingSoon, Legal } from './pages/Misc'
import Register from './pages/auth/Register'
import Login from './pages/auth/Login'
import AdminLogin from './pages/auth/AdminLogin'
import ForgotPassword from './pages/auth/ForgotPassword'
import ResetPassword from './pages/auth/ResetPassword'
import VerifyEmail from './pages/auth/VerifyEmail'
import { RequireClient, RequireAdmin, RequireSuperAdmin, RequireOfficeAdmin } from './auth/guards'
import ClientLayout from './pages/client/ClientLayout'
import ClientOverview from './pages/client/ClientOverview'
import ClientProfile from './pages/client/ClientProfile'
import ClientSecurity from './pages/client/ClientSecurity'
import AdminLayout from './pages/admin/AdminLayout'
import AdminHome from './pages/admin/AdminHome'
import ClientsList from './pages/admin/ClientsList'
import StaffManagement from './pages/admin/StaffManagement'
import ContactMessages from './pages/admin/ContactMessages'
const PortalModule = lazy(() => import('./pages/portal/PortalModule'))

export default function App() {
  return (
    <Suspense fallback={<div role="status" className="py-24 text-center text-ink/60">Loading…</div>}>
    <Routes>
      {/* Public website */}
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="about" element={<About />} />
        <Route path="services" element={<Services />} />
        <Route path="services/:id" element={<ServiceDetail />} />
        <Route path="contact" element={<Contact />} />
        <Route path="privacy" element={<Legal k="privacy" />} />
        <Route path="terms" element={<Legal k="terms" />} />
        <Route path="upload-disclaimer" element={<Legal k="disclaimer" />} />
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
        <Route path="forgot-password" element={<ForgotPassword />} />
        <Route path="reset-password" element={<ResetPassword />} />
        <Route path="verify-email" element={<VerifyEmail />} />
        <Route path="*" element={<ComingSoon />} />
      </Route>

      {/* Admin login (own minimal layout, no site header) */}
      <Route path="/admin/login" element={<AdminLogin />} />

      {/* Client dashboard — clients only */}
      <Route path="/client" element={<RequireClient><ClientLayout /></RequireClient>}>
        <Route index element={<ClientOverview />} />
        <Route path="profile" element={<ClientProfile />} />
        <Route path="security" element={<ClientSecurity />} />
        <Route path="documents" element={<PortalModule kind="documents" />} />
        <Route path="appointments" element={<PortalModule kind="appointments" />} />
        <Route path="requests" element={<PortalModule kind="requests" />} />
        <Route path="messages" element={<PortalModule kind="messages" />} />
        <Route path="notifications" element={<PortalModule kind="notifications" />} />
      </Route>

      {/* Admin dashboard — staff / office_admin / super_admin */}
      <Route path="/admin" element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
        <Route index element={<AdminHome />} />
        <Route path="clients" element={<ClientsList />} />
        <Route path="staff" element={<RequireSuperAdmin><StaffManagement /></RequireSuperAdmin>} />
        <Route path="documents" element={<PortalModule kind="documents" />} />
        <Route path="appointments" element={<PortalModule kind="appointments" />} />
        <Route path="requests" element={<PortalModule kind="requests" />} />
        <Route path="messages" element={<PortalModule kind="messages" />} />
        <Route path="contact-messages" element={<RequireOfficeAdmin><ContactMessages /></RequireOfficeAdmin>} />
        <Route path="notifications" element={<PortalModule kind="notifications" />} />
        <Route path="settings" element={<PortalModule kind="settings" />} />
        <Route path="activity" element={<RequireSuperAdmin><PortalModule kind="activity" /></RequireSuperAdmin>} />
      </Route>
    </Routes>
    </Suspense>
  )
}
