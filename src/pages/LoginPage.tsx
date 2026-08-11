import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { api, humanError } from '../lib/api'
import { GoldButton, InlineNotice } from '../components/ui'
import { useSession } from '../components/session'

export default function LoginPage() {
  const { authenticated, setSession } = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestedFrom = (location.state as { from?: string } | null)?.from
  const safeFrom = requestedFrom?.startsWith('/') && !requestedFrom.startsWith('//') ? requestedFrom : '/app'
  if (authenticated) return <Navigate to={safeFrom} replace />

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const result = await api.login(email, password)
      setSession(result.access_token, email)
      navigate(safeFrom, { replace: true })
    } catch (reason) {
      setError(humanError(reason))
    } finally {
      setBusy(false)
    }
  }

  return <div className="login-page">
    <section className="login-brand">
      <div className="brand"><b>擎智集团</b><span>QINGZHI</span></div>
      <div><h1>一句话派活，<br />行家出手。</h1><p>任务不是一段不可追溯的聊天，而是一条有输入、版本、证据、风险和验收契约的工作流。</p></div>
      <small>开源前端 · 需要兼容的 QINGZHI API</small>
    </section>
    <section className="login-form-area">
      <form className="login-card" onSubmit={submit}>
        <h2>进入集团</h2>
        <p>使用 API 服务提供的账号登录。数据持久化与权限边界由服务端负责。</p>
        {error ? <InlineNotice tone="danger" title="登录失败">{error}</InlineNotice> : null}
        <div className="field-group" style={{ marginTop: error ? 18 : 0 }}><label htmlFor="email">邮箱</label><input className="field" id="email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></div>
        <div className="field-group"><label htmlFor="password">密码</label><input className="field" id="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></div>
        <GoldButton type="submit" busy={busy}>登录并连接 API</GoldButton>
        <div className="login-hint"><b>前端仓库不提供默认账号</b><br />请向 API 部署方获取账号。不要把密码或 Token 写入前端环境变量。</div>
      </form>
    </section>
  </div>
}
