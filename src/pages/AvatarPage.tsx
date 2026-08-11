import { ImagePlus, ShieldCheck, UserRoundCheck, Video } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, ErrorState, InlineNotice, LoadingState, PageHeader, PrimaryButton, RelativeTime, SectionTitle, StatusBadge } from '../components/ui'
import { departments, industryMeta } from '../data/catalog'
import { useRemote } from '../hooks/useRemote'
import { api, humanError } from '../lib/api'

interface ConsentRecord { id: string; subject_name: string; media_type: string; purpose: string; scope?: string[]; valid_from: string; valid_until: string; evidence_ref: string; revoked_at?: string | null; status: string; version?: number }

export default function AvatarPage() {
  const seed = departments.avatar
  const meta = industryMeta.avatar
  const consents = useRemote(() => api.get<ConsentRecord[]>('/avatar-authorizations'), [])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ subject_name: '', media_type: 'portrait', purpose: '企业内部口播草稿', scope: ['internal_draft'], valid_until: '', evidence_ref: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function create(event: FormEvent) { event.preventDefault(); setBusy(true); setError(null); try { await api.post('/avatar-authorizations', { subject_name: form.subject_name, media_type: form.media_type, purpose: form.purpose, scope: form.scope, valid_from: new Date().toISOString(), valid_until: new Date(`${form.valid_until}T23:59:59+08:00`).toISOString(), evidence_ref: form.evidence_ref }, true); setShowForm(false); await consents.reload() } catch (reason) { setError(humanError(reason)) } finally { setBusy(false) } }
  async function revoke(consent: ConsentRecord) { const reason = window.prompt(`撤销“${consent.subject_name}”的授权原因（后续生成与定时发布会被阻断）`); if (!reason) return; try { await api.post(`/avatar-authorizations/${consent.id}/revoke`, { expected_version: consent.version ?? 1, reason }); await consents.reload() } catch (reason) { setError(humanError(reason)) } }
  const activeConsent = consents.data?.some((consent) => consent.status === 'active' && !consent.revoked_at && new Date(consent.valid_until) > new Date())

  return <>
    <PageHeader eyebrow={`${meta.label} · ${meta.eyebrow}`} title={seed.headline} description={seed.description} crumbs={<><Link to="/app">集团楼层</Link> / <b>数字人摄影棚</b></>} actions={<button className="btn btn-gold" onClick={() => setShowForm((value) => !value)}><UserRoundCheck size={15} />登记授权</button>} />
    <InlineNotice tone="warning" title="真实视频 Provider 默认关闭">本地候选版真实保存授权和任务状态，但不会伪造形象/声音克隆结果；配置经审核的供应商连接器后才能执行生成节点。</InlineNotice>
    {showForm ? <form className="panel form-panel" onSubmit={create} style={{ marginTop: 20 }}><div className="form-grid"><div className="field-group"><label htmlFor="consent-subject">授权主体</label><input id="consent-subject" className="field" required value={form.subject_name} onChange={(event) => setForm({ ...form, subject_name: event.target.value })} /></div><div className="field-group"><label htmlFor="consent-purpose">明确用途</label><input id="consent-purpose" className="field" required value={form.purpose} onChange={(event) => setForm({ ...form, purpose: event.target.value })} /></div><div className="field-group"><label htmlFor="consent-media">授权能力</label><select id="consent-media" className="field" value={form.media_type} onChange={(event) => setForm({ ...form, media_type: event.target.value })}><option value="portrait">仅肖像</option><option value="voice">仅声音</option><option value="portrait_and_voice">肖像与声音</option></select></div><div className="field-group"><label htmlFor="consent-expiry">有效期至</label><input id="consent-expiry" className="field" type="date" required value={form.valid_until} onChange={(event) => setForm({ ...form, valid_until: event.target.value })} /></div><div className="field-group full"><label htmlFor="consent-evidence">授权证据引用</label><input id="consent-evidence" className="field" required value={form.evidence_ref} onChange={(event) => setForm({ ...form, evidence_ref: event.target.value })} placeholder="资产 ID、合同编号或授权文件路径" /></div></div>{error ? <InlineNotice tone="danger" title="保存失败">{error}</InlineNotice> : null}<div className="form-actions"><button className="btn btn-line" type="button" onClick={() => setShowForm(false)}>取消</button><PrimaryButton type="submit" busy={busy}>保存授权记录</PrimaryButton></div></form> : null}
    <SectionTitle index="授" title="授权记录" />
    {consents.loading ? <LoadingState /> : consents.error ? <ErrorState message={consents.error} onRetry={consents.reload} /> : consents.data?.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>主体</th><th>能力</th><th>用途</th><th>有效期</th><th>证据</th><th>状态</th><th>操作</th></tr></thead><tbody>{consents.data.map((consent) => <tr key={consent.id}><td><b>{consent.subject_name}</b></td><td>{consent.media_type}</td><td>{consent.purpose}</td><td><RelativeTime value={consent.valid_until} /></td><td className="mono">{consent.evidence_ref}</td><td><StatusBadge status={consent.status} /></td><td><button className="btn btn-line danger-text" disabled={consent.status !== 'active'} onClick={() => void revoke(consent)}>撤销</button></td></tr>)}</tbody></table></div> : <EmptyState title="尚无肖像或声音授权" description="没有有效授权时，数字人工作流会在服务端阻断。" />}
    <SectionTitle index="流" title="授权先行的制作流" />
    <div className="pipe app-pipe">{seed.flow.map((node) => <div className={`pnode ${node.type === 'human' ? 'review' : 'wait'}`} key={node.id}><span className="pn-type">{node.type === 'human' ? '人工' : '串行'}</span><div className="pn-av">{node.glyph}</div><div className="pn-name">{node.name}</div><div className="pn-st">定义节点</div></div>)}</div>
    <SectionTitle index="编" title="岗位编制" />
    <div className="grid-seat">{seed.roles.map((role) => <article className="seat" key={role.code}><div className="s-band" style={{ background: meta.color }} /><div className="s-top"><div className="s-av" style={{ background: meta.color }}>{role.glyph}</div><div><div className="s-name">{role.name}</div><div className="s-role">{role.group}</div></div></div><p>{role.description}</p><div className="s-foot"><span className="s-num">{role.code}</span><span className="badge b-wait">能力定义</span></div></article>)}</div>
    <SectionTitle index="联" title="创建数字人口播任务" />
    <div className="split"><section className="panel"><h3><ImagePlus size={17} /> 先准备素材</h3><p>在资产库上传有授权记录的肖像/声音样本和验收后的口播稿；文件会计算校验和并保留版本。</p><Link className="btn btn-line" style={{ marginTop: 14 }} to="/assets">进入资产库</Link></section><section className="panel" style={{ borderLeft: `3px solid ${meta.color}` }}><h3><Video size={17} /> 再创建任务</h3><p>{activeConsent ? '检测到有效授权，可进入 Brief 页面选择数字人工作流。' : '当前无有效授权；可以填写任务，但生成节点会被 Gate 阻断。'}</p><Link className={`btn ${activeConsent ? 'btn-solid' : 'btn-line'}`} style={{ marginTop: 14 }} to="/tasks/new?industry=avatar"><ShieldCheck size={14} />填写数字人 Brief</Link></section></div>
  </>
}
