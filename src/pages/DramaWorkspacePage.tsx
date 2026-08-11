import { useState } from 'react'
import { CheckCircle2, Clapperboard, FileCheck2, Fingerprint, GitBranch, LockKeyhole, Play, ServerCog, ShieldAlert, XCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EmptyState, ErrorState, LoadingState, PageHeader, SectionTitle, StatusBadge } from '../components/ui'
import { useRemote } from '../hooks/useRemote'
import { api, humanError } from '../lib/api'
import type {
  ApiMeta,
  AgentRevision,
  CCSwitchDiscovery,
  DramaDocumentVersion,
  DramaGate,
  DramaGate1Readiness,
  DramaProject,
  DramaRun,
  GenerationRun,
  Job,
  ProviderHealth,
  WorkflowDefinition,
} from '../types'
import DramaReleaseEvidence from './DramaReleaseEvidence'
import './DramaWorkspacePage.css'

const pilotSpec = [
  { label: '市场 / 语言', value: 'US / en-US' },
  { label: '发布平台', value: 'TikTok + YouTube Shorts' },
  { label: '试制规模', value: '3 集 × 60±5 秒' },
  { label: '画面规格', value: '9:16 / 原生 480p' },
  { label: '人工环节', value: '精剪 + 发布' },
]

const mandatoryGates = [
  { id: 'GATE 1', title: '原创与剧本锁定', detail: '锁定调研快照、融合方案、Series Bible、三集 en-US 剧本与原创性报告。' },
  { id: 'GATE 2', title: '核心资产锁定', detail: '锁定角色、世界、地点、服化道、合成音色、权利记录、资产清单与生成预算。' },
  { id: 'GATE 3', title: '人工精剪最终成片锁定', detail: '精确绑定三集最终 MP4 哈希、最终合规报告、成本结算与双平台发布包。' },
]

const generationStatusLabel: Record<string, string> = {
  prepared: '已准备', running: '运行中', succeeded: '已回报成功', failed: '失败', unknown: '待对账', cancelled: '已取消',
}

function ccPresentation(discovery: CCSwitchDiscovery) {
  const healthy = discovery.health?.status === 'healthy'
  if (healthy && discovery.models.length === 0) {
    return {
      status: 'needs_user_setup',
      label: 'needs_user_setup',
      detail: 'CC Switch 健康，但模型目录为空。请由用户在 CC Switch 内启用路由并选择模型；擎智不会代改其全局配置。',
    }
  }
  if (discovery.status === 'ready' && discovery.models.length > 0) {
    return {
      status: 'ready',
      label: '目录可见',
      detail: `已发现 ${discovery.models.length} 个模型。目录发现只证明路由可见，不是模型推理成功证据。`,
    }
  }
  if (discovery.status === 'needs_user_setup') {
    return {
      status: 'needs_user_setup',
      label: 'needs_user_setup',
      detail: discovery.message ?? 'CC Switch 需要用户完成路由与模型选择。',
    }
  }
  return {
    status: discovery.status,
    label: discovery.status === 'stopped' ? '未运行' : '发现异常',
    detail: discovery.message ?? '当前无法确认 CC Switch 路由与模型目录。',
  }
}

function ProviderReadiness({ discovery, providerHealth }: { discovery: CCSwitchDiscovery; providerHealth: ProviderHealth }) {
  const cc = ccPresentation(discovery)
  const codex = providerHealth.providers.find((provider) => provider.id === 'codex-research')
  const codexRecorded = codex?.status === 'evidence_recorded'
  const codexResearchEligible = codexRecorded && codex.gate_1_eligible === true
  const codexDetail = codexRecorded
    ? codexResearchEligible
      ? `已记录 ${codex.web_search_event_count ?? 0} 个 Web Search 事件、${codex.source_count ?? 0} 个公开来源，覆盖 ${codex.distinct_work_count ?? 0} 个独立作品；研究输入结构门槛已满足，但仍需融合计划、Bible、三集成稿、原创报告和人工审批。`
      : `已记录 ${codex.web_search_event_count ?? 0} 个 Web Search 事件、${codex.source_count ?? 0} 个公开来源；当前证据仍不足以单独通过 Gate 1。`
    : (codex?.reason ?? '尚无实时检索 EvidenceBundle 与来源链。')
  return <section className="drama-control-panel" aria-labelledby="drama-provider-title">
    <header>
      <div><ServerCog size={18} /><h3 id="drama-provider-title">外部能力实跑状态</h3></div>
      <StatusBadge status={cc.status} label={cc.label} />
    </header>
    <div className="drama-cc-summary">
      <b>CC Switch 路由发现</b>
      <p>{cc.detail}</p>
      <dl>
        <div><dt>Loopback</dt><dd className="mono">{discovery.base_url}</dd></div>
        <div><dt>目录指纹</dt><dd className="mono">{discovery.catalog_fingerprint?.slice(0, 16) ?? '—'}</dd></div>
      </dl>
      {discovery.models.length > 0 ? <div className="drama-model-list" aria-label="CC Switch 模型目录">
        {discovery.models.slice(0, 6).map((model) => <span className="mini-tag mono" key={model.id}>{model.id}</span>)}
        {discovery.models.length > 6 ? <span className="mini-tag">+{discovery.models.length - 6}</span> : null}
      </div> : null}
    </div>
    <ul className="drama-readiness-list">
      <li><div><b>Model 推理</b><p>尚无可验收的真实模型调用回执；模型目录或 HTTP 200 均不算实跑。</p></div><span>未实跑</span></li>
      <li><div><b>Codex Research</b><p>{codexDetail}</p></div><span className={codexRecorded ? 'recorded' : undefined}>{codexResearchEligible ? '研究输入合格' : codexRecorded ? '真实收据已记录' : '未实跑'}</span></li>
      <li><div><b>LibTV 三集生成</b><p>尚无付费运行回执、落盘媒体、哈希与成本对账。</p></div><span>未实跑</span></li>
    </ul>
  </section>
}

