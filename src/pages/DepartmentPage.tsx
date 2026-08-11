import { ArrowRight, GitBranch, ShieldCheck } from 'lucide-react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { ErrorState, InlineNotice, LoadingState, PageHeader, SectionTitle, StatusBadge } from '../components/ui'
import { departments, industryMeta } from '../data/catalog'
import { useRemote } from '../hooks/useRemote'
import { api } from '../lib/api'
import type { AgentDefinition, WorkflowDefinition } from '../types'

const nodeTypeLabel: Record<string, string> = { serial: '串行', parallel: '并行', optional: '可选', human: '人工', gate: '门禁' }
const workflowKindType: Record<string, NonNullable<WorkflowDefinition['nodes'][number]['type']>> = {
  agent: 'serial',
  approval: 'human',
  compliance: 'gate',
  expert_review: 'human',
}
const normalizeAgentName = (value: string) => value.replace(/\s+/g, '').toLowerCase()

export default function DepartmentPage() {
  const { industry } = useParams()
  const seed = industry ? departments[industry] : undefined
  const meta = industry ? industryMeta[industry] : undefined
  const remote = useRemote(async () => {
    const [agents, workflows] = await Promise.all([
      api.get<AgentDefinition[]>(`/agents?industry=${encodeURIComponent(industry ?? '')}`),
      api.get<WorkflowDefinition[]>(`/workflows?industry=${encodeURIComponent(industry ?? '')}`),
    ])
    return { agents, workflows }
  }, [industry])
  if (!seed || !meta) return <Navigate to="/app" replace />

  const byCode = new Map((remote.data?.agents ?? []).flatMap((agent) => [
    [agent.code ?? '', agent] as const,
    [agent.name, agent] as const,
    [normalizeAgentName(agent.name), agent] as const,
  ]))
  const workflow = remote.data?.workflows?.[0]
  const flow = workflow?.nodes?.length ? workflow.nodes.map((node) => ({
    ...node,
    type: node.optional ? 'optional' as const : node.type ?? workflowKindType[node.kind ?? 'agent'] ?? 'serial',
    required: !node.optional,
  })) : seed.flow
  const enabledCount = remote.data?.agents.filter((agent) => agent.enabled !== false).length

  return <>
    <PageHeader eyebrow={`${meta.label} · ${meta.eyebrow}`} title={seed.headline} description={seed.description} crumbs={<><Link to="/app">集团楼层</Link> / <b>{meta.label}</b></>} actions={<Link className="btn btn-gold" to={`/tasks/new?industry=${seed.industry}`}>＋ 派给本部门</Link>} />
    {remote.error ? <ErrorState message={`${remote.error}；下方仍展示已冻结的岗位与 DAG 契约，不显示运行状态。`} onRetry={remote.reload} /> : null}
    <div className="statbar" style={{ marginTop: remote.error ? 20 : 0 }}>
      <div className="st"><b>{seed.roles.length}</b><span>已冻结岗位定义</span></div>
      <div className="st"><b>{enabledCount ?? '—'}</b><span>后端已启用 Agent</span></div>
      <div className="st"><b>{flow.length}</b><span>当前工作流节点</span></div>
      <div className="st"><b className="small-stat">{workflow ? `v${workflow.definition_version ?? workflow.version ?? '1.0.0'}` : '契约基线'}</b><span>WorkflowDefinition</span></div>
    </div>

    {industry === 'medical' ? <div className="panel department-note" style={{ borderLeft: '3px solid var(--bad)' }}><h3 className="danger-text"><ShieldCheck size={17} /> 五层医疗防护</h3><div className="five-layer-grid"><div><b>岗位层</b><p>法规知识包和工具白名单。</p></div><div><b>证据层</b><p>注册、适用范围和结论来源。</p></div><div><b>流程层</b><p>服务端、编排器与交付出口锁定。</p></div><div><b>签发层</b><p>高风险交付需授权专家签发。</p></div><div><b>表述层</b><p>命中必须删改或补证，提示语不代替修正。</p></div></div></div> : <InlineNotice tone={industry === 'taoism' ? 'warning' : 'info'} title="行业契约">{seed.note}</InlineNotice>}

    <SectionTitle index="流" title="版本化行业 DAG" />
    <div className="dag-key"><span>串行</span><span className="parallel">并行/条件</span><span className="human">人工节点</span><span className="gate">行业门禁</span></div>
    <div className="pipe app-pipe" role="list" aria-label={`${meta.label}工作流`}>
      {flow.map((node) => <div className={`pnode ${node.type === 'gate' ? 'failed' : node.type === 'human' ? 'review' : 'wait'}`} role="listitem" key={node.id}><span className="pn-type">{nodeTypeLabel[node.type ?? 'serial']}</span><div className="pn-av">{node.glyph ?? node.name.slice(0, 1)}</div><div className="pn-name">{node.name}</div><div className="pn-st">{node.depends_on?.length ? `依赖 ${node.depends_on.length} 项` : '入口'}</div></div>)}
    </div>
    <p className="field-help"><GitBranch size={12} style={{ verticalAlign: -2 }} /> 这里展示工作流定义，不展示某条任务的运行状态；真实状态请进入工单详情查看 StageRun。</p>

    <SectionTitle index="编" title={`岗位编制 · ${seed.roles.length} 岗`} />
    {remote.loading ? <LoadingState label="正在关联 AgentDefinition…" /> : null}
    <div className="grid-seat">
      {seed.roles.map((role) => {
        const agent = byCode.get(role.code) ?? byCode.get(role.name) ?? byCode.get(normalizeAgentName(role.name))
        const card = <article className="seat agent-card"><div className="s-band" style={{ background: meta.color }} /><div className="s-top"><div className="s-av" style={{ background: meta.color }}>{role.glyph}</div><div><div className="s-name">{role.name}</div><div className="s-role">{role.group}</div></div></div><p>{role.description}</p><div className="s-foot"><span className="s-num">{role.code}</span>{agent ? <StatusBadge status={agent.enabled === false ? 'disabled' : 'enabled'} label={agent.enabled === false ? '已停用' : '已启用'} /> : <span className="badge b-wait">未载入状态</span>}</div>{agent ? <div className="agent-skills">{agent.prompt_version ? <span className="mini-tag">Prompt {agent.prompt_version}</span> : null}{agent.knowledge_packs?.slice(0, 2).map((pack) => <span className="mini-tag" key={pack}>{pack}</span>)}</div> : null}</article>
        return agent ? <Link to={`/agents/${agent.id}`} key={role.code}>{card}</Link> : <div key={role.code}>{card}</div>
      })}
    </div>
    <div style={{ marginTop: 30 }}><Link className="btn btn-line" to={`/tasks/new?industry=${industry}`}>给本部门下达任务 <ArrowRight size={14} /></Link></div>
  </>
}
