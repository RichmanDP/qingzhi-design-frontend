import { Download, FileArchive, Upload } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { EmptyState, ErrorState, InlineNotice, LoadingState, PageHeader, PrimaryButton, RelativeTime, StatusBadge } from '../components/ui'
import { useRemote } from '../hooks/useRemote'
import { api, humanError } from '../lib/api'
import type { Artifact } from '../types'

interface AssetArtifact extends Artifact { file_name?: string; original_filename?: string; mime_type?: string; size_bytes?: number; authorization_scope?: string; authorization_status?: string; download_url?: string; status?: string }

export default function AssetsPage() {
  const assets = useRemote(() => api.get<AssetArtifact[]>('/artifacts'), [])
  const [showUpload, setShowUpload] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [scope, setScope] = useState('tenant')
  const [jobId, setJobId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function upload(event: FormEvent) {
    event.preventDefault(); if (!file) return
    setBusy(true); setError(null)
    const form = new FormData(); form.set('file', file); form.set('authorization_scope', scope); if (scope === 'job') form.set('job_id', jobId.trim())
    try { await api.upload('/artifacts/upload', form); setShowUpload(false); setFile(null); await assets.reload() }
    catch (reason) { setError(humanError(reason)) } finally { setBusy(false) }
  }

  async function downloadAsset(asset: AssetArtifact) {
    try {
      const blob = await api.download(`/artifacts/${asset.id}/download`)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = asset.original_filename ?? asset.file_name ?? asset.name ?? 'qingzhi-asset'; anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (reason) { setError(humanError(reason)) }
  }

  return <>
    <PageHeader eyebrow="素材与产物 · ASSETS" title="资产库" description="上传素材和任务产物按校验和、授权范围与版本保存；文件名相同也不会静默覆盖旧版本。" actions={<button className="btn btn-gold" onClick={() => setShowUpload((value) => !value)}><Upload size={15} />上传资产</button>} />
    <InlineNotice tone="warning" title="授权先于使用">第三方图片、短剧素材、肖像和声音必须记录授权范围；撤销或过期后，新任务会被阻断。</InlineNotice>
    {showUpload ? <form className="panel form-panel" onSubmit={upload} style={{ marginTop: 20 }}><div className="form-grid"><div className="field-group full"><label htmlFor="asset-file">选择文件</label><input className="field" id="asset-file" type="file" required onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></div><div className="field-group"><label htmlFor="asset-scope">用途范围</label><select className="field" id="asset-scope" value={scope} onChange={(event) => { setScope(event.target.value); if (event.target.value !== 'job') setJobId('') }}><option value="tenant">企业内部知识与任务</option><option value="job">仅绑定任务</option><option value="avatar_authorized">已完成肖像/声音授权</option></select></div>{scope === 'job' ? <div className="field-group"><label htmlFor="asset-job-id">绑定任务 ID</label><input className="field mono" id="asset-job-id" required value={jobId} onChange={(event) => setJobId(event.target.value)} placeholder="job_…" /><div className="field-help">服务端会校验该任务属于当前租户。</div></div> : null}</div>{error ? <div style={{ marginTop: 16 }}><InlineNotice tone="danger" title="上传失败">{error}</InlineNotice></div> : null}<div className="form-actions"><button className="btn btn-line" type="button" onClick={() => setShowUpload(false)}>取消</button><PrimaryButton busy={busy} disabled={!file || (scope === 'job' && !jobId.trim())} type="submit">上传并计算校验和</PrimaryButton></div></form> : null}
    <div style={{ marginTop: 22 }}>{assets.loading ? <LoadingState /> : assets.error ? <ErrorState message={assets.error} onRetry={assets.reload} /> : assets.data?.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>文件/产物</th><th>类型</th><th>来源任务</th><th>授权</th><th>校验和</th><th>版本/时间</th><th>下载</th></tr></thead><tbody>{assets.data.map((asset) => <tr key={asset.id}><td className="row-title"><b>{asset.original_filename ?? asset.file_name ?? asset.name ?? asset.artifact_type ?? asset.kind ?? '未命名产物'}</b><small>{asset.summary}</small></td><td>{asset.mime_type ?? asset.artifact_type ?? asset.kind ?? 'structured'}</td><td className="mono">{asset.job_id?.slice(0, 8) ?? '独立上传'}</td><td><StatusBadge status={asset.status ?? 'active'} label={`${asset.status ?? '可用'} · ${asset.authorization_scope ?? '继承任务'}`} /></td><td className="mono">{asset.checksum?.slice(0, 12) ?? '—'}</td><td>v{asset.current_version ?? asset.version ?? 1}<br /><small><RelativeTime value={asset.created_at} /></small></td><td>{asset.artifact_type === 'file' || asset.mime_type ? <button className="btn btn-line" onClick={() => void downloadAsset(asset)}><Download size={14} />下载</button> : <span className="muted"><FileArchive size={16} /></span>}</td></tr>)}</tbody></table></div> : <EmptyState title="资产库为空" description="上传一份有授权记录的资料，或等待任务生成第一个 ArtifactVersion。" />}</div>
  </>
}
