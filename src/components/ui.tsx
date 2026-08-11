import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { AlertCircle, CheckCircle2, LoaderCircle, RefreshCw, WifiOff } from 'lucide-react'
import { Link } from 'react-router-dom'
import { industryMeta, jobStatusLabel, stageStatusLabel } from '../data/catalog'

export function PageHeader({ eyebrow, title, description, actions, crumbs }: { eyebrow?: string; title: string; description?: ReactNode; actions?: ReactNode; crumbs?: ReactNode }) {
  return (
    <header className="page-head app-page-head">
      {crumbs ? <div className="crumb">{crumbs}</div> : null}
      <div className="page-head-row">
        <div>
          {eyebrow ? <div className="dept-tag"><i />{eyebrow}</div> : null}
          <h1>{title}</h1>
          {description ? <div className="sub">{description}</div> : null}
        </div>
        {actions ? <div className="page-actions">{actions}</div> : null}
      </div>
    </header>
  )
}

export function SectionTitle({ index, title, action }: { index: string; title: string; action?: ReactNode }) {
  return <div className="sec"><span className="n">{index}</span><h2>{title}</h2><div className="line" />{action}</div>
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const kind = ['done', 'passed', 'enabled', 'active', 'sent'].includes(status)
    ? 'b-ok'
    : ['running', 'processing'].includes(status)
      ? 'b-run'
      : ['failed', 'cancelled', 'blocked', 'gate_blocked', 'revoked'].includes(status)
        ? 'b-stop'
        : ['awaiting_review', 'pending', 'needs_review'].includes(status)
          ? 'b-gold'
          : 'b-wait'
  const text = label ?? jobStatusLabel[status] ?? stageStatusLabel[status] ?? status
  return <span className={`badge ${kind}`}>{kind === 'b-run' ? <span className="dot" /> : null}{text}</span>
}

export function IndustryBadge({ industry }: { industry: string }) {
  const meta = industryMeta[industry] ?? { label: industry, color: '#8A94A6' }
  return <span className="industry-badge" style={{ '--industry-color': meta.color } as React.CSSProperties}><i />{meta.label}</span>
}

export function PrimaryButton({ children, busy, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  return <button className="btn btn-solid" {...props} disabled={props.disabled || busy}>{busy ? <LoaderCircle size={15} className="spin" /> : null}{children}</button>
}

export function GoldButton({ children, busy, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  return <button className="btn btn-gold" {...props} disabled={props.disabled || busy}>{busy ? <LoaderCircle size={15} className="spin" /> : null}{children}</button>
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-glyph">空</div><h3>{title}</h3><p>{description}</p>{action ? <div className="empty-actions">{action}</div> : null}</div>
}

export function LoadingState({ label = '正在读取真实数据…' }: { label?: string }) {
  return <div className="loading-state"><LoaderCircle className="spin" size={20} /><span>{label}</span></div>
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className="error-state" role="alert"><WifiOff size={20} /><div><b>数据暂不可用</b><p>{message}</p></div>{onRetry ? <button className="btn btn-line" onClick={onRetry}><RefreshCw size={14} />重试</button> : null}</div>
}

export function InlineNotice({ tone = 'info', title, children }: { tone?: 'info' | 'success' | 'warning' | 'danger'; title: string; children: ReactNode }) {
  const Icon = tone === 'success' ? CheckCircle2 : AlertCircle
  return <div className={`inline-notice notice-${tone}`}><Icon size={18} /><div><b>{title}</b><div>{children}</div></div></div>
}

export function Money({ cents, currency = 'CNY' }: { cents?: number | null; currency?: string }) {
  if (cents === undefined || cents === null) return <span>—</span>
  return <span>{new Intl.NumberFormat('zh-CN', { style: 'currency', currency }).format(cents / 100)}</span>
}

export function RelativeTime({ value }: { value?: string | null }) {
  if (!value) return <span>—</span>
  const date = new Date(value)
  return <time dateTime={value}>{Number.isNaN(date.valueOf()) ? value : date.toLocaleString('zh-CN', { hour12: false })}</time>
}

export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return <Link className="back-link" to={to}>← {children}</Link>
}
