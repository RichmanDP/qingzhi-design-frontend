import { Plus, Shield } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { EmptyState, ErrorState, InlineNotice, LoadingState, PageHeader, PrimaryButton, RelativeTime, StatusBadge } from '../components/ui'
import { useRemote } from '../hooks/useRemote'
import { api, humanError } from '../lib/api'

interface TeamMember {
  id: string
  email: string
  name?: string
  role: string
  permissions?: string[]
  industries?: string[]
  modules?: string[]
  actions?: string[]
  active?: boolean
  status?: string
  created_at?: string
}

interface TeamRole { id: string; name: string }
interface TeamResponse {
  tenant: { id: string; name: string; slug: string }
  members: TeamMember[]
  roles: TeamRole[]
}

const supportedRoles: TeamRole[] = [
  { id: 'viewer', name: '只读成员' },
  { id: 'member', name: '任务成员' },
  { id: 'operator', name: '任务操作员' },
  { id: 'reviewer', name: '审批人' },
  { id: 'medical_signer', name: '医疗签发人' },
  { id: 'admin', name: '租户管理员' },
]

export default function TeamPage() {
  const team = useRemote(() => api.get<TeamResponse>('/team'), [])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ email: '', name: '', password: '', role: 'reviewer', permissions: [] as string[] })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null)
    try { await api.post('/team/members', form, true); setShowForm(false); setForm({ email: '', name: '', password: '', role: 'reviewer', permissions: [] }); await team.reload() }
    catch (reason) { setError(humanError(reason)) } finally { setBusy(false) }
  }

  const roles = supportedRoles.map((fallback) => team.data?.roles.find((role) => role.id === fallback.id) ?? fallback)
  const extraRoles = (team.data?.roles ?? []).filter((role) => !supportedRoles.some((supported) => supported.id === role.id))
  const roleOptions = [...roles, ...extraRoles]
  const roleNames = new Map(roleOptions.map((role) => [role.id, role.name]))
  const members = team.data?.members ?? []

  return <>
    <PageHeader eyebrow="租户与最小权限 · TEAM" title="团队与权限" description={`${team.data?.tenant.name ?? '当前企业'}${team.data?.tenant.slug ? `（${team.data.tenant.slug}）` : ''}的成员与角色。前端可见性不等于授权，服务端会重新校验租户和角色。`} actions={<button className="btn btn-gold" onClick={() => setShowForm((value) => !value)}><Plus size={15} />添加成员</button>} />
    <InlineNotice tone="info" title="当前权限口径">角色由服务端路由先行校验；配置行业、模块、动作或 legacy permission 后，主要业务写接口会进一步按 allowlist 收口。未配置的维度继续由角色决定。专家签发仍需显式角色，任何角色都不能绕过医疗高风险 Gate。</InlineNotice>
    {showForm ? <form className="panel form-panel" onSubmit={create} style={{ marginTop: 20 }}>
      <div className="form-grid">
        <div className="field-group"><label htmlFor="member-email">邮箱</label><input id="member-email" className="field" type="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></div>
        <div className="field-group"><label htmlFor="member-name">姓名</label><input id="member-name" className="field" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div>
        <div className="field-group"><label htmlFor="member-password">初始密码</label><input id="member-password" className="field" type="password" minLength={8} required value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></div>
        <div className="field-group"><label htmlFor="member-role">服务端角色</label><select id="member-role" className="field" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>{roleOptions.map((role) => <option value={role.id} key={role.id}>{role.name}</option>)}</select><div className="field-help">角色决定基础权限；通过 API 配置的范围会限制主要业务写入。当前表单只创建角色成员，细粒度范围可由集成接口设置。</div></div>
      </div>
      {error ? <InlineNotice tone="danger" title="添加失败">{error}</InlineNotice> : null}
      <div className="form-actions"><button type="button" className="btn btn-line" onClick={() => setShowForm(false)}>取消</button><PrimaryButton type="submit" busy={busy}>添加本地成员</PrimaryButton></div>
    </form> : null}
    <div style={{ marginTop: 22 }}>{team.loading ? <LoadingState /> : team.error ? <ErrorState message={team.error} onRetry={team.reload} /> : members.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>成员</th><th>服务端角色</th><th>细粒度写入范围</th><th>状态</th><th>加入时间</th></tr></thead><tbody>{members.map((member) => { const recordedScopes = [...(member.industries ?? []).map((value) => `行业:${value}`), ...(member.modules ?? []).map((value) => `模块:${value}`), ...(member.actions ?? []).map((value) => `动作:${value}`), ...(member.permissions ?? []).filter((value) => !value.startsWith('industry:') && !value.startsWith('module:') && !value.startsWith('action:'))]; const active = member.active !== false && member.status !== 'disabled'; return <tr key={member.id}><td className="row-title"><b>{member.name ?? member.email}</b><small>{member.email}</small></td><td><Shield size={14} style={{ verticalAlign: -2 }} /> {roleNames.get(member.role) ?? member.role}</td><td>{recordedScopes.length ? recordedScopes.join(' · ') : '未设置；由角色决定'}</td><td><StatusBadge status={active ? 'active' : 'disabled'} label={active ? '启用' : '停用'} /></td><td><RelativeTime value={member.created_at} /></td></tr> })}</tbody></table></div> : <EmptyState title="暂无团队成员" description="本地管理员通常会作为第一位成员。" />}</div>
  </>
}