function WorkflowContract({ workflows }: { workflows: WorkflowDefinition[] }) {
  if (!workflows.length) return <section className="drama-control-panel drama-empty-panel" aria-labelledby="drama-workflow-title">
    <header><div><GitBranch size={18} /><h3 id="drama-workflow-title">当前短剧 WorkflowDefinition</h3></div></header>
    <EmptyState title="尚无短剧工作流定义" description="冻结试制规格仍可检查，但此时不能声称工作流已落库或可执行。" />
  </section>

  const workflow = workflows[0]
  const mandatoryNodes = workflow.nodes.filter((node) => node.mandatory_review)
  return <section className="drama-control-panel" aria-labelledby="drama-workflow-title">
    <header>
      <div><GitBranch size={18} /><h3 id="drama-workflow-title">当前短剧 WorkflowDefinition</h3></div>
      <StatusBadge status={workflow.enabled === false ? 'disabled' : 'enabled'} label={workflow.enabled === false ? '已停用' : '已启用'} />
    </header>
    <div className="drama-workflow-meta">
      <div><span>定义</span><b>{workflow.name}</b></div>
      <div><span>版本</span><b className="mono">v{workflow.definition_version ?? workflow.version ?? '—'}</b></div>
      <div><span>节点</span><b>{workflow.nodes.length}</b></div>
      <div><span>mandatory_review</span><b>{mandatoryNodes.length}</b></div>
    </div>
    <ol className="drama-node-list" aria-label="短剧工作流节点">
      {workflow.nodes.map((node, index) => <li key={node.id}>
        <span className="mono">{String(index + 1).padStart(2, '0')}</span>
        <div><b>{node.name}</b><small className="mono">{node.id}</small></div>
        {node.mandatory_review ? <span className="drama-mandatory">强制人工</span> : <span className="muted">{node.kind ?? node.type ?? 'agent'}</span>}
      </li>)}
    </ol>
    <p className="drama-contract-note">冻结试制规格要求三道强制 Gate；这里仅呈现服务端当前定义，不用页面常量补造已落库节点。</p>
  </section>
}

function orderedJobs(jobs: Job[]) {
  const children = new Map<string, Job[]>()
  for (const job of jobs) {
    if (!job.parent_job_id) continue
    const rows = children.get(job.parent_job_id) ?? []
    rows.push(job)
    children.set(job.parent_job_id, rows)
  }
  const roots = jobs.filter((job) => !job.parent_job_id)
  const ordered = roots.flatMap((parent) => [parent, ...(children.get(parent.id) ?? [])])
  const seen = new Set(ordered.map((job) => job.id))
  return [...ordered, ...jobs.filter((job) => !seen.has(job.id))]
}

function JobLedger({ jobs, meta }: { jobs: Job[]; meta?: ApiMeta }) {
  if (!jobs.length) return <EmptyState title="还没有短剧 Job" description="从现有 Brief 入口创建第一条短剧任务；本页不会调用尚未落地的 drama-projects 写接口。" action={<Link className="btn btn-solid" to="/tasks/new?industry=drama">创建短剧任务</Link>} />

  const childCounts = new Map<string, number>()
  for (const job of jobs) {
    if (job.parent_job_id) childCounts.set(job.parent_job_id, (childCounts.get(job.parent_job_id) ?? 0) + 1)
  }
  return <>
    <div className="drama-ledger-caption"><span>本页 {jobs.length} 条</span><span>API count {meta?.count ?? jobs.length}</span></div>
    <div className="table-wrap drama-table-wrap">
      <table className="data-table drama-ledger-table">
        <thead><tr><th>层级</th><th>Job</th><th>状态</th><th>关系键</th><th>更新时间</th></tr></thead>
        <tbody>{orderedJobs(jobs).map((job) => {
          const isChild = Boolean(job.parent_job_id)
          const childCount = childCounts.get(job.id) ?? 0
          return <tr key={job.id} className={isChild ? 'drama-child-row' : undefined}>
            <td><span className={`drama-job-kind ${isChild ? 'child' : 'parent'}`}>{isChild ? '子任务' : childCount ? '母任务' : '独立任务'}</span></td>
            <td className="row-title"><Link to={`/jobs/${job.id}`}>{job.title}</Link><small className="mono">#{job.display_id ?? job.id.slice(0, 10)} · run r{job.run_revision ?? 1}</small></td>
            <td><StatusBadge status={job.status} /></td>
            <td className="drama-relation-cell">{isChild ? <><span className="mono">{job.dispatch_key ?? 'dispatch_key 未提供'}</span><small className="mono">parent {job.parent_job_id?.slice(0, 12)}</small></> : childCount ? <><span>{childCount} 个子任务</span><small>等待关系来自服务端字段</small></> : <span className="muted">无母子字段</span>}</td>
            <td><time dateTime={job.updated_at}>{new Date(job.updated_at).toLocaleString('zh-CN', { hour12: false })}</time></td>
          </tr>
        })}</tbody>
      </table>
    </div>
  </>
}

function isMockRun(run: GenerationRun) {
  return JSON.stringify([run.provider, run.mode, run.remote_lineage, run.local_lineage]).toLowerCase().includes('mock')
}

function GenerationLedger({ jobs, runs, meta }: { jobs: Job[]; runs: GenerationRun[]; meta?: ApiMeta }) {
  const jobById = new Map(jobs.map((job) => [job.id, job]))
  const dramaRuns = runs.filter((run) => jobById.has(run.job_id))
  if (!dramaRuns.length) return <EmptyState title="没有可关联的 GenerationRun" description="短剧 Job 即使进入 done，也不会因此升级为真实模型、Research 或 LibTV 生成证据。" />

  return <>
    <div className="drama-ledger-caption"><span>短剧关联 {dramaRuns.length} 条</span><span>租户 API count {meta?.count ?? runs.length}</span></div>
    <div className="table-wrap drama-table-wrap">
      <table className="data-table drama-ledger-table">
        <thead><tr><th>GenerationRun</th><th>关联 Job</th><th>Provider / Mode</th><th>状态</th><th>修订 / 尝试</th><th>证据边界</th></tr></thead>
        <tbody>{dramaRuns.map((run) => {
          const job = jobById.get(run.job_id)
          const mock = isMockRun(run)
          const hasRemoteLineage = Boolean(run.remote_lineage && Object.keys(run.remote_lineage).length)
          return <tr key={run.id}>
            <td className="row-title"><b className="mono">{run.id}</b><small>{run.updated_at ? new Date(run.updated_at).toLocaleString('zh-CN', { hour12: false }) : '无更新时间'}</small></td>
            <td><Link to={`/jobs/${run.job_id}`}>{job?.title ?? run.job_id}</Link><small className="drama-block-small">{job?.parent_job_id ? '子任务' : '母/独立任务'}</small></td>
            <td><b>{run.provider}</b><small className="drama-block-small mono">{run.mode}</small></td>
            <td><StatusBadge status={run.status} label={generationStatusLabel[run.status] ?? run.status} /></td>
            <td><span className="mono">r{run.run_revision}</span><small className="drama-block-small">{run.attempts?.length ?? 0} attempts</small></td>
            <td>{mock ? <span className="drama-evidence-boundary mock">Mock / 候选记录</span> : hasRemoteLineage ? <span className="drama-evidence-boundary review">有远端血缘，仍需核对回执与文件</span> : <span className="drama-evidence-boundary">仅运行账本</span>}</td>
          </tr>
        })}</tbody>
      </table>
    </div>
  </>
}

