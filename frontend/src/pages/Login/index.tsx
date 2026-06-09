import { LockOutlined } from '@ant-design/icons'
import { Button, Input, message } from 'antd'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login } from '@/api'

export default function Login() {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleLogin = async () => {
    if (!code.trim()) return
    setLoading(true)
    try {
      await login(code.trim())
      localStorage.setItem('selftend_code', code.trim())
      navigate('/', { replace: true })
    } catch {
      message.error('访问码错误')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100svh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f4f9f7',
      }}
    >
      <div
        style={{
          width: 340,
          background: '#fff',
          borderRadius: 20,
          padding: '40px 32px',
          boxShadow: '0 4px 24px rgba(74,138,131,0.10)',
          border: '1.5px solid #c8dcd6',
          textAlign: 'center',
        }}
      >
        {/* Logo */}
        <div style={{ fontSize: 36, marginBottom: 8, color: '#4a8a83' }}>◈</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#1e1826', marginBottom: 4 }}>
          SelfTend
        </div>
        <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 32 }}>
          输入访问码进入
        </div>

        {/* 输入框 */}
        <Input
          prefix={<LockOutlined style={{ color: '#b8d8d3' }} />}
          placeholder="访问码"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onPressEnter={handleLogin}
          size="large"
          type="password"
          style={{ marginBottom: 16, borderRadius: 10 }}
        />

        <Button
          type="primary"
          size="large"
          block
          loading={loading}
          onClick={handleLogin}
          style={{ borderRadius: 10 }}
        >
          进入
        </Button>
      </div>
    </div>
  )
}
