import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, ErrorState, IndustryBadge, LoadingState, PageHeader, RelativeTime, StatusBadge } from '../components/ui'
import { industryMeta } from '../data/catalog'
import { useRemote } from '../hooks/useRemote'
import { api } from '../lib/api'
import type { Job } from '../types'

export default function TasksPage() {
  const jobs = useRemote(() => api.get<Job[]>('/jobs'), [])
  const [query, setQuery] = useState('')
  const [industry, setIndustry] = useState('all')
  const [status, setStatus] = useState('all')
  const filtered = useMemo(() => (jobs.data ?? []).filter((job) => {
    const text = `${job.title} ${typeof job.brief === 'string' ? job.brief : JSON.stringify(job.brief)} ${job.display_id ?? job.id}`.toLowerCase()
    return (!query || text.includes(query.toLowerCase())) && (industry === 'all' || job.industry === industry) && (status === 'all' || job.status === status)
  }), [jobs.data, query, industry, status])

  return <>
    <PageHeader eyebrow="统一任务账本 · TASK LEDGER" title="任务中心" description="聚合内容、专家、会议、视频和工具任务的权威状态；搜索和筛选不会复制第二套状态。" actions={<Link className="btn btn-gold" to="/tasks/new">＋ 下达任务</Link>} />
    <div className="toolbar">
      <div className="search-field"><Search size={16} /><input aria-label="搜索任务" placeholder="搜索标题、Brief 或编号" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
      <select aria-label="按行业筛选" value={industry} onChange={(event) => setIndustry(event.target.value)}><option value="all">全部行业</option>{Object.entries(industryMeta).filter(([key]) => key !== 'marketing').map(([key, value]) => <option value={key} key={key}>{value.label}</option>)}</select>
      <select aria-label="按状态筛选" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">全部状态</option><option value="queued">排队中</option><option value="running">进行中</option><option value="awaiting_review">待审批</option><option value="gate_blocked">质检拦截</option><option value="paused">已暂停</option><option value="done">已完成</option><option value="failed">失败</option><option value="cancelled">已取消</option></select>
      <div className="toolbar-spacer" /><span className="muted">{filtered.length} 条</span>
    </div>
    {jobs.loading ? <LoadingState /> : jobs.error ? <ErrorState message={jobs.error} onRetry={jobs.reload} /> : filtered.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>任务</th><th>行业</th><th>状态</th><th>审批模式</th><th>当前节点</th><th>更新时间</th><th>版本</th></tr></thead><tbody>{filtered.map((job) => <tr key={job.id}><td className="row-title"><Link to={`/jobs/${job.id}`}>{job.title}</Link><small className="mono">#{job.display_id ?? job.id.slice(0, 8)} · 来源：{job.source ?? 'manual'}</small></td><td><IndustryBadge industry={job.industry} /></td><td><StatusBadge status={job.status} /></td><td>{job.approval_mode}</td><td>{job.current_stage ?? job.stage_runs?.find((stage) => ['running', 'awaiting_review', 'failed'].includes(stage.status))?.name ?? '—'}</td><td><RelativeTime value={job.updated_at} /></td><td className="mono">v{job.version}</td></tr>)}</tbody></table></div> : <EmptyState title="没有匹配任务" description="调整搜索或筛选条件，或下达一条新任务。" action={<Link className="btn btn-solid" to="/tasks/new">下达任务</Link>} />}
  </>
}
