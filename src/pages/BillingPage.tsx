import { Link } from 'react-router-dom'
import { ErrorState, InlineNotice, LoadingState, Money, PageHeader, RelativeTime, SectionTitle, StatusBadge } from '../components/ui'
import { useRemote } from '../hooks/useRemote'
import { api } from '../lib/api'
import type { BillingSummary } from '../types'

interface LedgerEntry { id: string; job_id?: string; kind: string; amount_cents: number; balance_cents?: number; status?: string; idempotency_key?: string; description?: string; created_at: string }

export default function BillingPage() {
  const remote = useRemote(async () => { const [summary, ledger] = await Promise.all([api.get<BillingSummary>('/billing/summary'), api.get<LedgerEntry[]>('/billing/ledger')]); return { summary, ledger } }, [])
  if (remote.loading) return <LoadingState label="正在读取成本账本…" />
  if (remote.error || !remote.data) return <><PageHeader title="成本账本" /><ErrorState message={remote.error ?? '数据不可用'} onRetry={remote.reload} /></>
  const { summary, ledger } = remote.data
  return <>
    <PageHeader eyebrow="真实成本 · BILLING LEDGER" title="成本与账本" description="当前只记录模型、工具、存储和人工审核的实际成本、预占与退款，不销售静态点数或承诺套餐价格。" />
    <InlineNotice tone="info" title="计费候选边界">正式支付、套餐和发票尚未开放；任务幂等保证重复提交不会重复预占或扣费。</InlineNotice>
    <div className="statbar" style={{ marginTop: 22 }}><div className="st"><b className="small-stat"><Money cents={summary.observed_cost_cents ?? summary.spent_this_month_cents} /></b><span>已观察真实成本</span></div><div className="st"><b className="small-stat"><Money cents={summary.charged_cents} /></b><span>实际向客户扣费</span></div><div className="st"><b className="small-stat">{summary.billing_enabled ? '已启用' : '未启用'}</b><span>商业计费</span></div><div className="st"><b className="small-stat">CNY</b><span>账本币种</span></div></div>
    <SectionTitle index="账" title="不可变账本" />
    <div className="table-wrap"><table className="data-table"><thead><tr><th>类型</th><th>说明</th><th>任务</th><th>金额</th><th>状态</th><th>幂等键</th><th>时间</th></tr></thead><tbody>{ledger.map((entry) => <tr key={entry.id}><td>{entry.kind}</td><td>{entry.description ?? '—'}</td><td>{entry.job_id ? <Link to={`/jobs/${entry.job_id}`}>{entry.job_id.slice(0, 10)}</Link> : '—'}</td><td className={entry.amount_cents < 0 ? 'ok-text' : ''}><Money cents={entry.amount_cents} /></td><td><StatusBadge status={entry.status ?? 'done'} /></td><td className="mono">{entry.idempotency_key?.slice(0, 14) ?? '—'}</td><td><RelativeTime value={entry.created_at} /></td></tr>)}</tbody></table></div>
  </>
}
