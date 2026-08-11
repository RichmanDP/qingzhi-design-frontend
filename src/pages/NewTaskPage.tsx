import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { InlineNotice, PageHeader, PrimaryButton } from '../components/ui'
import { approvalModes, departments, industryMeta, marketingTools } from '../data/catalog'
import { useRemote } from '../hooks/useRemote'
import { api, createIdempotencyKey, humanError } from '../lib/api'
import type { ApprovalMode, Industry, Job, WorkflowDefinition } from '../types'

const platforms = ['公众号', '小红书', '知乎', '抖音', '快手', '视频号']
interface TenantSettings { default_approval_mode?: string; enabled_industries?: string[] }
interface IdempotencyAttempt { signature: string; key: string }

export default function NewTaskPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const seedIndustry = searchParams.get('industry') ?? (searchParams.get('template') ? 'marketing' : 'content')
  const template = marketingTools.find((tool) => tool.id === searchParams.get('template'))
  const workflows = useRemote(() => api.get<WorkflowDefinition[]>('/workflows'), [])
  const settings = useRemote(() => api.get<TenantSettings>('/settings'), [])
  const [title, setTitle] = useState(template ? `${template.name}任务` : '')
  const [brief, setBrief] = useState(template ? template.description : '')
  const [industry, setIndustry] = useState(seedIndustry)
  const [workflowId, setWorkflowId] = useState('')
  const [approvalMode, setApprovalMode] = useState<ApprovalMode>('key')
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([])
  const [selectedOptionalNodes, setSelectedOptionalNodes] = useState<string[]>([])
  const [criteria, setCriteria] = useState('输出可直接评审的结构化产物\n事实性结论保留可打开的来源\n高风险内容必须通过行业门禁')
  const [budgetYuan, setBudgetYuan] = useState('50')
  const [priority, setPriority] = useState('normal')
  const [materials, setMaterials] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const approvalTouched = useRef(false)
  const defaultApprovalApplied = useRef(false)
  const jobAttempt = useRef<IdempotencyAttempt | null>(null)

  const enabledIndustries = settings.data?.enabled_industries
  const selectableIndustries = useMemo(() => Object.entries(industryMeta).filter(([key]) => {
    if (!Array.isArray(enabledIndustries)) return true
    return enabledIndustries.includes(key === 'marketing' ? 'content' : key)
  }), [enabledIndustries])
  useEffect(() => {
    if (!Array.isArray(enabledIndustries)) return
    const backendIndustry = industry === 'marketing' ? 'content' : industry
    if (!enabledIndustries.includes(backendIndustry)) setIndustry(selectableIndustries[0]?.[0] ?? '')
  }, [enabledIndustries, industry, selectableIndustries])
  const availableWorkflows = useMemo(() => (workflows.data ?? []).filter((workflow) => workflow.industry === industry || (industry === 'marketing' && workflow.industry === 'content')), [workflows.data, industry])
  useEffect(() => {
    if (!availableWorkflows.some((workflow) => workflow.id === workflowId)) setWorkflowId(availableWorkflows[0]?.id ?? '')
  }, [availableWorkflows, workflowId])
  useEffect(() => {
    const mode = approvalModes.find((item) => item.id === approvalMode)
    if (mode?.unavailableFor?.includes(industry as Industry)) setApprovalMode('key')
  }, [industry, approvalMode])

  const tenantDefaultApproval = approvalModes.some((mode) => mode.id === settings.data?.default_approval_mode)
    ? settings.data?.default_approval_mode as ApprovalMode
    : 'key'
  useEffect(() => {
    if (!settings.data || defaultApprovalApplied.current || approvalTouched.current) return
    defaultApprovalApplied.current = true
    const configured = approvalModes.some((mode) => mode.id === settings.data?.default_approval_mode)
      ? settings.data.default_approval_mode as ApprovalMode
      : 'key'
    const unavailable = approvalModes.find((mode) => mode.id === configured)?.unavailableFor?.includes(industry as Industry)
    setApprovalMode(unavailable ? 'key' : configured)
  }, [settings.data, industry])

  const selectedWorkflow = availableWorkflows.find((workflow) => workflow.id === workflowId)
  const optionalNodes = useMemo(() => selectedWorkflow?.nodes.filter((node) => node.optional || node.type === 'optional' || node.required === false) ?? [], [selectedWorkflow])
  useEffect(() => {
    setSelectedOptionalNodes(optionalNodes.map((node) => node.id))
  }, [optionalNodes])
  const seed = departments[industry === 'marketing' ? 'content' : industry]
  const routeReason = industry === 'marketing'
    ? '营销工具先创建真实任务，再由内容工作流处理；外部连接器写入仍需最终确认。'
    : seed?.note ?? '按行业和 Brief 选择版本化工作流。'

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!title.trim() || !brief.trim() || !industry || !workflowId) { setError('请完整填写任务标题、需求、已启用行业和工作流。'); return }
    setBusy(true); setError(null)
    try {
      const payload = {
        title: title.trim(), brief: brief.trim(), industry: industry === 'marketing' ? 'content' : industry,
        workflow_id: workflowId, approval_mode: approvalMode, platforms: selectedPlatforms,
        acceptance_criteria: criteria.split('\n').map((item) => item.trim()).filter(Boolean),
        budget_cents: Math.round(Number(budgetYuan || 0) * 100), priority,
        source: template ? 'tool' : 'manual',
        material_names: materials.map((file) => file.name),
        optional_nodes: selectedOptionalNodes,
      }
      const signature = JSON.stringify(payload)
      if (!jobAttempt.current || jobAttempt.current.signature !== signature) {
        jobAttempt.current = { signature, key: createIdempotencyKey('job-create') }
      }
      const job = await api.post<Job>('/jobs', payload, true, jobAttempt.current.key)
      jobAttempt.current = null
      navigate(`/jobs/${job.id}`)
    } catch (reason) { setError(humanError(reason)) } finally { setBusy(false) }
  }

  return <>
    <PageHeader eyebrow="任务 Brief · NEW JOB" title="下达任务" description="先说明要解决的问题，再选择行业工作流、验收标准、审批模式与成本上限；提交前展示完整路由原因。" crumbs={<><Link to="/tasks">任务中心</Link> / <b>下达任务</b></>} />
    <form className="panel form-panel" onSubmit={submit}>
      {error ? <InlineNotice tone="danger" title="无法创建任务">{error}</InlineNotice> : null}
      <div className="form-grid" style={{ marginTop: error ? 20 : 0 }}>
        <div className="field-group full"><label htmlFor="job-title">任务标题 <span className="required-mark">*</span></label><input id="job-title" className="field" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：为家用制氧机准备一份合规的公众号选购指南" maxLength={160} required /></div>
        <div className="field-group full"><label htmlFor="job-brief">一句话需求与背景 <span className="required-mark">*</span></label><textarea id="job-brief" className="field" value={brief} onChange={(event) => setBrief(event.target.value)} placeholder="要解决什么问题、给谁看、已有资料、不能做什么…" maxLength={6000} required /><div className="field-help">不要在 Brief 中粘贴 API Key、密码或未授权的敏感个人信息。</div></div>
        <div className="field-group"><label htmlFor="industry">行业</label><select id="industry" className="field" value={industry} onChange={(event) => setIndustry(event.target.value)} disabled={settings.loading || selectableIndustries.length === 0}>{selectableIndustries.length ? selectableIndustries.map(([key, value]) => <option value={key} key={key}>{value.label}</option>) : <option value="">没有已启用行业</option>}</select>{Array.isArray(enabledIndustries) && selectableIndustries.length === 0 ? <div className="field-help danger-text">租户未启用任何行业，请先由管理员在设置页启用。</div> : null}</div>
        <div className="field-group"><label htmlFor="workflow">工作流版本</label><select id="workflow" className="field" value={workflowId} onChange={(event) => setWorkflowId(event.target.value)} disabled={workflows.loading}>{availableWorkflows.length ? availableWorkflows.map((workflow) => <option value={workflow.id} key={workflow.id}>{workflow.name} · v{workflow.definition_version ?? workflow.version ?? '1.0.0'}</option>) : <option value="">没有可用工作流</option>}</select>{workflows.error ? <div className="field-help danger-text">{workflows.error}</div> : null}</div>
        <div className="field-group full"><InlineNotice title="为什么选择这组 Agent"><span>{routeReason}</span>{selectedWorkflow ? <span> 当前工作流含 {selectedWorkflow.nodes.length} 个节点：{selectedWorkflow.nodes.map((node) => node.name).join(' → ')}。</span> : null}</InlineNotice></div>
        {optionalNodes.length ? <fieldset className="field-group full"><legend className="field-label">可选工作流节点（默认全选）</legend><div className="checkbox-grid">{optionalNodes.map((node) => <label className="choice-card" key={node.id}><input type="checkbox" checked={selectedOptionalNodes.includes(node.id)} onChange={() => setSelectedOptionalNodes((current) => current.includes(node.id) ? current.filter((id) => id !== node.id) : [...current, node.id])} /><span><b>{node.name}</b><span>取消后仍保留状态为 skipped 的 StageRun，便于审计。</span></span></label>)}</div></fieldset> : null}
        <fieldset className="field-group full"><legend className="field-label">审批模式</legend><div className="checkbox-grid">{approvalModes.map((mode) => { const disabled = mode.unavailableFor?.includes(industry as Industry) ?? false; return <label className={`choice-card ${disabled ? 'disabled' : ''}`} key={mode.id}><input type="radio" name="approval" value={mode.id} checked={approvalMode === mode.id} disabled={disabled} onChange={() => { approvalTouched.current = true; setApprovalMode(mode.id) }} /><span><b>{mode.name}{mode.id === tenantDefaultApproval ? '（租户默认）' : ''}</b><span>{mode.description}</span></span></label> })}</div><div className="field-help">{settings.loading ? '正在读取租户默认审批模式…' : settings.error ? '租户设置暂不可用，本次使用安全默认“关键审批”。' : tenantDefaultApproval !== approvalMode ? `租户默认“${approvalModes.find((mode) => mode.id === tenantDefaultApproval)?.name ?? tenantDefaultApproval}”不适用于当前任务或已被手动调整。` : '已应用租户默认审批模式；仍受行业门禁与不可逆动作终审约束。'}</div></fieldset>
        <fieldset className="field-group full"><legend className="field-label">目标平台</legend><div className="checkbox-grid">{platforms.map((platform) => <label className="choice-card" key={platform}><input type="checkbox" checked={selectedPlatforms.includes(platform)} onChange={() => setSelectedPlatforms((current) => current.includes(platform) ? current.filter((item) => item !== platform) : [...current, platform])} /><span><b>{platform}</b><span>仅生成适配交付包，不会自动外发。</span></span></label>)}</div></fieldset>
        <div className="field-group full"><label htmlFor="criteria">验收标准（每行一条）</label><textarea id="criteria" className="field" value={criteria} onChange={(event) => setCriteria(event.target.value)} /></div>
        <div className="field-group"><label htmlFor="budget">成本上限（元，预占不等于扣费）</label><input id="budget" className="field" type="number" min="0" step="1" value={budgetYuan} onChange={(event) => setBudgetYuan(event.target.value)} /></div>
        <div className="field-group"><label htmlFor="priority">优先级</label><select id="priority" className="field" value={priority} onChange={(event) => setPriority(event.target.value)}><option value="low">低</option><option value="normal">普通</option><option value="high">高</option></select></div>
        <div className="field-group full"><label htmlFor="materials">参考资料</label><input id="materials" className="field" type="file" multiple onChange={(event) => setMaterials(Array.from(event.target.files ?? []))} /><div className="field-help">当前先随任务记录文件名；文件内容需在资产库上传并完成授权后才能进入工作流。</div></div>
      </div>
      <div className="form-actions"><Link className="btn btn-line" to="/tasks">取消</Link><PrimaryButton type="submit" busy={busy} disabled={!industry || !workflowId || settings.loading}>确认并创建任务</PrimaryButton></div>
    </form>
  </>
}
