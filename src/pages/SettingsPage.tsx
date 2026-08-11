import { Bot, KeyRound, LockKeyhole, Save } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ErrorState, InlineNotice, LoadingState, PageHeader, PrimaryButton, SectionTitle, StatusBadge } from '../components/ui'
import { approvalModes, industryMeta } from '../data/catalog'
import { useRemote } from '../hooks/useRemote'
import { api, humanError } from '../lib/api'

interface TenantSettings {
  tenant_id?: string
  tenant_name?: string
  locale?: string
  timezone?: string
  default_approval_mode?: string
  retention_days?: number
  retention_status?: { enforcement?: string; automatic_deletion?: boolean; last_run_at?: string | null }
  culture_legal_automatic_enabled?: boolean
  enabled_industries?: string[]
  notification_channels?: string[]
  external_publish_requires_confirmation?: boolean
  version?: number
}
interface Connector { id: string; name: string; connector_type: string; status: string; configured: boolean; mode?: string; config?: Record<string, unknown>; version?: number }

export default function SettingsPage() {
  const settings = useRemote(() => api.get<TenantSettings>('/settings'), [])
  const connectors = useRemote(() => api.get<Connector[]>('/connectors'), [])
  const [form, setForm] = useState<TenantSettings>({ tenant_name: '', locale: 'zh-CN', timezone: 'Asia/Shanghai', default_approval_mode: 'key', retention_days: 365, culture_legal_automatic_enabled: false, enabled_industries: ['content', 'drama'], notification_channels: ['in_app'], external_publish_requires_confirmation: true })
  const [secretFor, setSecretFor] = useState<string | null>(null)
  const [secret, setSecret] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { if (settings.data) setForm(settings.data) }, [settings.data])

  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null)
    try { await api.patch('/settings', { tenant_name: form.tenant_name?.trim(), locale: form.locale?.trim(), timezone: form.timezone?.trim(), default_approval_mode: form.default_approval_mode, retention_days: form.retention_days, culture_legal_automatic_enabled: form.culture_legal_automatic_enabled ?? false, enabled_industries: form.enabled_industries, notification_channels: form.notification_channels, external_publish_requires_confirmation: true, expected_version: settings.data?.version ?? 1 }); await settings.reload() }
    catch (reason) { setError(humanError(reason)) } finally { setBusy(false) }
  }

  async function configure(connector: Connector) {
    if (!secret.trim()) { setError('凭证不能为空。'); return }
    setBusy(true); setError(null)
    try { await api.patch(`/connectors/${connector.id}`, { secret, expected_version: connector.version ?? 1 }); setSecret(''); setSecretFor(null); await connectors.reload() }
    catch (reason) { setError(humanError(reason)) } finally { setBusy(false) }
  }

  function toggleIndustry(industry: string) {
    const current = form.enabled_industries ?? []
    setForm({ ...form, enabled_industries: current.includes(industry) ? current.filter((item) => item !== industry) : [...current, industry] })
  }

  function toggleNotificationChannel(channel: string) {
    const current = form.notification_channels ?? []
    setForm({ ...form, notification_channels: current.includes(channel) ? current.filter((item) => item !== channel) : [...current, channel] })
  }

  return <>
    <PageHeader eyebrow="租户策略 · SETTINGS" title="设置与连接器" description="凭证只允许写入更新，服务端不会回显明文；外部写操作默认需要人工最终确认和幂等对账。" />
    {error ? <InlineNotice tone="danger" title="设置未保存">{error}</InlineNotice> : null}
    <SectionTitle index="设" title="租户设置" />
    <InlineNotice tone="info" title="当前生效边界">企业名称会立即显示；默认审批、默认时区和启用行业供新任务与新计划使用。界面语言目前只保存偏好；保留策略每日清理到期的终态任务及幂等记录，不触碰运行中任务。</InlineNotice>
    {settings.loading ? <LoadingState /> : settings.error ? <ErrorState message={settings.error} onRetry={settings.reload} /> : <form className="panel form-panel" onSubmit={save}>
      <div className="form-grid">
        <div className="field-group"><label htmlFor="tenant-name">企业名称</label><input id="tenant-name" className="field" minLength={2} required value={form.tenant_name ?? ''} onChange={(event) => setForm({ ...form, tenant_name: event.target.value })} /></div>
        <div className="field-group"><label htmlFor="tenant-locale">界面语言</label><select id="tenant-locale" className="field" value={form.locale ?? 'zh-CN'} onChange={(event) => setForm({ ...form, locale: event.target.value })}><option value="zh-CN">简体中文（zh-CN）</option><option value="en-US">English（en-US）</option></select><div className="field-help">当前仅保存偏好，SPA 仍使用简体中文。</div></div>
        <div className="field-group"><label htmlFor="tenant-timezone">默认时区</label><input id="tenant-timezone" className="field" required value={form.timezone ?? 'Asia/Shanghai'} onChange={(event) => setForm({ ...form, timezone: event.target.value })} placeholder="Asia/Shanghai" /><div className="field-help">使用 IANA 时区名称；新建计划会采用该值，已有计划不追溯修改。</div></div>
        <div className="field-group"><label htmlFor="default-approval">默认审批模式</label><select id="default-approval" className="field" value={form.default_approval_mode ?? 'key'} onChange={(event) => setForm({ ...form, default_approval_mode: event.target.value })}>{approvalModes.map((mode) => <option value={mode.id} key={mode.id}>{mode.name}</option>)}</select><div className="field-help">新建任务和计划会采用该值；行业禁用规则仍优先。</div></div>
        <div className="field-group"><label htmlFor="retention-days">数据保留天数</label><input id="retention-days" className="field" type="number" min="7" max="3650" value={form.retention_days ?? 365} onChange={(event) => setForm({ ...form, retention_days: Number(event.target.value) })} /><div className="field-help">终态任务及其级联记录、到期幂等记录会被清理；最近执行：{form.retention_status?.last_run_at ? new Date(form.retention_status.last_run_at).toLocaleString() : '尚无记录'}。</div></div>
        <fieldset className="field-group full"><legend className="field-label">启用行业</legend><div className="checkbox-grid">{Object.entries(industryMeta).filter(([key]) => key !== 'marketing').map(([key, value]) => <label className="choice-card" key={key}><input type="checkbox" checked={form.enabled_industries?.includes(key) ?? false} onChange={() => toggleIndustry(key)} /><span><b>{value.label}</b><span>启用对应 WorkflowDefinition。</span></span></label>)}</div><div className={`field-help ${form.enabled_industries?.length ? '' : 'danger-text'}`} role="status">{form.enabled_industries?.length ? '只有已勾选行业可创建新任务；已有任务不追溯取消。' : '当前未启用任何行业；保存后将阻止创建所有新任务与计划。'}</div></fieldset>
        <fieldset className="field-group full"><legend className="field-label">通知渠道偏好</legend><div className="checkbox-grid">{[{ id: 'in_app', name: '站内通知', note: '当前本地候选可用' }, { id: 'email', name: '邮件', note: '仅记录偏好，未配置外发' }, { id: 'feishu', name: '飞书', note: '仅记录偏好，未配置外发' }, { id: 'wechat_work', name: '企业微信', note: '仅记录偏好，未配置外发' }].map((channel) => <label className="choice-card" key={channel.id}><input type="checkbox" checked={form.notification_channels?.includes(channel.id) ?? false} onChange={() => toggleNotificationChannel(channel.id)} /><span><b>{channel.name}</b><span>{channel.note}</span></span></label>)}</div></fieldset>
        <fieldset className="field-group full"><legend className="field-label">文化法务自动化</legend><label className="choice-card"><input type="checkbox" checked={form.culture_legal_automatic_enabled ?? false} onChange={(event) => setForm({ ...form, culture_legal_automatic_enabled: event.target.checked })} /><span><b>允许文化法务任务选择全自动推进</b><span>默认关闭；开启后仍不会跳过法务签发与最终外发确认，管理员签发权保持不变。</span></span></label></fieldset>
        <fieldset className="field-group full"><legend className="field-label">不可逆动作</legend><label className="choice-card disabled"><input type="checkbox" checked readOnly /><span><b>外部发布始终终审</b><span>安全不变量；本地连接器保持 disabled，不能在设置页关闭。</span></span></label></fieldset>
      </div>
      <div className="form-actions"><PrimaryButton type="submit" busy={busy}><Save size={14} />保存设置</PrimaryButton></div>
    </form>}
    <SectionTitle index="模" title="大模型连接" />
    <div className="connector-grid">
      <article className="connector-card">
        <header><h3>Kimi / ModelProfile</h3><StatusBadge status="ready" label="网站直接配置" /></header>
        <p>当前按单用户本地网站运行。Kimi Code 用于本人主动触发的交互；剧本节点与自动化使用 Kimi 开放平台。API Key 只写入本机 Keychain，不经过 Codex 或 CC Switch。</p>
        <Link className="btn btn-solid" to="/settings/control-plane"><Bot size={14} />配置 Kimi 与模型</Link>
      </article>
    </div>
    <SectionTitle index="接" title="服务端连接器" />
    <InlineNotice tone="warning" title="写-only 凭证"><LockKeyhole size={13} /> 保存后页面只显示 configured=true；本地适配器仍保持禁用，不会向外部系统写入。</InlineNotice>
    <div style={{ marginTop: 18 }}>{connectors.loading ? <LoadingState /> : connectors.error ? <ErrorState message={connectors.error} onRetry={connectors.reload} /> : <div className="connector-grid">{connectors.data?.map((connector) => <article className={`connector-card ${!connector.configured ? 'safe-disabled' : ''}`} key={connector.id}><header><h3>{connector.name}</h3><StatusBadge status={connector.status} label={connector.configured ? `已配置 · ${connector.mode ?? 'sandbox'}` : '未配置'} /></header><p>{connector.connector_type} · production_ready={String(connector.config?.production_ready ?? false)}</p>{secretFor === connector.id ? <div><label className="field-label" htmlFor={`secret-${connector.id}`}>新凭证</label><input id={`secret-${connector.id}`} className="field" type="password" autoComplete="new-password" value={secret} onChange={(event) => setSecret(event.target.value)} /><div className="command-bar" style={{ marginTop: 10 }}><button className="btn btn-solid" disabled={busy} onClick={() => void configure(connector)}><KeyRound size={14} />写入服务端</button><button className="btn btn-line" onClick={() => { setSecretFor(null); setSecret('') }}>取消</button></div></div> : <button className="btn btn-line" onClick={() => setSecretFor(connector.id)}><KeyRound size={14} />{connector.configured ? '更新凭证' : '配置凭证'}</button>}</article>)}</div>}</div>
  </>
}
