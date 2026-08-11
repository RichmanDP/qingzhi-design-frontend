import { CheckCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EmptyState, ErrorState, LoadingState, PageHeader, RelativeTime, StatusBadge } from '../components/ui'
import { useRemote } from '../hooks/useRemote'
import { api } from '../lib/api'
import type { Notification } from '../types'

export default function NotificationsPage() {
  const notifications = useRemote(() => api.get<Notification[]>('/notifications'), [])
  async function markRead(notification: Notification) { await api.post(`/notifications/${notification.id}/read`, {}); await notifications.reload() }
  return <>
    <PageHeader eyebrow="站内提醒 · NOTIFICATIONS" title="通知中心" description="审批、失败、质检和交付提醒先在站内可靠落库；飞书/企微未配置时不会假装发送成功。" />
    {notifications.loading ? <LoadingState /> : notifications.error ? <ErrorState message={notifications.error} onRetry={notifications.reload} /> : notifications.data?.length ? <div className="job-card-list">{notifications.data.map((notification) => { const jobId = notification.job_id ?? (notification.resource_type === 'job' ? notification.resource_id : null); const isRead = Boolean(notification.read_at ?? notification.read); return <article className="job-card" key={notification.id}><div><h3>{notification.title}</h3><p>{notification.body ?? notification.message}</p><div className="job-card-meta"><StatusBadge status={isRead ? 'done' : 'pending'} label={isRead ? '已读' : '未读'} /><span className="badge b-wait">{notification.channel ?? '站内'}</span><RelativeTime value={notification.created_at} /></div></div><aside>{jobId ? <Link className="btn btn-line" to={`/jobs/${jobId}`}>查看任务</Link> : null}{!isRead ? <button className="btn btn-line" style={{ marginTop: 8 }} onClick={() => void markRead(notification)}><CheckCheck size={14} />标为已读</button> : null}</aside></article> })}</div> : <EmptyState title="暂无通知" description="需要审批、失败恢复或交付确认时，通知会出现在这里。" />}
  </>
}