const requiredEpisodeKeys = ['E01', 'E02', 'E03'] as const

function exactJson(value: unknown) {
  if (value === null || value === undefined) return '—'
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function formatTimestamp(value?: string | null) {
  if (!value) return '—'
  const parsed = new Date(value)
  return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleString('zh-CN', { hour12: false })
}

function hasMockMarker(value: unknown) {
  return exactJson(value).toLowerCase().includes('mock')
}

function DramaRunContract({ project, run }: { project: DramaProject; run: DramaRun }) {
  const spec = run.spec
  return <div className="drama-run-contract-grid">
    <section className="drama-acceptance-panel" aria-labelledby="drama-run-spec-title">
      <header>
        <div><FileCheck2 size={18} /><h3 id="drama-run-spec-title">冻结 DramaRunSpec</h3></div>
        <StatusBadge status={run.status} label={run.status} />
      </header>
      <div className="drama-run-identity">
        <div><span>Project</span><b>{project.title}</b><code>{project.id}</code></div>
        <div><span>Run</span><b>#{run.run_number} · r{run.run_revision}</b><code>{run.id}</code></div>
        <div><span>Parent Job</span><Link to={`/jobs/${run.parent_job_id}`}>{run.parent_job_id}</Link></div>
        <div><span>spec_hash</span><code>{run.spec_hash}</code></div>
      </div>
      <dl className="drama-run-spec-grid">
        <div><dt>market / language</dt><dd>{spec.market} / {spec.language}</dd></div>
        <div><dt>platforms</dt><dd>{spec.platforms.join(' + ')}</dd></div>
        <div><dt>episode_count</dt><dd>{spec.episode_count}</dd></div>
        <div><dt>duration</dt><dd>{spec.target_duration_seconds} ± {spec.duration_tolerance_seconds} 秒</dd></div>
        <div><dt>frame</dt><dd>{spec.aspect_ratio} / {spec.resolution}</dd></div>
        <div><dt>editing / publishing</dt><dd>{spec.editing_mode} / {spec.publishing_mode}</dd></div>
        <div><dt>budget_cents</dt><dd className="mono">{spec.budget_cents}</dd></div>
      </dl>
      <p className="drama-acceptance-note">以上字段与 hash 直接来自当前 DramaRun；页面不会用顶部试制常量补造服务端 spec。</p>
    </section>

    <section className="drama-acceptance-panel" aria-labelledby="drama-episodes-title">
      <header>
        <div><GitBranch size={18} /><h3 id="drama-episodes-title">E01–E03 精确分集关系</h3></div>
        <span className="drama-count-label">{run.episodes?.length ?? 0} / 3 records</span>
      </header>
      <div className="drama-episode-grid">
        {requiredEpisodeKeys.map((key, index) => {
          const episode = run.episodes?.find((row) => row.logical_key === key)
          return <article key={key} className={episode ? undefined : 'missing'}>
            <div className="drama-episode-title"><b>{key}</b><StatusBadge status={episode ? 'active' : 'blocked'} label={episode ? '记录存在' : '缺失'} /></div>
            <dl>
              <div><dt>episode_index</dt><dd>{episode?.episode_index ?? index + 1}</dd></div>
              <div><dt>dispatch_key</dt><dd className="mono">{episode?.dispatch_key ?? '服务端未返回'}</dd></div>
              <div><dt>child_job_id</dt><dd>{episode?.child_job_id ? <Link className="mono" to={`/jobs/${episode.child_job_id}`}>{episode.child_job_id}</Link> : '尚未绑定'}</dd></div>
            </dl>
          </article>
        })}
      </div>
      <p className="drama-acceptance-note">DramaEpisode 与 child Job 只证明派发关系；即使子 Job 为 done，也不证明存在真实模型调用或媒体文件。</p>
    </section>
  </div>
}

const gate1RequirementLabels: Record<string, string> = {
  'research_snapshot:GLOBAL': 'Codex 实时研究快照',
  'fusion_plan:GLOBAL': '原创融合计划',
  'series_bible:GLOBAL': 'Series Bible',
  'episode_script:E01': 'E01 en-US 成稿',
  'episode_script:E02': 'E02 en-US 成稿',
  'episode_script:E03': 'E03 en-US 成稿',
  'originality_report:GLOBAL': '人工复核后的原创报告',
}

const gate1CheckLabels: Record<string, string> = {
  run_contract: '冻结 Run 契约',
  current_research_receipt: '当前 Codex 回执',
  single_materialization: '候选包物化链',
  provider_receipt_integrity: '真实模型回执完整性',
  materialized_documents_exact: '六份文档精确物化',
  candidate_business_contract: '候选包业务契约',
  human_originality_review: '独立人工原创复核',
}

function Gate1CandidatePackPanel({
  projectId,
  run,
  readiness,
  agents,
  onRunRevision,
  onReloadRun,
}: {
  projectId: string
  run: DramaRun
  readiness: DramaGate1Readiness
  agents: AgentRevision[]
  onRunRevision: (revision: number) => void
  onReloadRun: () => void | Promise<void>
}) {
  const [acknowledged, setAcknowledged] = useState(false)
  const [reviewNote, setReviewNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitSuccess, setSubmitSuccess] = useState('')
  const [agentSelection, setAgentSelection] = useState('')
  const [stageBusy, setStageBusy] = useState('')
  const [stageError, setStageError] = useState('')
  const [stageSuccess, setStageSuccess] = useState('')
  const [dispatchAcknowledged, setDispatchAcknowledged] = useState(false)
  const [originalityAcknowledged, setOriginalityAcknowledged] = useState(false)
  const [originalityNote, setOriginalityNote] = useState('')
  const readyCount = readiness.items.filter((item) => (
    item.present && item.latest && item.contract.valid && item.source.valid
  )).length
  const stage = readiness.stage
  const receipt = stage?.provider_receipt ?? readiness.items.find((item) => item.model_receipt)?.model_receipt
  const invocation = stage?.latest_invocation
  const materialization = stage?.latest_materialization
  const publishedAgents = agents.filter((agent) => agent.agent_key === 'drama.gate1.candidate-pack' && agent.status === 'published' && agent.binding)
  const selectedAgent = publishedAgents.find((agent) => agent.id === agentSelection) ?? publishedAgents[0]
  const researchItem = readiness.items.find((item) => item.requirement_key === 'research_snapshot:GLOBAL')
  const originalityItem = readiness.items.find((item) => item.requirement_key === 'originality_report:GLOBAL')
  const originalitySource = originalityItem?.source
  const candidatePendingReview = originalitySource?.kind === 'model_candidate_requires_human_review'
  const runInGate1 = run.status === 'waiting_gate_1'
  const canSubmit = readiness.can_human_approve && acknowledged && reviewNote.trim().length >= 24 && !submitting

  async function runStageAction(
    action: string,
    successMessage: string,
    operation: () => Promise<Record<string, unknown>>,
  ) {
    setStageBusy(action)
    setStageError('')
    setStageSuccess('')
    try {
      const result = await operation()
      const nextRun = result.run
      if (nextRun && typeof nextRun === 'object' && 'run_revision' in nextRun && typeof nextRun.run_revision === 'number') {
        onRunRevision(nextRun.run_revision)
      }
      setStageSuccess(successMessage)
      await onReloadRun()
    } catch (error) {
      setStageError(humanError(error))
    } finally {
      setStageBusy('')
    }
  }

  function prepareInvocation() {
    if (!selectedAgent || !researchItem?.document_version_id || !researchItem.document_content_hash) return
    return runStageAction('prepare', '已冻结本 Run revision 的 Gate 1 调用意图；尚未调用 Provider。', () => api.post<Record<string, unknown>>(
      `/drama-projects/${projectId}/runs/${run.id}/stage-invocations`,
      {
        expected_run_revision: readiness.run_revision,
        stage_key: 'gate_1_draft_pack',
        agent_revision_id: selectedAgent.id,
        expected_agent_version: selectedAgent.version,
        research_document_version_id: researchItem.document_version_id,
        research_document_content_hash: researchItem.document_content_hash,
      },
      true,
    ))
  }

  function executeInvocation() {
    if (!invocation || !dispatchAcknowledged) return
    return runStageAction('execute', '单次已绑定模型调用已结束；请以服务端回执状态为准。', () => api.post<Record<string, unknown>>(
      `/drama-projects/${projectId}/runs/${run.id}/stage-invocations/${invocation.id}/execute`,
      { expected_run_revision: readiness.run_revision, expected_version: invocation.version },
      true,
    ))
  }

  function materializeCandidate() {
    const providerReceipt = stage?.provider_receipt
    if (!invocation || !providerReceipt) return
    return runStageAction('materialize', '模型候选已一次性物化为六份不可变文档；AI 原创结论仍未通过。', () => api.post<Record<string, unknown>>(
      `/drama-projects/${projectId}/runs/${run.id}/stage-invocations/${invocation.id}/materialize`,
      {
        expected_run_revision: readiness.run_revision,
        expected_invocation_version: invocation.version,
        model_invocation_receipt_id: providerReceipt.model_invocation_receipt_id,
        model_invocation_receipt_hash: providerReceipt.receipt_hash,
      },
      true,
    ))
  }

  function reviewOriginality() {
    const materializationId = originalitySource?.materialization_id
    const candidateId = originalityItem?.document_version_id
    const candidateHash = originalityItem?.document_content_hash
    if (
      !originalityAcknowledged
      || originalityNote.trim().length < 24
      || typeof materializationId !== 'string'
      || !candidateId
      || !candidateHash
    ) return
    return runStageAction('originality', '独立人工原创复核已创建新的 pass 文档版本；尚未批准 Gate 1。', async () => {
      const result = await api.post<Record<string, unknown>>(
        `/drama-projects/${projectId}/runs/${run.id}/gates/1/originality-reviews`,
        {
          expected_run_revision: readiness.run_revision,
          materialization_id: materializationId,
          candidate_document_version_id: candidateId,
          candidate_document_content_hash: candidateHash,
          decision: 'pass',
          review_note: originalityNote.trim(),
        },
        true,
      )
      setOriginalityAcknowledged(false)
      setOriginalityNote('')
      return result
    })
  }

  async function approveGate1(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setSubmitError('')
    setSubmitSuccess('')
    try {
      const result = await api.post<{ gate: DramaGate; run: DramaRun }>(
        `/drama-projects/${projectId}/runs/${run.id}/gates/1/approve`,
        {
          expected_run_revision: readiness.run_revision,
          expected_readiness_hash: readiness.readiness_hash,
          review_note: reviewNote.trim(),
          originality_review_acknowledged: true,
        },
        true,
      )
      onRunRevision(result.run.run_revision)
      setSubmitSuccess(`Gate 1 已由服务端批准并绑定 decision hash ${result.gate.decision_hash.slice(0, 16)}…`)
      setAcknowledged(false)
      setReviewNote('')
      await onReloadRun()
    } catch (error) {
      setSubmitError(humanError(error))
    } finally {
      setSubmitting(false)
    }
  }

  return <section className="drama-acceptance-panel drama-gate1-pack" aria-labelledby="drama-gate1-pack-title">
    <header>
      <div><FileCheck2 size={18} /><h3 id="drama-gate1-pack-title">Gate 1 候选包与服务端 readiness</h3></div>
      <StatusBadge
        status={readiness.can_human_approve ? 'done' : 'blocked'}
        label={readiness.can_human_approve ? '可人工批准' : `阻断 · ${readyCount}/7`}
      />
    </header>
    <div className="drama-gate1-truth" role="note">
      <ShieldAlert size={17} />
      <p>七格就绪度由服务端重算。研究回执只是输入；只有绑定当前 Run 的 succeeded 模型回执、一次原子物化和独立人工原创复核同时有效，Gate 1 才会开放。</p>
    </div>
    <div className="drama-gate1-actions" aria-label="Gate 1 受控执行步骤">
      <div className="drama-gate1-action-heading"><div><Play size={16} /><b>受控执行步骤</b></div><span>prepare → explicit execute → materialize → human review</span></div>
      {!runInGate1 ? <p className="drama-acceptance-note">当前 Run 已离开 waiting_gate_1；这里只保留证据查看，不会重新调用模型。</p> : !invocation ? <div className="drama-gate1-action-step">
        <div><b>1. 冻结调用意图</b><p>绑定当前 research、published AgentRevision、Prompt、七个 Skill、模型路由、Schema 与参数；此步不调用 Provider。</p></div>
        {publishedAgents.length ? <>
          <label><span>published Gate 1 AgentRevision</span><select value={selectedAgent?.id ?? ''} onChange={(event) => setAgentSelection(event.target.value)}>
            {publishedAgents.map((agent) => <option value={agent.id} key={agent.id}>{agent.agent_key} r{agent.revision_number} · {agent.id}</option>)}
          </select></label>
          <button className="btn btn-line" type="button" disabled={stageBusy !== '' || !researchItem?.document_version_id || !researchItem.document_content_hash} onClick={() => void prepareInvocation()}>{stageBusy === 'prepare' ? '正在冻结…' : '准备冻结调用意图'}</button>
        </> : <p>尚无 published 且已绑定的 <code>drama.gate1.candidate-pack</code> AgentRevision。请先在 <Link to="/settings/control-plane">Agent 控制面</Link>完成已确认的产品级 ModelProfile、Prompt/Skill 绑定与发布；网站直连流水线应选择 Kimi 开放平台。</p>}
      </div> : invocation.status === 'prepared' ? <div className="drama-gate1-action-step danger">
        <div><b>2. 显式单次 Provider 调用</b><p>服务端会先持久化 dispatching，再向冻结的 direct_api / cc_switch Profile 发出一次请求。此操作可能计费；失败、崩溃或 unknown 都不会自动重试。</p></div>
        <label className="drama-gate1-ack"><input type="checkbox" checked={dispatchAcknowledged} onChange={(event) => setDispatchAcknowledged(event.target.checked)} /><span>我确认使用当前冻结路由执行一次可能计费的模型调用。</span></label>
        <button className="btn btn-solid" type="button" disabled={!dispatchAcknowledged || stageBusy !== ''} onClick={() => void executeInvocation()}>{stageBusy === 'execute' ? '已先持久化，正在调用…' : '显式调用已绑定模型一次'}</button>
      </div> : invocation.status === 'succeeded' && !materialization ? <div className="drama-gate1-action-step">
        <div><b>3. 原子物化候选包</b><p>消费当前 succeeded receipt，一次 CAS 写入 FusionPlan、Series Bible、E01–E03 与 AI 原创候选；不创建 Gate。</p></div>
        <button className="btn btn-solid" type="button" disabled={!stage?.provider_receipt?.integrity_verified || stageBusy !== ''} onClick={() => void materializeCandidate()}>{stageBusy === 'materialize' ? '正在物化六份文档…' : '物化当前真实回执'}</button>
      </div> : candidatePendingReview ? <div className="drama-gate1-action-step human">
        <div><b>4. 独立人工原创复核</b><p>请先在下方文档账本逐项阅读三集成稿与 requires_human_review 原创候选。通过会创建新的 pass 版本，不会批准 Gate 1。</p></div>
        <label className="drama-gate1-ack"><input type="checkbox" checked={originalityAcknowledged} onChange={(event) => setOriginalityAcknowledged(event.target.checked)} /><span>我已独立核对标题、身份、台词、标志场景序列、视觉表达与研究作品集合。</span></label>
        <label><span>原创复核说明（至少 24 个字符）</span><textarea rows={3} value={originalityNote} onChange={(event) => setOriginalityNote(event.target.value)} maxLength={4000} /></label>
        <button className="btn btn-solid" type="button" disabled={!originalityAcknowledged || originalityNote.trim().length < 24 || stageBusy !== ''} onClick={() => void reviewOriginality()}>{stageBusy === 'originality' ? '正在创建人工复核版本…' : '记录人工原创复核通过'}</button>
      </div> : ['dispatching', 'unknown'].includes(invocation.status) ? <div className="drama-gate1-action-step danger"><div><b>禁止盲目重试</b><p>当前状态为 <code>{invocation.status}</code>。请由 operator 使用 reconcile API 核对为 unknown / failed / cancelled；本页不会再次 POST。</p></div></div> : ['failed', 'unconfigured', 'cancelled'].includes(invocation.status) ? <div className="drama-gate1-action-step danger"><div><b>冻结调用已终止</b><p>当前状态为 <code>{invocation.status}</code>。同一 Run revision 不会复用或重提；先修复路由，再通过新的受控 Run revision 重新准备。</p></div></div> : <div className="drama-gate1-action-step complete"><div><b>阶段证据已形成</b><p>模型回执、物化和人工原创复核已经进入 readiness；最终 Gate 批准仍由下方独立表单执行。</p></div></div>}
      {stageError ? <p className="form-error" role="alert">{stageError}</p> : null}
      {stageSuccess ? <p className="form-success" role="status">{stageSuccess}</p> : null}
    </div>
    <div className="drama-gate1-stage" aria-label="Gate 1 阶段调用血缘">
      <div><span>stage invocation</span><b>{stage?.latest_invocation?.status ?? '尚未准备'}</b><code>{stage?.latest_invocation?.id ?? '—'}</code></div>
      <div><span>provider receipt</span><b>{receipt ? `${receipt.status} / invoked=${String(receipt.provider_invoked)}` : '尚无真实回执'}</b><code>{receipt?.receipt_hash ?? '—'}</code></div>
      <div><span>materialization</span><b>{stage?.latest_materialization ? `r${stage.latest_materialization.input_run_revision} → r${stage.latest_materialization.result_run_revision}` : '尚未物化'}</b><code>{stage?.latest_materialization?.id ?? '—'}</code></div>
      <div><span>readiness hash</span><b>{readiness.schema_version}</b><code>{readiness.readiness_hash}</code></div>
    </div>
    <div className="drama-gate1-requirements" aria-label="Gate 1 七项必需证据">
      {readiness.items.map((item) => {
        const valid = item.present && item.latest && item.contract.valid && item.source.valid
        return <article className={valid ? 'ready' : 'blocked'} key={item.requirement_key}>
          <div className="drama-gate1-item-head">
            {valid ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
            <div><b>{gate1RequirementLabels[item.requirement_key] ?? item.requirement_key}</b><code>{item.requirement_key}</code></div>
            <span>{valid ? 'current' : item.present ? 'invalid / stale' : 'missing'}</span>
          </div>
          <dl>
            <div><dt>document</dt><dd><code>{item.document_version_id ?? '—'}</code></dd></div>
            <div><dt>content hash</dt><dd><code>{item.document_content_hash ?? '—'}</code></dd></div>
            <div><dt>source</dt><dd>{item.source.kind ?? '—'}</dd></div>
          </dl>
          {item.contract.error && item.contract.error !== 'missing' ? <p>{item.contract.error}</p> : null}
        </article>
      })}
    </div>
    <div className="drama-gate1-checks" aria-label="Gate 1 交叉校验">
      {Object.entries(readiness.cross_checks).map(([key, check]) => <div className={check.passed ? 'passed' : 'failed'} key={key}>
        {check.passed ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
        <span>{gate1CheckLabels[key] ?? key}</span>
      </div>)}
    </div>
    {readiness.blockers.length ? <div className="drama-gate1-blockers" role="status">
      <b>当前阻断项</b>
      <ul>{readiness.blockers.map((blocker, index) => <li key={`${blocker.code}-${index}`}>
        <code>{blocker.code}</code><span>{blocker.message}</span>{blocker.requirement_key ? <em>{blocker.requirement_key}</em> : null}
      </li>)}</ul>
    </div> : null}
    {readiness.can_human_approve ? <form className="drama-gate1-approve" onSubmit={approveGate1}>
      <div><b>最终人工 Gate 1 批准</b><p>本操作会在服务端再次重算 readiness 并比较上方 hash；它不会触发模型或媒体生成。</p></div>
      <label className="drama-gate1-ack"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /><span>我已独立审阅三集成稿及原创报告，确认模型候选不能替代本人的判断。</span></label>
      <label><span>批准说明（至少 24 个字符）</span><textarea rows={3} value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} maxLength={4000} placeholder="记录原创性、连续性、三集差异和最终锁稿判断。" /></label>
      {submitError ? <p className="form-error" role="alert">{submitError}</p> : null}
      {submitSuccess ? <p className="form-success" role="status">{submitSuccess}</p> : null}
      <button className="btn btn-solid" type="submit" disabled={!canSubmit}>{submitting ? '正在服务端复验…' : '批准 Gate 1 并锁定当前 hash'}</button>
    </form> : <p className="drama-acceptance-note">当前仅可查看候选链，审批控件保持关闭。请先解决所有服务端 blocker；前端不会用手填 JSON 或“HTTP 200”绕过真实模型回执。</p>}
  </section>
}

function latestGates(gates: DramaGate[]) {
  const byNumber = new Map<number, DramaGate>()
  for (const gate of gates) {
    const current = byNumber.get(gate.gate_number)
    if (!current || gate.gate_revision > current.gate_revision) byNumber.set(gate.gate_number, gate)
  }
  return byNumber
}

function DramaGateAcceptance({ gates }: { gates: DramaGate[] }) {
  const currentByNumber = latestGates(gates)
  return <section className="drama-acceptance-panel drama-gate-evidence" aria-labelledby="drama-current-gates-title">
    <header>
      <div><LockKeyhole size={18} /><h3 id="drama-current-gates-title">当前 Gate 审批与精确绑定</h3></div>
      <span className="drama-count-label">GET /gates · {gates.length} revisions</span>
    </header>
    <p className="drama-gate-truth">只有此接口返回的当前 gate.status 才作为人工审批事实；Codex receipt、Document、Job 或 GenerationRun 均不会被页面升级成 approved。</p>
    <div className="drama-current-gate-list">
      {mandatoryGates.map((definition, index) => {
        const gateNumber = index + 1
        const gate = currentByNumber.get(gateNumber)
        if (!gate) return <article className="drama-current-gate empty" key={definition.id}>
          <div className="drama-current-gate-head"><div><span>{definition.id}</span><h4>{definition.title}</h4></div><StatusBadge status="pending" label="未批准" /></div>
          <p>服务端当前没有该 Gate 的审批修订与 binding；其他回执不能填补此空缺。</p>
        </article>

        const approved = gate.status === 'approved'
        return <article className={`drama-current-gate ${approved ? 'approved' : 'stale'}`} key={gate.id}>
          <div className="drama-current-gate-head">
            <div><span>{definition.id} · gate r{gate.gate_revision}</span><h4>{definition.title}</h4></div>
            <StatusBadge status={approved ? 'done' : 'blocked'} label={gate.status} />
          </div>
          <dl className="drama-gate-decision">
            <div><dt>run_revision</dt><dd>r{gate.run_revision}</dd></div>
            <div><dt>approved_by / role</dt><dd className="mono">{gate.approved_by} / {gate.approved_by_role}</dd></div>
            <div><dt>approved_at</dt><dd>{formatTimestamp(gate.approved_at)}</dd></div>
            <div><dt>decision_hash</dt><dd><code>{gate.decision_hash}</code></dd></div>
            {!approved ? <>
              <div><dt>stale_at</dt><dd>{formatTimestamp(gate.stale_at)}</dd></div>
              <div><dt>stale_reason</dt><dd>{gate.stale_reason ?? '—'}</dd></div>
            </> : null}
          </dl>
          <div className="drama-binding-list" aria-label={`Gate ${gateNumber} 精确绑定`}>
            {gate.bindings.length ? gate.bindings.map((binding) => {
              const targetId = binding.binding_type === 'document' ? binding.document_version_id : binding.artifact_id
              const targetHash = binding.binding_type === 'document' ? binding.document_content_hash : binding.artifact_checksum
              return <article key={binding.id}>
                <header><b>{binding.requirement_key}</b><span className={binding.stale ? 'stale' : undefined}>{binding.binding_type} · {binding.stale ? 'stale' : 'current'}</span></header>
                <dl>
                  <div><dt>target_id</dt><dd><code>{targetId ?? '—'}</code></dd></div>
                  <div><dt>target_hash</dt><dd><code>{targetHash ?? '—'}</code></dd></div>
                </dl>
                <div className="drama-provenance"><b>provenance</b><pre>{exactJson(binding.provenance)}</pre></div>
              </article>
            }) : <p className="drama-binding-empty">该审批修订没有返回 binding，无法验收精确输入。</p>}
          </div>
        </article>
      })}
    </div>
  </section>
}

function DramaDocuments({ documents }: { documents: DramaDocumentVersion[] }) {
  if (!documents.length) return <section className="drama-acceptance-panel" aria-labelledby="drama-documents-title">
    <header><div><FileCheck2 size={18} /><h3 id="drama-documents-title">DramaDocumentVersion 证据账本</h3></div><span className="drama-count-label">0 versions</span></header>
    <EmptyState title="当前 Run 尚无文档版本" description="没有 DocumentVersion 时不能声称 Gate 输入齐备；Job、回执或 Mock 账本不会替代文档 hash 与来源证据。" />
  </section>

  return <section className="drama-acceptance-panel" aria-labelledby="drama-documents-title">
    <header><div><FileCheck2 size={18} /><h3 id="drama-documents-title">DramaDocumentVersion 证据账本</h3></div><span className="drama-count-label">{documents.length} versions</span></header>
    <p className="drama-gate-truth">Document 是 Gate 输入版本，不等于 Gate 已批准。source_refs / evidence_refs 原样展示；出现 Mock 标记时仍只算候选记录。</p>
    <div className="drama-document-list">
      {documents.map((document) => {
        const mock = hasMockMarker([document.content, document.source_refs, document.evidence_refs])
        const receiptInput = document.doc_type === 'research_snapshot' || document.doc_type === 'research_receipt'
        return <article key={document.id}>
          <header>
            <div><span>{document.doc_type}</span><h4>{document.logical_key}</h4></div>
            <div className="drama-document-tags">
              {receiptInput ? <span className="receipt">回执输入 ≠ Gate 批准</span> : null}
              {mock ? <span className="mock">Mock / 候选证据</span> : null}
              <span>doc r{document.revision_number} · run r{document.run_revision}</span>
            </div>
          </header>
          <dl>
            <div><dt>document_version_id</dt><dd><code>{document.id}</code></dd></div>
            <div><dt>content_hash</dt><dd><code>{document.content_hash}</code></dd></div>
            <div><dt>content_format</dt><dd>{document.content_format}</dd></div>
            <div><dt>artifact binding</dt><dd>{document.artifact_id && document.artifact_checksum ? <><code>{document.artifact_id}</code><code>{document.artifact_checksum}</code></> : '—'}</dd></div>
          </dl>
          <div className="drama-document-evidence">
            <details><summary>source_refs（{document.source_refs.length}）</summary><pre>{exactJson(document.source_refs)}</pre></details>
            <details><summary>evidence_refs（{document.evidence_refs.length}）</summary><pre>{exactJson(document.evidence_refs)}</pre></details>
            <details><summary>content（原始版本）</summary><pre>{exactJson(document.content)}</pre></details>
          </div>
        </article>
      })}
    </div>
  </section>
}

export default function DramaWorkspacePage() {
  const controlRemote = useRemote(async () => {
    // Keep the local control-plane reads ordered. In development StrictMode runs
    // effects twice; issuing every authenticated cross-origin read at once can
    // exhaust a small browser connection pool before its CORS preflights finish.
    const workflows = await api.getWithMeta<WorkflowDefinition[]>('/workflows?industry=drama')
    const jobs = await api.getWithMeta<Job[]>('/jobs?industry=drama')
    const runs = await api.getWithMeta<GenerationRun[]>('/generation-runs')
    const ccSwitch = await api.getWithMeta<CCSwitchDiscovery>('/cc-switch/discover')
    const providerHealth = await api.getWithMeta<ProviderHealth>('/provider-health')
    return { workflows, jobs, runs, ccSwitch, providerHealth }
  }, [])

  const projectsRemote = useRemote(() => api.getWithMeta<DramaProject[]>('/drama-projects'), [])
  const [projectSelection, setProjectSelection] = useState('')
  const [runSelection, setRunSelection] = useState('')
  const projects = projectsRemote.data?.data ?? []
  const selectedProject = projects.find((project) => project.id === projectSelection) ?? projects[0]
  const selectedProjectId = selectedProject?.id ?? ''

  const runsRemote = useRemote(async () => {
    if (!selectedProjectId) return { projectId: '', data: [] as DramaRun[], meta: undefined as ApiMeta | undefined }
    const envelope = await api.getWithMeta<DramaRun[]>(`/drama-projects/${selectedProjectId}/runs`)
    return { projectId: selectedProjectId, data: envelope.data, meta: envelope.meta }
  }, [selectedProjectId])
  const runsLoadedForProject = runsRemote.data?.projectId === selectedProjectId
  const scopedRuns = runsRemote.data?.projectId === selectedProjectId ? runsRemote.data.data : []
  const selectedRun = scopedRuns.find((run) => run.id === runSelection) ?? scopedRuns[0]
  const selectedRunId = selectedRun?.id ?? ''

  const evidenceRemote = useRemote(async () => {
    if (!selectedProjectId || !selectedRunId) {
      return {
        projectId: selectedProjectId,
        runId: selectedRunId,
        run: null as DramaRun | null,
        documents: [] as DramaDocumentVersion[],
        gates: [] as DramaGate[],
        readiness: null as DramaGate1Readiness | null,
        agents: [] as AgentRevision[],
        meta: undefined as ApiMeta | undefined,
      }
    }
    const base = `/drama-projects/${selectedProjectId}/runs/${selectedRunId}`
    const run = await api.getWithMeta<DramaRun>(base)
    const documents = await api.getWithMeta<DramaDocumentVersion[]>(`${base}/documents`)
    const gates = await api.getWithMeta<DramaGate[]>(`${base}/gates`)
    const readiness = await api.getWithMeta<DramaGate1Readiness>(`${base}/gates/1/readiness`)
    const agents = await api.getWithMeta<AgentRevision[]>('/agent-configs?agent_key=drama.gate1.candidate-pack')
    return {
      projectId: selectedProjectId,
      runId: selectedRunId,
      run: run.data,
      documents: documents.data,
      gates: gates.data,
      readiness: readiness.data,
      agents: agents.data,
      meta: readiness.meta,
    }
  }, [selectedProjectId, selectedRunId])
  const scopedEvidence = evidenceRemote.data?.projectId === selectedProjectId && evidenceRemote.data.runId === selectedRunId
    ? evidenceRemote.data
    : null

  function updateCurrentRunRevision(revision: number) {
    evidenceRemote.setData((current) => {
      if (!current || current.projectId !== selectedProjectId || current.runId !== selectedRunId || !current.run) return current
      return { ...current, run: { ...current.run, run_revision: revision } }
    })
    runsRemote.setData((current) => {
      if (!current || current.projectId !== selectedProjectId) return current
      return {
        ...current,
        data: current.data.map((item) => item.id === selectedRunId ? { ...item, run_revision: revision } : item),
      }
    })
  }

  return <div className="drama-workspace">
    <PageHeader
      eyebrow="AI短剧产业部 · DRAMA WORKSPACE"
      title="短剧工作台"
      description="美国英语市场三集试制的验收与受控人工证据面：核对冻结规格、Gate 精确绑定、文档、发布声明与观测指标。"
      crumbs={<><Link to="/app">集团楼层</Link> / <Link to="/departments/drama">AI短剧部门</Link> / <b>工作台</b></>}
      actions={<><Link className="btn btn-line" to="/departments/drama">查看部门编制</Link><Link className="btn btn-gold" to="/tasks/new?industry=drama">＋ 创建短剧任务</Link></>}
    />

    <section className="drama-spec-band" aria-label="冻结试制规格">
      {pilotSpec.map((item) => <div key={item.label}><span>{item.label}</span><b>{item.value}</b></div>)}
    </section>

    <div className="drama-truth-boundary" role="note">
      <ShieldAlert size={20} />
      <div><b>Mock Job 不是模型、Research 或 LibTV 的真实生成证据</b><p>“完成”必须同时有真实且已绑定的模型调用、Codex 实时检索及 LibTV 付费三集生成回执、文件哈希与对账；构建通过、HTTP 200 或 CLI 已安装都不算。</p></div>
    </div>

    <SectionTitle index="闸" title="三道强制人工 Gate" />
    <ol className="drama-gate-list">
      {mandatoryGates.map((gate) => <li key={gate.id}><div className="drama-gate-index"><LockKeyhole size={16} /><span>{gate.id}</span></div><div><h3>{gate.title}</h3><p>{gate.detail}</p></div></li>)}
    </ol>

    <SectionTitle index="验" title="DramaProject / DramaRun 只读验收" />
    <section className="drama-acceptance-shell" aria-label="DramaProject 与 DramaRun 只读验收">
      {projectsRemote.loading ? <LoadingState label="正在读取 DramaProject 真实账本…" /> : projectsRemote.error ? <ErrorState message={projectsRemote.error} onRetry={projectsRemote.reload} /> : !projects.length ? <EmptyState title="尚无 DramaProject" description="现有短剧 Job 不会被页面补造成 DramaProject；请先通过受控写入流程创建 Project 与 Run 后再验收。" /> : <>
        <div className="drama-acceptance-toolbar">
          <label><span>DramaProject</span><select value={selectedProjectId} onChange={(event) => { setProjectSelection(event.target.value); setRunSelection('') }}>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.title} · {project.status}</option>)}
          </select></label>
          <label><span>DramaRun</span><select value={selectedRunId} disabled={runsRemote.loading || !runsLoadedForProject || !scopedRuns.length} onChange={(event) => setRunSelection(event.target.value)}>
            {(runsRemote.loading || !runsLoadedForProject) && !scopedRuns.length ? <option value="">正在读取 runs…</option> : null}
            {!runsRemote.loading && runsLoadedForProject && !scopedRuns.length ? <option value="">尚无 run</option> : null}
            {scopedRuns.map((run) => <option key={run.id} value={run.id}>Run #{run.run_number} · r{run.run_revision} · {run.status}</option>)}
          </select></label>
          <div className="drama-project-summary"><span>当前 Project</span><b>{selectedProject.title}</b><p>{selectedProject.description || '无项目描述'}</p><code>{selectedProject.id}</code></div>
          <div className="drama-project-summary request"><span>Projects request</span><code>{projectsRemote.data?.meta?.request_id ?? '—'}</code><span>Runs count {runsRemote.data?.projectId === selectedProjectId ? runsRemote.data.meta?.count ?? scopedRuns.length : '—'}</span></div>
        </div>

        {runsRemote.error ? <ErrorState message={runsRemote.error} onRetry={runsRemote.reload} /> : runsRemote.loading || !runsLoadedForProject ? <LoadingState label={`正在读取 ${selectedProject.title} 的 DramaRun…`} /> : !scopedRuns.length ? <EmptyState title="当前 Project 尚无 DramaRun" description="没有 Run 时不存在服务端冻结 spec、E01–E03、Gate 或 Document 可供验收。" /> : evidenceRemote.error ? <ErrorState message={evidenceRemote.error} onRetry={evidenceRemote.reload} /> : !scopedEvidence && evidenceRemote.loading ? <LoadingState label={`正在读取 Run #${selectedRun?.run_number ?? '—'} 详情、Documents、Gates 与 Gate 1 readiness…`} /> : scopedEvidence?.run && scopedEvidence.readiness ? <>
          {evidenceRemote.loading ? <p className="drama-release-refreshing" role="status">正在重新读取 Run、Documents、Gates 与 Gate 1 readiness…</p> : null}
          <DramaRunContract project={selectedProject} run={scopedEvidence.run} />
          <Gate1CandidatePackPanel
            projectId={selectedProject.id}
            run={scopedEvidence.run}
            readiness={scopedEvidence.readiness}
            agents={scopedEvidence.agents}
            onRunRevision={updateCurrentRunRevision}
            onReloadRun={evidenceRemote.reload}
          />
          <DramaGateAcceptance gates={scopedEvidence.gates} />
          <DramaDocuments documents={scopedEvidence.documents} />
          <DramaReleaseEvidence
            projectId={selectedProject.id}
            run={scopedEvidence.run}
            gates={scopedEvidence.gates}
            onRunRevision={updateCurrentRunRevision}
            onReloadRun={evidenceRemote.reload}
          />
          <div className="drama-request-trace drama-acceptance-trace"><Fingerprint size={15} /><span>数据源：DramaProject、DramaRun detail、DramaDocumentVersion、DramaGate bindings 与服务端 Gate 1 readiness</span><span className="mono">readiness request {scopedEvidence.meta?.request_id ?? '—'}</span></div>
        </> : null}
      </>}
    </section>

    {controlRemote.loading ? <LoadingState label="正在读取短剧工作流、Job、GenerationRun、CC Switch 与研究收据…" /> : controlRemote.error ? <ErrorState message={controlRemote.error} onRetry={controlRemote.reload} /> : controlRemote.data ? <>
      <SectionTitle index="控" title="路由与工作流控制面" />
      <div className="drama-control-grid">
        <ProviderReadiness discovery={controlRemote.data.ccSwitch.data} providerHealth={controlRemote.data.providerHealth.data} />
        <WorkflowContract workflows={controlRemote.data.workflows.data} />
      </div>

      <SectionTitle index="任" title="母子 Job 账本" action={<Link className="btn btn-line" to="/tasks?industry=drama">打开统一任务中心</Link>} />
      <section className="drama-ledger" aria-label="短剧母子任务">
        <JobLedger jobs={controlRemote.data.jobs.data} meta={controlRemote.data.jobs.meta} />
      </section>

      <SectionTitle index="生" title="GenerationRun 账本" />
      <section className="drama-ledger" aria-label="短剧外部生成运行">
        <GenerationLedger jobs={controlRemote.data.jobs.data} runs={controlRemote.data.runs.data} meta={controlRemote.data.runs.meta} />
      </section>

      <div className="drama-request-trace"><Clapperboard size={15} /><span>只读数据源：WorkflowDefinition、Job、GenerationRun、CC Switch discovery、Provider health</span><span className="mono">request {controlRemote.data.ccSwitch.meta?.request_id ?? '—'}</span></div>
    </> : null}
  </div>
}
