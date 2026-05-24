import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Shell } from '@/components/layout/Shell'
import { PageLoader } from '@/components/ui/LoadingSpinner'
import { useAuth } from '@/context/AuthContext'

const Login = lazy(() => import('@/pages/Login'))
const Home = lazy(() => import('@/pages/Home'))
const PHDDashboard = lazy(() => import('@/pages/PHDDashboard'))
const BondhuDashboard = lazy(() => import('@/pages/BondhuDashboard'))
const ManagerApprovals = lazy(() => import('@/pages/ManagerApprovals'))
const FistulaTracker = lazy(() => import('@/pages/FistulaTracker'))
const MPDSRTracker = lazy(() => import('@/pages/MPDSRTracker'))
const ReportingHub = lazy(() => import('@/pages/ReportingHub'))
const BaselineEndline = lazy(() => import('@/pages/BaselineEndline'))
const TrainingLog = lazy(() => import('@/pages/TrainingLog'))
const ProgressTracker = lazy(() => import('@/pages/ProgressTracker'))
const AdminPanel = lazy(() => import('@/pages/AdminPanel'))

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <PageLoader />
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function RequireSuperAdmin({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  if (!user || !['super_admin', 'developer'].includes(user.role)) {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            element={
              <RequireAuth>
                <Shell />
              </RequireAuth>
            }
          >
            <Route index element={<Home />} />
            <Route path="phd" element={<PHDDashboard />} />
            <Route path="bondhu" element={<BondhuDashboard />} />
            <Route path="approvals" element={<ManagerApprovals />} />
            <Route path="fistula" element={<FistulaTracker />} />
            <Route path="mpdsr" element={<MPDSRTracker />} />
            <Route path="reports" element={<ReportingHub />} />
            <Route path="baseline" element={<BaselineEndline />} />
            <Route path="training" element={<TrainingLog />} />
            <Route path="tracker" element={<ProgressTracker />} />
            <Route
              path="admin"
              element={
                <RequireSuperAdmin>
                  <AdminPanel />
                </RequireSuperAdmin>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
