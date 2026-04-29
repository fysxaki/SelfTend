import {
  AppstoreOutlined,
  BarChartOutlined,
  BookOutlined,
  GiftOutlined,
  MoonOutlined,
  ScheduleOutlined,
  TrophyOutlined,
} from '@ant-design/icons'
import { App as AntdApp, ConfigProvider, Spin, Layout, theme } from 'antd'
import { lazy, Suspense, useEffect } from 'react'
import {
  NavLink,
  Navigate,
  Route,
  BrowserRouter as Router,
  Routes,
  useLocation,
} from 'react-router-dom'
import { useAppStore } from '@/stores/useAppStore'

const Dashboard    = lazy(() => import('@/pages/Dashboard'))
const Tasks        = lazy(() => import('@/pages/Tasks'))
const Rewards      = lazy(() => import('@/pages/Rewards'))
const SeasonPage   = lazy(() => import('@/pages/Season'))
const SleepPage    = lazy(() => import('@/pages/Sleep'))
const AnalyticsPage = lazy(() => import('@/pages/Analytics'))
const ReviewPage   = lazy(() => import('@/pages/Review'))
const Login        = lazy(() => import('@/pages/Login'))

const { Sider, Content } = Layout

const NAV_ITEMS = [
  { key: '/',          icon: <AppstoreOutlined />,  label: '今日',  path: '/' },
  { key: '/tasks',     icon: <ScheduleOutlined />,  label: '任务',  path: '/tasks' },
  { key: '/rewards',   icon: <GiftOutlined />,      label: '奖励',  path: '/rewards' },
  { key: '/season',    icon: <TrophyOutlined />,    label: '赛季',  path: '/season' },
  { key: '/sleep',     icon: <MoonOutlined />,      label: '睡眠',  path: '/sleep' },
  { key: '/analytics', icon: <BarChartOutlined />,  label: '分析',  path: '/analytics' },
  { key: '/review',    icon: <BookOutlined />,      label: '复盘',  path: '/review' },
]

function RequireAuth({ children }: { children: React.ReactNode }) {
  const code = localStorage.getItem('selftend_code')
  if (!code) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AppLayout() {
  const location = useLocation()
  const { init, initialized } = useAppStore()

  // 启动时加载赛季和用户数据，消除白屏
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { init() }, [])

  if (!initialized) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100svh', background: '#f0eeff' }}>
        <Spin size="large" />
      </div>
    )
  }

  return (
    <Layout style={{ minHeight: '100svh' }}>
      <Sider
        width={68}
        style={{
          background: '#2e1f72',
          borderRight: '1px solid #3d2a8a',
          position: 'fixed',
          left: 0, top: 0,
          height: '100vh',
          zIndex: 100,
        }}
      >
        <div className="flex items-center justify-center h-14" style={{ borderBottom: '1px solid #3d2a8a' }}>
          <span style={{ color: '#e0d4ff', fontSize: 22 }}>◈</span>
        </div>
        <div className="flex flex-col items-center gap-1 pt-3">
          {NAV_ITEMS.map((item) => {
            const active = location.pathname === item.key
            return (
              <NavLink
                key={item.key}
                to={item.path}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  gap: 4, width: 52, paddingTop: 10, paddingBottom: 10,
                  borderRadius: 10, fontSize: 11,
                  fontWeight: active ? 600 : 400,
                  textDecoration: 'none', transition: 'all 0.15s',
                  background: active ? 'rgba(255,255,255,0.15)' : 'transparent',
                  color: active ? '#ffffff' : '#c4b5fd',
                }}
              >
                <span style={{ fontSize: 16 }}>{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            )
          })}
        </div>
      </Sider>

      <Layout style={{ marginLeft: 68, background: '#f0eeff', minHeight: '100vh' }}>
        <Content>
          <Suspense fallback={
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '80vh' }}>
              <Spin size="large" />
            </div>
          }>
            <Routes>
              <Route path="/"           element={<Dashboard />} />
              <Route path="/tasks"      element={<Tasks />} />
              <Route path="/rewards"    element={<Rewards />} />
              <Route path="/season"     element={<SeasonPage />} />
              <Route path="/sleep"      element={<SleepPage />} />
              <Route path="/analytics"  element={<AnalyticsPage />} />
              <Route path="/review"     element={<ReviewPage />} />
            </Routes>
          </Suspense>
        </Content>
      </Layout>
    </Layout>
  )
}

export default function App() {
  return (
    <ConfigProvider
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: '#7c3aed',
          colorBgBase: '#ffffff',
          colorBgContainer: '#ffffff',
          colorText: '#1e1826',
          colorBorder: '#e4deff',
          borderRadius: 10,
          fontFamily: 'system-ui, -apple-system, sans-serif',
        },
        components: {
          Table: { headerBg: '#f5f3ff', rowHoverBg: '#faf8ff' },
          Modal: { contentBg: '#ffffff', headerBg: '#ffffff' },
        },
      }}
    >
      <AntdApp>
        <Router>
          <Suspense fallback={
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100svh' }}>
              <Spin size="large" />
            </div>
          }>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route
                path="/*"
                element={
                  <RequireAuth>
                    <AppLayout />
                  </RequireAuth>
                }
              />
            </Routes>
          </Suspense>
        </Router>
      </AntdApp>
    </ConfigProvider>
  )
}
