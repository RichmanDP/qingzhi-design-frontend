import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { SessionProvider, useSession } from './components/session'
import { ToastProvider } from './components/toast'
import AdminPage from './pages/AdminPage'
import AgentDetailPage from './pages/AgentDetailPage'
import AssetsPage from './pages/AssetsPage'
import AvatarPage from './pages/AvatarPage'
import BillingPage from './pages/BillingPage'
import ChannelsPage from './pages/ChannelsPage'
import ControlPlanePage from './pages/ControlPlanePage'
import DashboardPage from './pages/DashboardPage'
import DepartmentPage from './pages/DepartmentPage'
import DramaWorkspacePage from './pages/DramaWorkspacePage'
import JobDetailPage from './pages/JobDetailPage'
import KnowledgePage from './pages/KnowledgePage'
import LoginPage from './pages/LoginPage'
import MarketingPage from './pages/MarketingPage'
import MeetingsPage from './pages/MeetingsPage'
import NewTaskPage from './pages/NewTaskPage'
import NotificationsPage from './pages/NotificationsPage'
import SchedulesPage from './pages/SchedulesPage'
import SettingsPage from './pages/SettingsPage'
import TasksPage from './pages/TasksPage'
import TeamPage from './pages/TeamPage'

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('QINGZHI render failure', error, info.componentStack) }
  render() {
    if (this.state.error) return <div className="not-found"><div><div className="not-found-code">!</div><h1>页面渲染失败</h1><p>{this.state.error.message}</p><button className="btn btn-solid" onClick={() => window.location.reload()}>重新加载</button></div></div>
    return this.props.children
  }
}

function PrivateLayout() {
  const { authenticated } = useSession()
  const location = useLocation()
  if (!authenticated) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />
  return <AppShell><Outlet /></AppShell>
}

function NotFoundPage() {
  return <div className="not-found"><div><div className="not-found-code">404</div><h1>这层楼还没开放</h1><p>检查地址，或返回集团楼层继续。</p><a className="btn btn-solid" href="/app">返回集团楼层</a></div></div>
}

export default function App() {
  return <ErrorBoundary><SessionProvider><ToastProvider><Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route element={<PrivateLayout />}>
      <Route index element={<Navigate to="/app" replace />} />
      <Route path="app" element={<DashboardPage />} />
      <Route path="tasks" element={<TasksPage />} />
      <Route path="tasks/new" element={<NewTaskPage />} />
      <Route path="jobs/:id" element={<JobDetailPage />} />
      <Route path="agents/:id" element={<AgentDetailPage />} />
      <Route path="knowledge" element={<KnowledgePage />} />
      <Route path="assets" element={<AssetsPage />} />
      <Route path="meetings" element={<MeetingsPage />} />
      <Route path="schedules" element={<SchedulesPage />} />
      <Route path="notifications" element={<NotificationsPage />} />
      <Route path="team" element={<TeamPage />} />
      <Route path="settings" element={<SettingsPage />} />
      <Route path="settings/control-plane" element={<ControlPlanePage />} />
      <Route path="marketing" element={<MarketingPage />} />
      <Route path="avatar" element={<AvatarPage />} />
      <Route path="channels" element={<ChannelsPage />} />
      <Route path="billing" element={<BillingPage />} />
      <Route path="admin" element={<AdminPage />} />
      <Route path="departments/:industry" element={<DepartmentPage />} />
      <Route path="content" element={<Navigate to="/departments/content" replace />} />
      <Route path="medical" element={<Navigate to="/departments/medical" replace />} />
      <Route path="drama" element={<DramaWorkspacePage />} />
      <Route path="consulting" element={<Navigate to="/departments/consulting" replace />} />
      <Route path="taoism" element={<Navigate to="/departments/taoism" replace />} />
      <Route path="culture-legal" element={<Navigate to="/departments/culture_legal" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Route>
  </Routes></ToastProvider></SessionProvider></ErrorBoundary>
}
