import { ArrowRight, CircleAlert, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ErrorState, IndustryBadge, LoadingState, SectionTitle, StatusBadge } from '../components/ui'
import { departments, industryMeta, marketingTools } from '../data/catalog'
import { useRemote } from '../hooks/useRemote'
import { api } from '../lib/api'
import type { DashboardData } from '../types'

const departmentOrder = ['content', 'marketing', 'avatar', 'medical', 'drama', 'consulting', 'taoism', 'culture_legal']

export default function DashboardPage() {
  const dashboard = useRemote(() => api.get<DashboardData>('/dashboard'), [])
  const data = dashboard.data
  const agentsByDepartment = new Map((data?.agents_by_department ?? []).map((item) => [item.department, item.count]))
  const activeJobs = data?.active_jobs ?? ((data?.jobs_by_status?.queued ?? 0) + (data?.jobs_by_status?.running ?? 0))
  const blockedJobs = data?.blocked_jobs ?? (data?.jobs_by_status?.gate_blocked ?? 0)

  return <>
    <section className="dashboard-hero">
      <div className="dashboard-hero-copy">
        <div className="dept-tag"><i />集团楼层 · GROUP FLOORS</div>
        <h1>一句话派活，<br />行家出手。</h1>
        <p>聚焦医疗器械、AI 短剧、AI 咨询与传统文化四个高门槛行业，以结构化工作流组织内容中台与数字人能力。</p>
        <div className="hero-actions"><Link className="btn btn-gold" to="/tasks/new"><Plus size={16} />下达新任务</Link><Link className="btn btn-line" to="/tasks">查看任务账本<ArrowRight size={15} /></Link></div>
      </div>
      <aside className="dashboard-signal">
        <div><div className="dashboard-signal-label">LIVE OPERATIONS · 真实状态</div><h2>集团运行看板</h2></div>
        {dashboard.loading ? <LoadingState label="正在读取运行数据…" /> : dashboard.error ? <div><CircleAlert size={24} /><p style={{ marginTop: 8 }}>后端尚未连接，运行数字不做演示填充。</p></div> : <div>
          <div className="dashboard-signal-grid">
            <div><b>{data?.total_agents ?? data?.enabled_agent_count ?? data?.agent_count ?? 0}</b><span>已启用 AgentDefinition</span></div>
            <div><b>{activeJobs ?? 0}</b><span>运行中任务</span></div>
            <div><b>{data?.pending_reviews ?? 0}</b><span>待人工审批</span></div>
            <div><b>{blockedJobs ?? 0}</b><span>质检拦截</span></div>
          </div>
          <div className="source-caption">数据源：后端权威任务账本 · 不使用“158 位员工”等营销桩数</div>
        </div>}
      </aside>
    </section>

    {dashboard.error ? <div style={{ marginTop: 24 }}><ErrorState message={dashboard.error} onRetry={dashboard.reload} /></div> : null}

    <SectionTitle index="01" title="通用能力与工作台" />
    <div className="grid-dept">
      {departmentOrder.slice(0, 3).map((key) => {
        const meta = industryMeta[key]
        const seed = departments[key]
        const route = key === 'marketing' ? '/marketing' : key === 'avatar' ? '/avatar' : `/departments/${key}`
        const knownCount = seed?.roles.length ?? 0
        const agentCount = agentsByDepartment.get(meta.label)
        return <Link className="dept-card" to={route} key={key}><div className="band" style={{ background: meta.color }} /><div className="pad">
          <div className="dc-top"><div className="dc-ic" style={{ background: meta.color }}>{meta.glyph}</div><div><h3>{meta.label}</h3><div className="dc-sub">{meta.eyebrow}</div></div></div>
          <p>{seed?.description ?? '把增长动作组织成有来源、可审批、可复盘的任务。'}</p>
          <div className="dc-foot"><span className="dc-count"><b>{key === 'marketing' ? marketingTools.length : (agentCount ?? (knownCount || '—'))}</b> {key === 'marketing' ? '工具定义' : '岗位定义'}</span><span className="dc-go">进入 <ArrowRight size={13} /></span></div>
        </div></Link>
      })}
    </div>

    <SectionTitle index="02" title="垂直行业专家团" />
    <p className="muted" style={{ margin: '-8px 0 18px', fontSize: 13 }}>做深不做广。每个行业使用独立、版本化 DAG 与合规政策包。</p>
    <div className="grid-dept">
      {departmentOrder.slice(3).map((key) => {
        const meta = industryMeta[key]
        const seed = departments[key]
        const agentCount = agentsByDepartment.get(meta.label)
        return <Link className="dept-card" to={`/departments/${key}`} key={key}><div className="band" style={{ background: meta.color }} /><div className="pad">
          <div className="dc-top"><div className="dc-ic" style={{ background: meta.color }}>{meta.glyph}</div><div><h3>{meta.label}</h3><div className="dc-sub">{meta.eyebrow} · {seed.roles.length} 岗</div></div></div>
          <p>{seed.description}</p>
          <div className="dc-foot"><span className="dc-count"><b>{agentCount ?? seed.roles.length}</b> 岗位定义</span><span className="dc-go">进入 <ArrowRight size={13} /></span></div>
        </div></Link>
      })}
    </div>

    <SectionTitle index="03" title="最近任务" action={<Link className="more" to="/tasks">查看完整账本 →</Link>} />
    {dashboard.loading ? <LoadingState /> : data?.recent_jobs?.length ? <div className="job-card-list">{data.recent_jobs.slice(0, 5).map((job) => <Link className="job-card" to={`/jobs/${job.id}`} key={job.id}><div><h3>{job.title}</h3><div className="job-card-meta"><IndustryBadge industry={job.industry} /><StatusBadge status={job.status} /><span className="muted mono">#{job.display_id ?? job.id.slice(0, 8)}</span></div></div><aside><b className="mono">v{job.version}</b><small>{new Date(job.updated_at).toLocaleString('zh-CN', { hour12: false })}</small></aside></Link>)}</div> : <div className="empty-state"><div className="empty-glyph">任</div><h3>还没有真实任务</h3><p>创建第一条任务后，运行状态、审批和质检结果会出现在这里。</p><div className="empty-actions"><Link className="btn btn-solid" to="/tasks/new">创建第一条任务</Link></div></div>}
  </>
}
