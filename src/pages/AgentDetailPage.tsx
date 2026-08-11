import { Link, useParams } from 'react-router-dom'
import { EmptyState, ErrorState, IndustryBadge, LoadingState, PageHeader, SectionTitle, StatusBadge } from '../components/ui'
import { useRemote } from '../hooks/useRemote'
import { api } from '../lib/api'
import type { AgentDefinition, Job } from '../types'

export default function AgentDetailPage() {
  const { id } = useParams()
  const remote = useRemote(async () => {
    const [agent, jobs] = await Promise.all([api.get<AgentDefinition>(`/agents/${id}`), api.get<Job[]>(`/jobs?agent_id=${encodeURIComponent(id ?? '')}`)])
    return { agent, jobs }
  }, [id])
  if (remote.loading) return <LoadingState label="正在读取员工定义…" />
  if (remote.error || !remote.data) return <ErrorState message={remote.error ?? '员工不存在'} onRetry={remote.reload} />
  const { agent, jobs } = remote.data
  return <>
    <PageHeader eyebrow={`${agent.department} · ${agent.code ?? agent.id}`} title={agent.name} description={agent.description ?? agent.summary ?? agent.role_summary ?? '版本化数字员工定义'} crumbs={<><Link to={`/departments/${agent.industry}`}>部门</Link> / <b>{agent.name}</b></>} actions={<Link className="btn btn-gold" to={`/tasks/new?industry=${agent.industry}`}>派一个活</Link>} />
    <div className="job-summary"><IndustryBadge industry={agent.industry} /><StatusBadge status={agent.enabled === false ? 'disabled' : 'enabled'} label={agent.enabled === false ? '已停用' : '已启用'} /><span className="badge b-wait">Prompt {agent.prompt_version ?? '未版本化'}</span><span className="badge b-wait">Policy {agent.policy_version ?? '未绑定'}</span></div>
    <div className="split" style={{ marginTop: 26 }}>
      <section className="panel"><h3>职责与能力边界</h3><p>{agent.description ?? agent.summary ?? agent.role_summary}</p><SectionTitle index="能" title="能力" /><div className="agent-skills">{agent.capabilities?.length ? agent.capabilities.map((item) => <span className="mini-tag" key={item}>{item}</span>) : <span className="muted">尚未配置能力标签</span>}</div><SectionTitle index="技" title="技能" /><div className="agent-skills">{agent.skills?.length ? agent.skills.map((item) => <span className="mini-tag" key={item}>{item}</span>) : <span className="muted">尚未配置技能</span>}</div></section>
      <aside className="panel"><h3>执行策略</h3><dl className="key-value"><dt>模型策略</dt><dd>{typeof agent.model_policy === 'string' ? agent.model_policy : agent.model_policy ? JSON.stringify(agent.model_policy) : 'Mock Provider / 待配置'}</dd><dt>Prompt 版本</dt><dd>{agent.prompt_version ?? '—'}</dd><dt>政策版本</dt><dd>{agent.policy_version ?? '—'}</dd><dt>风险策略</dt><dd>{typeof agent.risk_policy === 'string' ? agent.risk_policy : agent.risk_policy ? JSON.stringify(agent.risk_policy) : '遵循工作流 Gate'}</dd><dt>历史运行</dt><dd>{agent.run_count ?? jobs.length}</dd></dl><SectionTitle index="具" title="工具白名单" /><div className="agent-skills">{agent.tools?.length ? agent.tools.map((item) => <span className="mini-tag" key={item}>{item}</span>) : <span className="muted">无外部工具</span>}</div><SectionTitle index="知" title="知识包" /><div className="agent-skills">{(agent.knowledge_packs ?? agent.knowledge_pack_ids)?.length ? (agent.knowledge_packs ?? agent.knowledge_pack_ids)!.map((item) => <span className="mini-tag" key={item}>{item}</span>) : <span className="muted">尚未绑定</span>}</div></aside>
    </div>
    <SectionTitle index="历" title="历史产出" />
    {jobs.length ? <div className="job-card-list">{jobs.map((job) => <Link className="job-card" key={job.id} to={`/jobs/${job.id}`}><div><h3>{job.title}</h3><div className="job-card-meta"><IndustryBadge industry={job.industry} /><StatusBadge status={job.status} /></div></div><aside className="mono">v{job.version}</aside></Link>)}</div> : <EmptyState title="暂无历史产出" description="只有真实 StageRun 关联到该 Agent 后，任务才会出现在这里。" />}
  </>
}
