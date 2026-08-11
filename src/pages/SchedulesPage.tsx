import { Pause, Play, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { EmptyState, ErrorState, InlineNotice, LoadingState, PageHeader, PrimaryButton, RelativeTime, StatusBadge } from '../components/ui'
import { approvalModes, industryMeta } from '../data/catalog'
import { useRemote } from '../hooks/useRemote'
import { api, humanError } from '../lib/api'
import type { ApprovalMode, Industry, Schedule, WorkflowDefinition } from '../types'

interface TenantSettings { timezone?: string; default_approval_mode?: string; enabled_industries?: string[] }

export default function SchedulesPage() {
  const remote = useRemote(async () => { const [schedules, workflows, settings] = await Promise.all([api.get<Schedule[]>('/schedules'), api.get<WorkflowDefinition[]>('/workflows'), api.get<TenantSettings>('/settings')]); return { schedules, workflows, settings } }, [])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', cadence: '0 9 * * 1', workflow_id: '', industry: 'content' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const enabledIndustries = remote.data?.settings.enabled_industries
  const selectableIndustries = useMemo(() => Object.entries(industryMeta).filter(([key]) => key !== 'marketing' && (!Array.isArray(enabledIndustries) || enabledIndustries.includes(key))), [enabledIndustries])
  useEffect(() => {
    if (!Array.isArray(enabledIndustries) || enabledIndustries.includes(form.industry)) return
    setForm((current) => ({ ...current, industry: selectableIndustries[0]?.[0] ?? '', workflow_id: '' }))
  }, [enabledIndustries, form.industry, selectableIndustries])
  const timezone = remote.data?.settings.timezone || 'Asia/Shanghai'
  const configuredApproval = approvalModes.some((mode) => mode.id === remote.data?.settings.default_approval_mode)
    ? remote.data?.settings.default_approval_mode as ApprovalMode
    : 'key'
  const defaultApproval = approvalModes.find((mode) => mode.id === configuredApproval)?.unavailableFor?.includes(form.industry as Industry)
    ? 'key'
    : configuredApproval
  const availableWorkflows = (remote.data?.workflows ?? []).filter((workflow) => workflow.industry === form.industry && workflow.enabled !== false)
  async function create(event: FormEvent) {
    event.preventDefault()
    if (!form.industry || !form.workflow_id) { setError('请先选择已启用行业和工作流。'); return }
    setBusy(true); setError(null)
    try {
      await api.post('/schedules', { name: form.name, cron: form.cadence, timezone, enabled: true, job_template: { title: form.name, brief: `由定时规则“${form.name}”触发的任务，请按工作流生成可评审产物。`, industry: form.industry, workflow_id: form.workflow_id, approval_mode: defaultApproval, priority: 'normal', platforms: [], acceptance_criteria: ['保留来源与版本', '外部写入前人工终审'], attachments: [], budget_cents: 0, source: 'schedule' } }, true)
      setShowForm(false); await remote.reload()
    } catch (reason) { setError(humanError(reason)) } finally { setBusy(false) }
  }
  async function patch(schedule: Schedule, enabled: boolean) { setError(null); try { await api.patch(`/schedules/${schedule.id}`, { enabled, expected_version: schedule.version ?? 1 }); await remote.reload() } catch (reason) { setError(humanError(reason)) } }
  async function remove(schedule: Schedule) { if (!window.confirm(`删除定时任务“${schedule.name}”？`)) return; try { await api.delete(`/schedules/${schedule.id}?expected_version=${schedule.version ?? 1}`); await remote.reload() } catch (reason) { setError(humanError(reason)) } }
  const scheduleIndustry = (schedule: Schedule) => schedule.industry ?? String(schedule.job_template?.industry ?? '')
  const scheduleWorkflow = (schedule: Schedule) => schedule.workflow_id ?? String(schedule.job_template?.workflow_id ?? '—')
  return <>
    <PageHeader eyebrow="后台调度 · SCHEDULES" title="定时任务" description="调度器只负责创建幂等任务；外部发布和不确定副作用不会因定时规则而绕过最终确认。" actions={<button className="btn btn-gold" onClick={() => setShowForm((value) => !value)}><Plus size={15} />新建规则</button>} />
    {showForm ? <form className="panel form-panel" onSubmit={create}><div className="form-grid"><div className="field-group"><label htmlFor="schedule-name">名称</label><input id="schedule-name" className="field" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="每周一竞品公开信息周报" /></div><div className="field-group"><label htmlFor="schedule-industry">行业</label><select id="schedule-industry" className="field" value={form.industry} disabled={selectableIndustries.length === 0} onChange={(event) => setForm({ ...form, industry: event.target.value, workflow_id: '' })}>{selectableIndustries.length ? selectableIndustries.map(([key, value]) => <option key={key} value={key}>{value.label}</option>) : <option value="">没有已启用行业</option>}</select>{Array.isArray(enabledIndustries) && selectableIndustries.length === 0 ? <div className="field-help danger-text">租户未启用任何行业，不能创建新计划。</div> : null}</div><div className="field-group"><label htmlFor="schedule-workflow">工作流</label><select id="schedule-workflow" className="field" required value={form.workflow_id} disabled={!form.industry} onChange={(event) => setForm({ ...form, workflow_id: event.target.value })}><option value="">请选择</option>{availableWorkflows.map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.name} · v{workflow.definition_version ?? workflow.version ?? '1.0.0'}</option>)}</select></div><div className="field-group"><label htmlFor="schedule-cron">Cron（{timezone}）</label><input id="schedule-cron" className="field mono" required value={form.cadence} onChange={(event) => setForm({ ...form, cadence: event.target.value })} /><div className="field-help">示例：0 9 * * 1 = 每周一 09:00；采用当前租户默认时区。</div></div><div className="field-group full"><InlineNotice title="新任务默认值">到点创建的任务采用“{approvalModes.find((mode) => mode.id === defaultApproval)?.name ?? defaultApproval}”；医疗等行业安全限制仍优先于租户默认。</InlineNotice></div></div>{error ? <InlineNotice tone="danger" title="保存失败">{error}</InlineNotice> : null}<div className="form-actions"><button type="button" className="btn btn-line" onClick={() => setShowForm(false)}>取消</button><PrimaryButton busy={busy} type="submit" disabled={!form.industry || !form.workflow_id}>保存调度规则</PrimaryButton></div></form> : null}
    {!showForm && error ? <InlineNotice tone="danger" title="操作失败">{error}</InlineNotice> : null}
    <div style={{ marginTop: 22 }}>{remote.loading ? <LoadingState /> : remote.error ? <ErrorState message={remote.error} onRetry={remote.reload} /> : remote.data?.schedules.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>规则</th><th>Cron</th><th>工作流</th><th>状态</th><th>下次运行</th><th>上次运行</th><th>操作</th></tr></thead><tbody>{remote.data.schedules.map((schedule) => <tr key={schedule.id}><td className="row-title"><b>{schedule.name}</b><small>{industryMeta[scheduleIndustry(schedule)]?.label ?? scheduleIndustry(schedule)}</small></td><td className="mono">{schedule.cron ?? schedule.cadence}</td><td className="mono">{scheduleWorkflow(schedule)}</td><td><StatusBadge status={schedule.enabled ? 'enabled' : 'disabled'} label={schedule.enabled ? '已启用' : '已停用'} /></td><td><RelativeTime value={schedule.next_run_at} /></td><td><RelativeTime value={schedule.last_run_at} /></td><td><div className="command-bar"><button className="btn btn-line" onClick={() => void patch(schedule, !schedule.enabled)}>{schedule.enabled ? <Pause size={14} /> : <Play size={14} />}{schedule.enabled ? '停用' : '启用'}</button><button className="btn btn-line danger-text" aria-label={`删除${schedule.name}`} title={`删除${schedule.name}`} onClick={() => void remove(schedule)}><Trash2 size={14} /></button></div></td></tr>)}</tbody></table></div> : <EmptyState title="没有定时任务" description="新建调度规则后，系统会在到点时创建真实任务并保留来源。" />}</div>
  </>
}
