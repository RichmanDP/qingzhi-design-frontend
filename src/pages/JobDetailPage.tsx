import { ChevronDown, ChevronUp, CircleStop, Download, Pause, Play, RefreshCw, RotateCcw, ShieldCheck, XCircle } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ErrorState, IndustryBadge, InlineNotice, LoadingState, Money, PageHeader, PrimaryButton, RelativeTime, SectionTitle, StatusBadge } from '../components/ui'
import { useToast } from '../components/toast'
import { stageStatusLabel } from '../data/catalog'
import { useJobEvents } from '../hooks/useJobEvents'
import { useRemote } from '../hooks/useRemote'
import { api, createIdempotencyKey, humanError } from '../lib/api'
import type { Artifact, Job, Review, StageRun } from '../types'

const approvalLabel: Record<string, string> = { key: '关键审批', managed: '完全托管', automatic: '全自动', every_stage: '逐站审批' }
interface IdempotencyAttempt { signature: string; key: string }

function attestationIsExpired(value?: string | null) {
  if (!value) return false
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) || timestamp <= Date.now()
}

function stageClass(stage: StageRun) {
  if (stage.status === 'done') return 'done'
  if (stage.status === 'running') return 'cur'
  if (stage.status === 'failed' || stage.status === 'interrupted') return 'failed'
  if (stage.status === 'awaiting_review' || stage.status === 'rejected') return 'review'
  if (stage.status === 'stale') return 'stale'
  return 'wait'
}

function ArtifactCard({ artifact }: { artifact: Artifact }) {
  const payload = typeof artifact.payload === 'string' ? artifact.payload : artifact.payload ? JSON.stringify(artifact.payload, null, 2) : ''
  const payloadSummary = typeof artifact.payload === 'object' && artifact.payload && typeof artifact.payload.summary === 'string' ? artifact.payload.summary : undefined
  return <article className="artifact"><div className="artifact-head"><h4>{artifact.name ?? artifact.artifact_type ?? artifact.kind ?? '结构化产物'}</h4><span className="mono">v{artifact.current_version ?? artifact.version ?? 1}</span></div><p>{artifact.summary ?? payloadSummary ?? (payload ? payload.slice(0, 220) : '该版本已记录，暂无摘要。')}</p>
    {artifact.source_refs?.length ? <div className="citation-list">{artifact.source_refs.map((source, index) => <div className="citation" key={source.id ?? `${source.title}-${index}`}><b>{source.title}</b>{source.url ? <> · <a href={source.url} target="_blank" rel="noreferrer">打开来源</a></> : null}{source.excerpt ? <div>{source.excerpt}</div> : null}</div>)}</div> : null}
    <div className="artifact-meta"><span>校验和 {artifact.checksum?.slice(0, 12) ?? '—'}</span><span>Prompt {artifact.prompt_version ?? '—'}</span><span>Policy {artifact.policy_version ?? '—'}</span><span>Model Run {artifact.model_run_id ?? 'mock / 未接入'}</span></div>
  </article>
}

