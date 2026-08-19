import {
  AppstoreOutlined,
  BarChartOutlined,
  BookOutlined,
  CloudOutlined,
  GiftOutlined,
  HeartOutlined,
  MoonOutlined,
  RobotOutlined,
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
const AgentPage    = lazy(() => import('@/pages/Agent'))
const WorryPage    = lazy(() => import('@/pages/Worry'))
const WishPage     = lazy(() => import('@/pages/Wish'))
const Login        = lazy(() => import('@/pages/Login'))

const { Sider, Content } = Layout

const NAV_ITEMS = [
  { key: '/',          icon: <AppstoreOutlined />,  label: '今日',    path: '/' },
  { key: '/tasks',     icon: <ScheduleOutlined />,  label: '我的任务', path: '/tasks' },
  { key: '/rewards',   icon: <GiftOutlined />,      label: '奖励商店', path: '/rewards' },
  { key: '/wish',      icon: <HeartOutlined />,     label: '心愿',    path: '/wish' },
  { key: '/season',    icon: <TrophyOutlined />,    label: '当前赛季', path: '/season' },
  { key: '/sleep',     icon: <MoonOutlined />,      label: '睡眠记录', path: '/sleep' },
  { key: '/worry',     icon: <CloudOutlined />,     label: '焦虑暂存', path: '/worry' },
  { key: '/analytics', icon: <BarChartOutlined />,  label: '数据分析', path: '/analytics' },
  { key: '/review',    icon: <BookOutlined />,      label: '每日复盘', path: '/review' },
  { key: '/agent',     icon: <RobotOutlined />,     label: 'AI 助手',  path: '/agent' },
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100svh', background: '#f4f9f7' }}>
        <Spin size="large" />
      </div>
    )
  }

  return (
    <Layout style={{ minHeight: '100svh' }}>
      <Sider
        width={200}
        style={{
          background: '#2c4d4a',
          borderRight: '1px solid #2f5d59',
          position: 'fixed',
          left: 0, top: 0,
          height: '100vh',
          zIndex: 100,
        }}
      >
        <div className="flex items-center h-14 px-5" style={{ borderBottom: '1px solid #2f5d59' }}>
          <span className="font-script" style={{ color: '#fde047', fontSize: 22, lineHeight: 1 }}>SelfTend</span>
        </div>
        <div className="flex flex-col gap-1 pt-3 px-3">
          {NAV_ITEMS.map((item) => {
            const active = location.pathname === item.key
            return (
              <NavLink
                key={item.key}
                to={item.path}
                style={{
                  display: 'flex', flexDirection: 'row', alignItems: 'center',
                  gap: 10, padding: '10px 12px',
                  borderRadius: 10, fontSize: 13,
                  fontWeight: active ? 600 : 400,
                  textDecoration: 'none', transition: 'all 0.15s',
                  background: active ? 'rgba(255,255,255,0.15)' : 'transparent',
                  color: active ? '#ffffff' : '#b8d8d3',
                }}
              >
                <span style={{ fontSize: 16, flexShrink: 0 }}>{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            )
          })}
        </div>
      </Sider>

      <Layout style={{ marginLeft: 200, background: 'transparent', minHeight: '100vh' }}>
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
              <Route path="/wish"       element={<WishPage />} />
              <Route path="/season"     element={<SeasonPage />} />
              <Route path="/sleep"      element={<SleepPage />} />
              <Route path="/worry"      element={<WorryPage />} />
              <Route path="/analytics"  element={<AnalyticsPage />} />
              <Route path="/review"     element={<ReviewPage />} />
              <Route path="/agent"      element={<AgentPage />} />
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
          colorPrimary: '#4a8a83',
          colorBgBase: '#ffffff',
          colorBgContainer: '#ffffff',
          colorText: '#1e1826',
          colorBorder: '#c8dcd6',
          borderRadius: 10,
          fontFamily: 'system-ui, -apple-system, sans-serif',
        },
        components: {
          Table: { headerBg: '#f7faf8', rowHoverBg: '#faf8ff' },
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
