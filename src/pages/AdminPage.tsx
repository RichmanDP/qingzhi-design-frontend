import { Activity, Database, Server, ShieldCheck } from 'lucide-react'
import { useRemote } from '../hooks/useRemote'
import { api } from '../lib/api'
import { ErrorState, InlineNotice, LoadingState, PageHeader, RelativeTime, SectionTitle, StatusBadge } from '../components/ui'
import type { AuditEvent, DashboardData } from '../types'

interface HealthData { status: string; database?: string; worker?: string; queue?: string; version?: string; capabilities?: Record<string, string> }

export default function AdminPage() {
  const remote = useRemote(async () => {
    const healthPromise = fetch(api.healthUrl(), { headers: { Accept: 'application/json' } }).then(async (response) => { if (!response.ok) throw new Error(`健康检查 HTTP ${response.status}`); return response.json() as Promise<HealthData> })
    const [health, dashboard, audit] = await Promise.all([healthPromise, api.get<DashboardData>('/dashboard'), api.get<AuditEvent[]>('/audit-events')])
    return { health, dashboard, audit }
  }, [])
  if (remote.loading) return <LoadingState label="正在读取运行状态与审计…" />
  if (remote.error || !remote.data) return <><PageHeader title="运维审计" /><ErrorState message={remote.error ?? '无法读取运维状态'} onRetry={remote.reload} /></>
  const { health, dashboard, audit } = remote.data
  const activeJobs = dashboard.active_jobs ?? ((dashboard.jobs_by_status?.queued ?? 0) + (dashboard.jobs_by_status?.running ?? 0))
  const blockedJobs = dashboard.blocked_jobs ?? (dashboard.jobs_by_status?.gate_blocked ?? 0)
  return <>
    <PageHeader eyebrow="只读运维面板 · ADMIN" title="运行状态与审计" description="本页显示本地候选版的数据库、Worker、队列、能力状态和关键操作审计；不把本地健康等同于生产门禁通过。" />
    <InlineNotice tone="warning" title="不是生产批准">备份恢复、安全隔离、真实导出、通知和浏览器 E2E 尚需各自验收；健康状态只说明当前进程可响应。</InlineNotice>
    <SectionTitle index="运" title="组件状态" />
    <div className="connector-grid"><article className="connector-card"><header><h3><Server size={16} /> API</h3><StatusBadge status={health.status === 'ok' || health.status === 'healthy' ? 'active' : health.status} /></header><p>版本 {health.version ?? 'local candidate'}</p></article><article className="connector-card"><header><h3><Database size={16} /> 数据库</h3><StatusBadge status={health.database ?? 'active'} /></header><p>权威任务、版本、账本和审计持久化。</p></article><article className="connector-card"><header><h3><Activity size={16} /> Worker / Queue</h3><StatusBadge status={health.worker ?? health.queue ?? 'mock'} /></header><p>运行任务 {activeJobs} · 待审批 {dashboard.pending_reviews}</p></article><article className="connector-card"><header><h3><ShieldCheck size={16} /> Gate</h3><StatusBadge status="active" label={`${blockedJobs} 条阻断`} /></header><p>医疗高风险 override 在服务端策略中不存在。</p></article></div>
    {health.capabilities ? <><SectionTitle index="能" title="能力状态" /><div className="table-wrap"><table className="data-table"><thead><tr><th>能力</th><th>状态</th><th>含义</th></tr></thead><tbody>{Object.entries(health.capabilities).map(([name, status]) => <tr key={name}><td className="mono">{name}</td><td><StatusBadge status={status} /></td><td>{status === 'available' ? '本地可真实执行' : status === 'mock' ? '结构和状态机真实，产物由 Mock Provider 生成' : status === 'unconfigured' ? '适配器存在但未配置，调用会安全失败' : '被政策关闭'}</td></tr>)}</tbody></table></div></> : null}
    <SectionTitle index="审" title="关键操作审计" />
    <div className="table-wrap"><table className="data-table"><thead><tr><th>事件</th><th>动作</th><th>执行者</th><th>资源</th><th>时间</th></tr></thead><tbody>{audit.map((event) => <tr key={event.id}><td className="mono">{event.id.slice(0, 12)}</td><td className="mono">{event.action}</td><td>{event.actor ?? event.actor_id ?? 'system'}</td><td>{event.summary ?? `${event.resource_type ?? 'resource'} · ${event.resource_id?.slice(0, 12) ?? '—'}`}</td><td><RelativeTime value={event.created_at} /></td></tr>)}</tbody></table></div>
  </>
}