export default function JobDetailPage() {
  const { id } = useParams()
  const toast = useToast()
  const job = useRemote(() => api.get<Job>(`/jobs/${id}`), [id])
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [logsOpen, setLogsOpen] = useState(true)
  const [reviewComment, setReviewComment] = useState('')
  const [revisionDraft, setRevisionDraft] = useState('')
  const deliveryAttempt = useRef<IdempotencyAttempt | null>(null)
  useJobEvents(id, job.reload)
  useEffect(() => {
    if (!id) return
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible') void job.reload() }, 8000)
    return () => window.clearInterval(interval)
  }, [id, job.reload])

  const data = job.data
  const pendingReview = useMemo(() => data?.reviews?.find((review) => ['pending', 'awaiting_review'].includes(review.status)), [data?.reviews])
  const pendingReviewStage = useMemo(() => data?.stage_runs?.find((stage) => stage.id === pendingReview?.stage_run_id), [data?.stage_runs, pendingReview?.stage_run_id])
  const gate = data?.latest_gate ?? data?.gates?.at(-1)
  const gateAttestation = gate?.attestation_id ? data?.gate_attestations?.find((attestation) => attestation.id === gate.attestation_id) : undefined
  const gateArtifactId = gateAttestation?.artifact_id ?? gate?.artifact_id
  const gateArtifact = gateArtifactId ? data?.artifacts?.find((artifact) => artifact.id === gateArtifactId) : undefined
  const attestationExpired = attestationIsExpired(gateAttestation?.expires_at ?? gate?.attestation_expires_at)
  const canDeliver = Boolean(
    data?.status === 'done'
    && gate?.attestation_id
    && gate.attestation_valid !== false
    && gateAttestation?.valid
    && !attestationExpired
    && gateArtifact
    && !gateArtifact.stale
    && (data?.industry !== 'medical' || gateAttestation.signed_by),
  )

  async function command(action: 'pause' | 'resume' | 'cancel') {
    if (!data) return
    if (action === 'cancel' && !window.confirm('确定取消这条任务？已生成的版本和审计记录会保留。')) return
    setBusyAction(action); setActionError(null)
    try { await api.post(`/jobs/${data.id}/${action}`, { expected_version: data.version }); await job.reload(); toast.notify(action === 'pause' ? '任务已暂停' : action === 'resume' ? '任务已恢复' : '任务已取消') }
    catch (reason) { setActionError(humanError(reason)) } finally { setBusyAction(null) }
  }

  async function decide(review: Review, action: 'approve' | 'reject' | 'rerun' | 'sign') {
    const comment = reviewComment.trim()
    if (['reject', 'rerun', 'sign'].includes(action) && !comment) {
      setActionError(action === 'sign' ? '专家签发必须填写依据。' : '退回或重跑必须填写决定依据。')
      return
    }
    setBusyAction(`review-${action}`); setActionError(null)
    try { await api.post(`/reviews/${review.id}/decision`, { action, comment, expected_version: review.version ?? data?.version ?? 1 }); setReviewComment(''); await job.reload(); toast.notify('审批决定已记录，工作流会按状态机继续') }
    catch (reason) { setActionError(humanError(reason)) } finally { setBusyAction(null) }
  }

  async function retryStage(stage: StageRun) {
    setBusyAction(`retry-${stage.id}`); setActionError(null)
    try { await api.post(`/stage-runs/${stage.id}/retry`, { expected_version: stage.version ?? 1 }); await job.reload(); toast.notify('已从安全检查点重新排队') }
    catch (reason) { setActionError(humanError(reason)) } finally { setBusyAction(null) }
  }

  async function recheck() {
    if (!gateArtifact) return
    const revisedText = revisionDraft.trim()
    if (!revisedText) { setActionError('请先填写已删改或补证后的新版本内容。'); return }
    setBusyAction('recheck'); setActionError(null)
    try {
      const currentPayload = typeof gateArtifact.payload === 'object' && gateArtifact.payload ? gateArtifact.payload : {}
      const currentNestedPayload = typeof currentPayload.payload === 'object' && currentPayload.payload ? currentPayload.payload : {}
      const revisedPayload = {
        ...currentPayload,
        summary: revisedText,
        content: revisedText,
        payload: { ...currentNestedPayload, draft: revisedText, content: revisedText },
      }
      await api.post(`/artifacts/${gateArtifact.id}/versions`, { payload: revisedPayload, source_refs: gateArtifact.source_refs ?? [], change_note: '用户修改后重新质检', expected_version: gateArtifact.version ?? 1 })
      await api.post(`/artifacts/${gateArtifact.id}/compliance-evaluations`, {}, true)
      setRevisionDraft(''); await job.reload(); toast.notify('新 ArtifactVersion 已保存并重新质检')
    }
    catch (reason) { setActionError(humanError(reason)) } finally { setBusyAction(null) }
  }

  async function deliver() {
    if (!data || !gateArtifact || !gateAttestation || !gate?.attestation_id || !canDeliver) return
    if (!window.confirm('确认创建本地交付记录？这不会自动写入任何外部平台。')) return
    setBusyAction('deliver'); setActionError(null)
    try {
      const payload = { job_id: data.id, artifact_id: gateArtifact.id, gate_attestation_id: gateAttestation.id, destination: 'local_package' }
      const signature = JSON.stringify(payload)
      if (!deliveryAttempt.current || deliveryAttempt.current.signature !== signature) {
        deliveryAttempt.current = { signature, key: createIdempotencyKey('delivery-create') }
      }
      await api.post('/deliveries', payload, true, deliveryAttempt.current.key)
      deliveryAttempt.current = null
      toast.notify('本地交付记录已创建')
    }
    catch (reason) { setActionError(humanError(reason)) } finally { setBusyAction(null) }
  }

  if (job.loading && !data) return <LoadingState label="正在读取权威工单状态…" />
  if (job.error && !data) return <><PageHeader title="工单详情" /><ErrorState message={job.error} onRetry={job.reload} /></>
  if (!data) return null
  const medicalHighRisk = data.industry === 'medical' && gate?.findings.some((finding) => (finding.risk_level ?? finding.level) === 'high')

  return <>
    <PageHeader title={`#${data.display_id ?? data.id.slice(0, 8)} ${data.title}`} crumbs={<><Link to="/tasks">任务中心</Link> / <b>工单详情</b></>} description={<>{typeof data.brief === 'string' ? data.brief : String((data.brief as Record<string, unknown>)?.summary ?? JSON.stringify(data.brief))}</>} actions={<div className="command-bar">
      {['queued', 'running', 'awaiting_review', 'gate_blocked'].includes(data.status) ? <button className="btn btn-line" disabled={Boolean(busyAction)} onClick={() => void command('pause')}><Pause size={14} />暂停</button> : null}
      {data.status === 'paused' ? <button className="btn btn-solid" disabled={Boolean(busyAction)} onClick={() => void command('resume')}><Play size={14} />恢复</button> : null}
      {!['done', 'cancelled'].includes(data.status) ? <button className="btn btn-line danger-text" disabled={Boolean(busyAction)} onClick={() => void command('cancel')}><XCircle size={14} />取消</button> : null}
    </div>} />
    <div className="job-summary"><IndustryBadge industry={data.industry} /><StatusBadge status={data.status} /><span className="badge b-wait">{approvalLabel[data.approval_mode] ?? data.approval_mode}</span><span className="badge b-wait mono">Job v{data.version}</span><span className="badge b-wait">来源：{data.source ?? 'manual'}</span></div>
    {actionError ? <div style={{ marginTop: 18 }}><InlineNotice tone="danger" title="操作未完成">{actionError}</InlineNotice></div> : null}

    <SectionTitle index="流" title="工作流与 StageRun" />
    <div className="pipe app-pipe" role="list" aria-label="任务工作流进度">{(data.stage_runs ?? []).map((stage) => <div className={`pnode ${stageClass(stage)}`} role="listitem" key={stage.id}><span className="pn-type">{stage.node_key ?? stage.node_id ?? stage.kind ?? 'NODE'}</span><div className="pn-av">{stage.glyph ?? stage.name.slice(0, 1)}</div><div className="pn-name">{stage.name}</div><div className="pn-st">{stageStatusLabel[stage.status] ?? stage.status}</div>{['failed', 'interrupted'].includes(stage.status) ? <button className="mini-action" disabled={Boolean(busyAction)} onClick={() => void retryStage(stage)}><RotateCcw size={11} />安全重试</button> : null}</div>)}</div>
    {!data.stage_runs?.length ? <InlineNotice tone="warning" title="尚无运行节点">Worker 还没有为这条任务创建 StageRun，请检查队列和工作流定义。</InlineNotice> : null}

    <div className="job-detail-grid">
      <div>
        {gate ? <><SectionTitle index="检" title="合规质检门禁" /><section className="panel gate-panel">
          <header className="gate-panel-header"><ShieldCheck size={25} /><h3>{gate.status === 'blocked' ? '已阻断流转' : gate.status === 'passed' ? '门禁已通过' : '等待质检'}</h3><StatusBadge status={gate.status} /></header>
          {gate.findings?.length ? <div className="gate-findings">{gate.findings.map((finding, index) => { const level = finding.risk_level ?? finding.level ?? 'low'; return <div className="finding" key={finding.id ?? index}><span className={`finding-level ${level}`}>{level === 'high' ? '高' : level === 'medium' ? '中' : '低'}</span><div><h4>{finding.category}</h4><p>{finding.message ?? finding.text ?? finding.evidence ?? finding.matched_text ?? '规则命中，需查看建议动作。'}</p>{finding.suggestion ?? finding.recommended_action ? <p className="muted">建议：{finding.suggestion ?? finding.recommended_action}</p> : null}</div></div> })}</div> : <div className="gate-findings"><p>没有风险命中记录。</p></div>}
          {gate.status === 'blocked' ? <div className="field-group gate-revision"><label htmlFor="artifact-revision">删改/补证后的新版本内容</label><textarea id="artifact-revision" className="field" value={revisionDraft} onChange={(event) => setRevisionDraft(event.target.value)} placeholder="粘贴修正版内容；保存后旧审批和 GateAttestation 会立即失效。" /><PrimaryButton busy={busyAction === 'recheck'} onClick={() => void recheck()} disabled={!gateArtifact || !revisionDraft.trim()}><RefreshCw size={14} />保存新版本并重新质检</PrimaryButton></div> : null}
          <div className="gate-actions"><button className="btn btn-line" disabled title={medicalHighRisk ? '医疗高风险问题只能改稿、补证后重新质检' : '当前候选版未开放人工 override 接口'}>知晓风险，继续</button><span className="gate-lock-note">{medicalHighRisk ? '服务端锁定：医疗高风险不可 override' : '人工 override 未开放，请修改后重检'}</span></div>
        </section></> : null}

        {pendingReview ? <><SectionTitle index="审" title="待人工审批" /><section className="panel"><h3>需要你的决定</h3><p>{pendingReview.comment || `节点 ${pendingReviewStage?.name ?? pendingReview.stage_run_id ?? ''} 已暂停，等待 ${pendingReviewStage?.kind === 'expert_review' ? '授权专家签发' : '有权限的成员审批'}。`}</p><div className="field-group" style={{ marginTop: 16 }}><label htmlFor="review-comment">审批意见或退回依据</label><textarea id="review-comment" className="field" value={reviewComment} onChange={(event) => setReviewComment(event.target.value)} placeholder={pendingReviewStage?.kind === 'expert_review' ? '专家签发必须填写证据与判断依据' : '通过可留空；退回或重跑必须填写依据'} /></div><div className="command-bar" style={{ marginTop: 16 }}><button className="btn btn-solid" disabled={Boolean(busyAction) || (pendingReviewStage?.kind === 'expert_review' && !reviewComment.trim())} onClick={() => void decide(pendingReview, pendingReviewStage?.kind === 'expert_review' ? 'sign' : 'approve')}>{pendingReviewStage?.kind === 'expert_review' ? '专家签发' : '通过'}</button><button className="btn btn-line" disabled={Boolean(busyAction) || !reviewComment.trim()} onClick={() => void decide(pendingReview, 'reject')}>退回修改</button><button className="btn btn-line" disabled={Boolean(busyAction) || !reviewComment.trim()} onClick={() => void decide(pendingReview, 'rerun')}>从节点重跑</button></div></section></> : null}

        <SectionTitle index="产" title={`产物版本（${data.artifacts?.length ?? 0}）`} />
        {data.artifacts?.length ? <div className="artifact-list">{data.artifacts.map((artifact) => <ArtifactCard artifact={artifact} key={artifact.id} />)}</div> : <div className="empty-state"><div className="empty-glyph">产</div><h3>尚无产物</h3><p>上游节点提交有效 ArtifactVersion 后，下游才会开始。</p></div>}

        <SectionTitle index="记" title="审计与工作日志" />
        <div className="log"><button className="log-head" style={{ width: '100%', background: 'none', borderTop: 0, borderLeft: 0, borderRight: 0 }} aria-expanded={logsOpen} aria-controls="job-audit-log" onClick={() => setLogsOpen((value) => !value)}><span>每一步都可回看</span>{logsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>{logsOpen ? <div className="log-body" id="job-audit-log">{data.audit_events?.length ? data.audit_events.map((event) => <div className="log-item" key={event.id}><span className="lt"><RelativeTime value={event.created_at} /></span><div className="lc"><span className="audit-sequence">#{event.sequence ?? '—'}</span><b>{event.actor ?? 'system'}</b> · {event.summary ?? event.action}</div></div>) : <div className="log-item"><span className="lt">—</span><div className="lc">详情响应暂未包含审计事件，可在运维审计页查询。</div></div>}</div> : null}</div>
      </div>

      <aside className="sticky-aside">
        <section className="panel"><h3>任务信息</h3><dl className="key-value"><dt>工单编号</dt><dd className="mono">{data.display_id ?? data.id}</dd><dt>工作流</dt><dd>{data.workflow_name ?? data.workflow_id}</dd><dt>审批模式</dt><dd>{approvalLabel[data.approval_mode] ?? data.approval_mode}</dd><dt>平台</dt><dd>{data.platforms?.join(' / ') || '未指定'}</dd><dt>成本上限</dt><dd><Money cents={data.budget_cents} /></dd><dt>已预占</dt><dd><Money cents={data.reserved_cents} /></dd><dt>创建时间</dt><dd><RelativeTime value={data.created_at} /></dd><dt>更新时间</dt><dd><RelativeTime value={data.updated_at} /></dd></dl></section>
        <section className="panel" style={{ borderLeft: '3px solid var(--gold)' }}><h3>交付控制</h3><p style={{ fontSize: 12.5 }}>只有已完成任务中、与当前 GateAttestation 明确绑定的产物才能创建交付；医疗任务还必须完成专家签发。本地候选版只创建本地交付记录。</p><button className="btn btn-gold" style={{ width: '100%', justifyContent: 'center', marginTop: 13 }} onClick={() => void deliver()} disabled={!canDeliver || busyAction === 'deliver'}><Download size={14} />创建本地交付</button>{!gate?.attestation_id ? <div className="field-help">尚无有效 GateAttestation</div> : !gateAttestation || !gateArtifact ? <div className="field-help">GateAttestation 与产物绑定信息缺失，已禁止交付</div> : data.status !== 'done' ? <div className="field-help">任务尚未完成或最终审批仍待处理，不能提前创建交付</div> : attestationExpired ? <div className="field-help">GateAttestation 已过期，需对当前产物重新质检后再交付</div> : data.industry === 'medical' && !gateAttestation.signed_by ? <div className="field-help">医疗任务等待专家签发，服务端拒绝提前交付</div> : null}</section>
        <section className="panel"><h3>验收标准</h3>{data.acceptance_criteria?.length ? <ul className="plain-list">{data.acceptance_criteria.map((criterion) => <li key={criterion}>{criterion}</li>)}</ul> : <p className="muted">未填写</p>}</section>
        {data.status === 'failed' ? <section className="panel safe-disabled"><h3><CircleStop size={15} /> 失败恢复</h3><p>{data.reason ?? (typeof data.error?.message === 'string' ? data.error.message : null) ?? '请在流程图中找到失败节点并从安全检查点重试。真实发布、付款和消息发送不会自动重放。'}</p></section> : null}
      </aside>
    </div>
  </>
}
