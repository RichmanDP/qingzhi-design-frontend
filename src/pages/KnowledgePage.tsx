import { Plus, Search } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { ErrorState, InlineNotice, LoadingState, PageHeader, PrimaryButton, RelativeTime, StatusBadge } from '../components/ui'
import { industryMeta } from '../data/catalog'
import { useRemote } from '../hooks/useRemote'
import { api, humanError } from '../lib/api'
import type { KnowledgeItem } from '../types'

export default function KnowledgePage() {
  const items = useRemote(() => api.get<KnowledgeItem[]>('/knowledge-items'), [])
  const [query, setQuery] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ title: '', content: '', kind: 'fact', source_url: '', valid_until: '', scope: 'content' })
  const filtered = useMemo(() => (items.data ?? []).filter((item) => `${item.title} ${item.content} ${item.source_url}`.toLowerCase().includes(query.toLowerCase())), [items.data, query])

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null)
    try {
      await api.post('/knowledge-items', { title: form.title, content: form.content, kind: form.kind, source_url: form.source_url || null, valid_until: form.valid_until ? `${form.valid_until}T23:59:59+08:00` : null, scope: [form.scope], quality: 'unverified', enabled: true }, true)
      setShowForm(false); setForm({ title: '', content: '', kind: 'fact', source_url: '', valid_until: '', scope: 'content' }); await items.reload()
    } catch (reason) { setError(humanError(reason)) } finally { setBusy(false) }
  }

  async function toggle(item: KnowledgeItem) {
    try { await api.patch(`/knowledge-items/${item.id}`, { enabled: item.enabled === false, expected_version: item.version ?? 1 }); await items.reload() }
    catch (reason) { setError(humanError(reason)) }
  }

  return <>
    <PageHeader eyebrow="组织记忆 · KNOWLEDGE" title="企业档案与知识库" description="每条事实都有来源、版本、有效期和适用范围；过期或停用内容不会静默进入最终交付。" actions={<button className="btn btn-gold" onClick={() => setShowForm((value) => !value)}><Plus size={15} />新增知识</button>} />
    {showForm ? <form className="panel form-panel" onSubmit={submit} style={{ marginBottom: 22 }}>
      <div className="form-grid"><div className="field-group"><label htmlFor="knowledge-title">标题</label><input id="knowledge-title" className="field" required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></div><div className="field-group"><label htmlFor="knowledge-kind">类型</label><select id="knowledge-kind" className="field" value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value })}><option value="fact">企业事实</option><option value="term">术语</option><option value="policy">政策/规则</option><option value="prohibited_expression">禁用表达</option><option value="company_profile">企业档案</option><option value="source">来源资料</option></select></div><div className="field-group full"><label htmlFor="knowledge-content">内容</label><textarea id="knowledge-content" className="field" required value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} /></div><div className="field-group"><label htmlFor="knowledge-industry">适用范围</label><select id="knowledge-industry" className="field" value={form.scope} onChange={(event) => setForm({ ...form, scope: event.target.value })}>{Object.entries(industryMeta).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}<option value="tenant">全企业</option></select></div><div className="field-group"><label htmlFor="knowledge-valid">有效期</label><input id="knowledge-valid" className="field" type="date" value={form.valid_until} onChange={(event) => setForm({ ...form, valid_until: event.target.value })} /></div><div className="field-group full"><label htmlFor="source-url">来源 URL（无 URL 时请在资产库上传文件）</label><input id="source-url" className="field" type="url" value={form.source_url} onChange={(event) => setForm({ ...form, source_url: event.target.value })} /></div></div>
      {error ? <div style={{ marginTop: 16 }}><InlineNotice tone="danger" title="保存失败">{error}</InlineNotice></div> : null}<div className="form-actions"><button className="btn btn-line" type="button" onClick={() => setShowForm(false)}>取消</button><PrimaryButton busy={busy} type="submit">保存新版本</PrimaryButton></div>
    </form> : null}
    {!showForm && error ? <div style={{ marginBottom: 18 }}><InlineNotice tone="danger" title="操作失败">{error}</InlineNotice></div> : null}
    <div className="toolbar"><div className="search-field"><Search size={16} /><input aria-label="搜索知识" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题、内容或来源" /></div><div className="toolbar-spacer" /><span className="muted">{filtered.length} 条知识</span></div>
    {items.loading ? <LoadingState /> : items.error ? <ErrorState message={items.error} onRetry={items.reload} /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>知识</th><th>行业/范围</th><th>来源</th><th>有效期</th><th>质量/状态</th><th>版本</th><th>操作</th></tr></thead><tbody>{filtered.map((item) => <tr key={item.id}><td className="row-title"><b>{item.title}</b><small>{item.content?.slice(0, 90)}</small></td><td>{Array.isArray(item.scope) ? item.scope.map((scope) => industryMeta[scope]?.label ?? scope).join(' / ') : item.scope ?? '全企业'}</td><td>{item.source_url ? <a href={item.source_url} target="_blank" rel="noreferrer">打开来源</a> : '文件/内部来源'}</td><td><RelativeTime value={item.valid_until} /></td><td><StatusBadge status={item.enabled === false ? 'disabled' : 'active'} label={`${item.quality ?? '待评估'} · ${item.enabled === false ? '停用' : '启用'}`} /></td><td className="mono">v{item.version ?? 1}</td><td><button className="btn btn-line" onClick={() => void toggle(item)}>{item.enabled === false ? '启用' : '停用'}</button></td></tr>)}</tbody></table></div>}
  </>
}
