import { RefreshCcw, Send } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EmptyState, ErrorState, InlineNotice, LoadingState, PageHeader, RelativeTime, StatusBadge } from '../components/ui'
import { useRemote } from '../hooks/useRemote'
import { api } from '../lib/api'

interface Delivery { id: string; job_id: string; artifact_id?: string; channel?: string; mode?: string; destination?: string; status: string; external_id?: string | null; external_reference?: string | null; idempotency_key?: string; uncertain?: boolean; uncertainty_reason?: string | null; created_at?: string; updated_at?: string; version?: number }

export default function ChannelsPage() {
  const deliveries = useRemote(() => api.get<Delivery[]>('/deliveries'), [])
  async function reconcile(delivery: Delivery) { const note = window.prompt('请输入人工对账依据（平台回执、截图编号或说明）'); if (!note) return; await api.post(`/deliveries/${delivery.id}/reconcile`, { status: 'confirmed', note, expected_version: delivery.version ?? 1 }, true); await deliveries.reload() }
  return <>
    <PageHeader eyebrow="草稿与外部副作用 · CHANNELS" title="渠道与交付" description="交付服务重新校验最新 Artifact 哈希、政策版本与 GateAttestation；状态未知的外部提交禁止自动重放。" />
    <InlineNotice tone="warning" title="本地默认只生成草稿"><Send size={13} /> 没有配置连接器、有效凭证和最终人工确认时，系统不会向公众号、飞书或其他平台写入。</InlineNotice>
    <div style={{ marginTop: 22 }}>{deliveries.loading ? <LoadingState /> : deliveries.error ? <ErrorState message={deliveries.error} onRetry={deliveries.reload} /> : deliveries.data?.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>交付</th><th>任务</th><th>渠道/模式</th><th>状态</th><th>外部标识</th><th>不确定原因</th><th>时间</th><th>操作</th></tr></thead><tbody>{deliveries.data.map((delivery) => <tr key={delivery.id}><td className="mono">{delivery.id.slice(0, 10)}</td><td><Link to={`/jobs/${delivery.job_id}`}>{delivery.job_id.slice(0, 10)}</Link></td><td>{delivery.channel ?? '本地'} / {delivery.destination ?? delivery.mode ?? 'local_package'}</td><td><StatusBadge status={delivery.status} /></td><td className="mono">{delivery.external_reference ?? delivery.external_id ?? '—'}</td><td>{delivery.uncertainty_reason ?? '—'}</td><td><RelativeTime value={delivery.updated_at ?? delivery.created_at} /></td><td>{delivery.uncertain || delivery.status === 'unknown' || delivery.uncertainty_reason ? <button className="btn btn-line" onClick={() => void reconcile(delivery)}><RefreshCcw size={14} />人工对账</button> : '—'}</td></tr>)}</tbody></table></div> : <EmptyState title="暂无交付记录" description="工单最新产物通过 Gate 并取得 Attestation 后，可在工单详情创建本地草稿交付。" />}</div>
  </>
}
