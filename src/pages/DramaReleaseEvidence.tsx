import { useState, type FormEvent } from 'react'
import { BarChart3, ExternalLink, FileCheck2, FolderOpen, RefreshCw, ShieldAlert } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ErrorState, LoadingState, StatusBadge } from '../components/ui'
import { useRemote } from '../hooks/useRemote'
import { ApiError, api, createIdempotencyKey, humanError } from '../lib/api'
import type {
  Artifact,
  DramaEpisodeId,
  DramaFinalMasterHashes,
  DramaGate,
  DramaPublishingPlatform,
  DramaRun,
  ObservedPerformanceMetrics,
  PerformanceSnapshot,
  PublishingReceipt,
} from '../types'

const platforms: DramaPublishingPlatform[] = ['TikTok', 'YouTube Shorts']
const episodeIds: DramaEpisodeId[] = ['E01', 'E02', 'E03']
const publishingEvidenceMimes = new Set(['image/png', 'application/pdf'])
const snapshotSourceMimes = {
  csv_artifact: new Set(['text/csv', 'application/vnd.ms-excel']),
  json_artifact: new Set(['application/json']),
} as const
const metricFields: Array<{ key: keyof ObservedPerformanceMetrics; label: string }> = [
  { key: 'views', label: '播放量 views' },
  { key: 'likes', label: '点赞 likes' },
  { key: 'comments', label: '评论 comments' },
  { key: 'shares', label: '分享 shares' },
  { key: 'saves', label: '收藏 saves' },
  { key: 'completed_views', label: '完播 completed_views' },
  { key: 'watch_time_seconds', label: '观看秒数 watch_time_seconds' },
  { key: 'followers_gained', label: '新增关注 followers_gained' },
]

type SnapshotSourceKind = keyof typeof snapshotSourceMimes

interface ReleaseArtifact extends Artifact {
  job_id: string
  artifact_type: string
  current_version: number
  checksum: string
  mime_type: string
  authorization_scope: string
  status: string
  stale: boolean
}

interface Gate3EvidenceBinding {
  gateId: string
  decisionHash: string
  finalMasterHashes: DramaFinalMasterHashes
  approvedAt: string
}

interface ReleaseCell {
  episodeId: DramaEpisodeId
  platform: DramaPublishingPlatform
}

interface ReleaseEvidenceProps {
  projectId: string
  run: DramaRun
  gates: DramaGate[]
  onRunRevision: (revision: number) => void
  onReloadRun: () => Promise<void>
}

interface CellRecord {
  id: string
  episode_id: DramaEpisodeId
  platform: DramaPublishingPlatform
}

function localDateTimeValue(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 19)
}

function strictSecondLowerBound(date: Date) {
  return new Date(Math.floor(date.getTime() / 1_000) * 1_000 + 1_000)
}

function laterLocalDateTimeBound(...dates: Array<Date | null>) {
  const valid = dates.filter((date): date is Date => date instanceof Date && !Number.isNaN(date.valueOf()))
  return valid.length ? localDateTimeValue(new Date(Math.max(...valid.map((date) => date.valueOf())))) : undefined
}

function formatTimestamp(value?: string | null) {
  if (!value) return '—'
  const parsed = new Date(value)
  return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleString('zh-CN', { hour12: false })
}

function safeHttpsUrl(value: string) {
  try {
    return new URL(value).protocol === 'https:' ? value : null
  } catch {
    return null
  }
}

function cellKey(episodeId: DramaEpisodeId, platform: DramaPublishingPlatform) {
  return `${episodeId}::${platform}`
}

function currentGate3Binding(gates: DramaGate[]): Gate3EvidenceBinding | null {
  let latest: DramaGate | null = null
  for (const gate of gates) {
    if (gate.gate_number === 3 && (!latest || gate.gate_revision > latest.gate_revision)) latest = gate
  }
  if (
    !latest
    || latest.status !== 'approved'
    || latest.stale_at != null
    || Number.isNaN(new Date(latest.approved_at).valueOf())
    || !/^[0-9a-f]{64}$/.test(latest.decision_hash)
  ) return null
  const hashes = {} as DramaFinalMasterHashes
  for (const episodeId of episodeIds) {
    const binding = latest.bindings.find((item) => (
      item.binding_type === 'artifact'
      && item.requirement_key === `final_master:${episodeId}`
      && !item.stale
      && typeof item.artifact_checksum === 'string'
      && /^[0-9a-f]{64}$/.test(item.artifact_checksum)
    ))
    if (!binding?.artifact_checksum) return null
    hashes[episodeId] = binding.artifact_checksum
  }
  return { gateId: latest.id, decisionHash: latest.decision_hash, finalMasterHashes: hashes, approvedAt: latest.approved_at }
}

function latestByCell<T extends CellRecord>(records: T[], revisionOf: (record: T) => number) {
  const latest = new Map<string, T>()
  for (const record of records) {
    const key = cellKey(record.episode_id, record.platform)
    const current = latest.get(key)
    if (!current || revisionOf(record) > revisionOf(current)) latest.set(key, record)
  }
  return latest
}

function releaseArtifactJobIds(run: DramaRun) {
  const ids = [run.parent_job_id]
  for (const episodeId of episodeIds) {
    const childJobId = run.episodes?.find((episode) => episode.logical_key === episodeId)?.child_job_id
    if (childJobId) ids.push(childJobId)
  }
  return [...new Set(ids)]
}

function allowedArtifactJobIds(run: DramaRun, episodeId: DramaEpisodeId) {
  const ids = new Set([run.parent_job_id])
  const childJobId = run.episodes?.find((episode) => episode.logical_key === episodeId)?.child_job_id
  if (childJobId) ids.add(childJobId)
  return ids
}

function eligibleArtifacts(
  artifacts: ReleaseArtifact[],
  run: DramaRun,
  episodeId: DramaEpisodeId,
  allowedMimes: ReadonlySet<string>,
) {
  const allowedJobs = allowedArtifactJobIds(run, episodeId)
  return artifacts.filter((artifact) => (
    allowedJobs.has(artifact.job_id)
    && artifact.artifact_type === 'file'
    && artifact.authorization_scope === 'job'
    && artifact.status === 'available'
    && artifact.stale === false
    && Number.isInteger(artifact.current_version)
    && artifact.current_version >= 1
    && /^[0-9a-f]{64}$/.test(artifact.checksum)
    && allowedMimes.has(artifact.mime_type)
  ))
}

function artifactName(artifact: ReleaseArtifact) {
  return artifact.original_filename ?? artifact.name ?? artifact.id
}

function conflictMessage(error: ApiError) {
  const code = error.code ? ` · ${error.code}` : ''
  return `写入冲突${code}：${error.message}。已重新读取 Run 与证据账本；请核对当前修订与绑定后再提交。`
}

function SubmissionFeedback({ success, error }: { success: string | null; error: string | null }) {
  return <>
    {success ? <p className="drama-release-feedback success" role="status">{success}</p> : null}
    {error ? <p className="drama-release-feedback error" role="alert">{error}</p> : null}
  </>
}

function ArtifactScope({ run, artifacts, queriedJobIds }: { run: DramaRun; artifacts: ReleaseArtifact[]; queriedJobIds: string[] }) {
  return <section className="drama-release-assets" aria-labelledby="drama-release-assets-title">
    <header>
      <div><FolderOpen size={16} /><div><h4 id="drama-release-assets-title">同 Run 证据 Artifact</h4><p>{artifacts.length} 个当前候选文件；最终资格仍由服务端逐项复核。</p></div></div>
      <Link className="btn btn-line" to="/assets">去资产库上传</Link>
    </header>
    <div className="drama-release-job-scope">
      <div><span>parent_job_id</span><code>{run.parent_job_id}</code></div>
      {episodeIds.map((episodeId) => {
        const childJobId = run.episodes?.find((episode) => episode.logical_key === episodeId)?.child_job_id
        return <div key={episodeId}><span>{episodeId} child_job_id</span>{childJobId ? <code>{childJobId}</code> : <em>未暴露；不猜测</em>}</div>
      })}
    </div>
    <p className="drama-release-assets-note">仅查询 <code>{queriedJobIds.join(' · ')}</code>；不会无界读取全租户 Artifact。上传时请选择“仅绑定任务”，并填写 parent_job_id 或对应分集 child_job_id。</p>
  </section>
}

function EvidenceArtifactField({
  id,
  label,
  artifacts,
  value,
  onChange,
  emptyMessage,
}: {
  id: string
  label: string
  artifacts: ReleaseArtifact[]
  value: string
  onChange: (value: string) => void
  emptyMessage: string
}) {
  const selected = artifacts.find((artifact) => artifact.id === value)
  return <div className="drama-release-artifact-field">
    <label htmlFor={id}><span>{label}</span><select id={id} required value={selected?.id ?? ''} onChange={(event) => onChange(event.target.value)}>
      <option value="">请选择当前证据 Artifact</option>
      {artifacts.map((artifact) => <option key={artifact.id} value={artifact.id}>{artifactName(artifact)} · v{artifact.current_version} · {artifact.mime_type} · {artifact.id}</option>)}
    </select></label>
    {selected ? <dl className="drama-release-artifact-binding" aria-label={`${label} 精确绑定`}>
      <div><dt>Artifact ID</dt><dd><code>{selected.id}</code></dd></div>
      <div><dt>version / MIME</dt><dd>v{selected.current_version} · {selected.mime_type}</dd></div>
      <div className="wide"><dt>SHA256</dt><dd><code>{selected.checksum}</code></dd></div>
      <div className="wide"><dt>job_id</dt><dd><code>{selected.job_id}</code></dd></div>
    </dl> : <p className="drama-release-artifact-empty">{emptyMessage} <Link to="/assets">进入资产库</Link></p>}
  </div>
}

function CompletionMatrix<T extends CellRecord>({
  title,
  records,
  latest,
  selected,
  revisionOf,
  onSelect,
}: {
  title: string
  records: T[]
  latest: Map<string, T>
  selected: ReleaseCell
  revisionOf: (record: T) => number
  onSelect: (cell: ReleaseCell) => void
}) {
  return <section className="drama-release-matrix" aria-label={title}>
    <header><div><h4>{title}</h4><p>每格取该集 × 平台的最新 revision。</p></div><strong>{latest.size} / 6 recorded</strong></header>
    <div className="drama-release-matrix-wrap">
      <table>
        <thead><tr><th scope="col">Episode</th>{platforms.map((platform) => <th scope="col" key={platform}>{platform}</th>)}</tr></thead>
        <tbody>{episodeIds.map((episodeId) => <tr key={episodeId}>
          <th scope="row">{episodeId}</th>
          {platforms.map((platform) => {
            const key = cellKey(episodeId, platform)
            const current = latest.get(key)
            const historyCount = records.filter((record) => cellKey(record.episode_id, record.platform) === key).length
            const active = selected.episodeId === episodeId && selected.platform === platform
            return <td key={platform}><button
              type="button"
              className={`drama-release-matrix-cell ${current ? 'recorded' : 'missing'}${active ? ' active' : ''}`}
              aria-pressed={active}
              aria-label={`选择 ${episodeId} ${platform} ${title} 单元格`}
              onClick={() => onSelect({ episodeId, platform })}
            >
              <b>{current ? `r${revisionOf(current)} 已登记` : '缺失'}</b>
              <span>{historyCount} revisions</span>
            </button></td>
          })}
        </tr>)}</tbody>
      </table>
    </div>
    <p className="drama-release-matrix-note">recorded 只表示账本存在记录，不代表服务端 readiness、平台核验或允许推进。</p>
  </section>
}

function PublishingReceiptForm({
  projectId,
  run,
  cell,
  binding,
  artifacts,
  receipts,
  onCellChange,
  onCreated,
  onConflict,
}: {
  projectId: string
  run: DramaRun
  cell: ReleaseCell
  binding: Gate3EvidenceBinding | null
  artifacts: ReleaseArtifact[]
  receipts: PublishingReceipt[]
  onCellChange: (cell: ReleaseCell) => void
  onCreated: (revision: number) => Promise<void>
  onConflict: () => Promise<void>
}) {
  const [publishedAt, setPublishedAt] = useState(() => localDateTimeValue())
  const [externalPostId, setExternalPostId] = useState('')
  const [publicUrl, setPublicUrl] = useState('')
  const [evidenceArtifactId, setEvidenceArtifactId] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const eligible = eligibleArtifacts(artifacts, run, cell.episodeId, publishingEvidenceMimes).filter((artifact) => !receipts.some((receipt) => (
    receipt.evidence_artifact_id === artifact.id
    && cellKey(receipt.episode_id, receipt.platform) !== cellKey(cell.episodeId, cell.platform)
  )))
  const selectedArtifact = eligible.find((artifact) => artifact.id === evidenceArtifactId)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSuccess(null)
    setError(null)
    if (!binding) {
      setError('当前没有可用的 Gate 3 approved 精确绑定，不能登记 PublishingReceipt。')
      return
    }
    if (!selectedArtifact) {
      setError('请选择同 Run、当前版本且 MIME 为 PNG/PDF 的证据 Artifact。')
      return
    }
    const published = new Date(publishedAt)
    if (Number.isNaN(published.valueOf())) {
      setError('published_at 不是有效时间。')
      return
    }
    const approvedAt = new Date(binding.approvedAt)
    if (published < approvedAt) {
      setError('published_at 不能早于当前 Gate 3 approved_at。')
      return
    }
    if (published > new Date()) {
      setError('published_at 不能晚于当前时间。')
      return
    }
    setSubmitting(true)
    try {
      const result = await api.post<{ receipt: PublishingReceipt; run_revision: number }>(
        `/drama-projects/${projectId}/runs/${run.id}/publishing-receipts`,
        {
          expected_run_revision: run.run_revision,
          episode_id: cell.episodeId,
          platform: cell.platform,
          gate_3_id: binding.gateId,
          gate_3_decision_hash: binding.decisionHash,
          final_master_hash: binding.finalMasterHashes[cell.episodeId],
          verification_status: 'manual_unverified',
          published_at: published.toISOString(),
          external_post_id: externalPostId,
          public_url: publicUrl,
          evidence_artifact_id: selectedArtifact.id,
          evidence_artifact_version: selectedArtifact.current_version,
          evidence_artifact_checksum: selectedArtifact.checksum,
          notes,
        },
        true,
        createIdempotencyKey(`publishing-receipt-${run.id}-${cell.episodeId}-${cell.platform}`),
      )
      setSuccess(`${result.receipt.episode_id} · ${result.receipt.platform} 人工发布回执已追加；platform_api_called=false，状态仍为 manual_unverified。`)
      setExternalPostId('')
      setPublicUrl('')
      setEvidenceArtifactId('')
      setNotes('')
      setPublishedAt(localDateTimeValue())
      await onCreated(result.run_revision)
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 409) {
        setError(conflictMessage(reason))
        await onConflict()
      } else {
        setError(humanError(reason))
      }
    } finally {
      setSubmitting(false)
    }
  }

  return <form className="drama-release-form" onSubmit={submit} aria-labelledby="publishing-receipt-form-title">
    <div className="drama-release-form-heading">
      <div><FileCheck2 size={17} /><div><h4 id="publishing-receipt-form-title">追加 PublishingReceipt</h4><p>一条记录只覆盖一个 episode × platform 单元格；不调用平台 API。</p></div></div>
      <span className="drama-manual-badge">manual_unverified</span>
    </div>
    <div className="drama-release-fields">
      <label><span>episode_id</span><select value={cell.episodeId} onChange={(event) => onCellChange({ ...cell, episodeId: event.target.value as DramaEpisodeId })}>{episodeIds.map((episodeId) => <option key={episodeId}>{episodeId}</option>)}</select></label>
      <label><span>平台</span><select value={cell.platform} onChange={(event) => onCellChange({ ...cell, platform: event.target.value as DramaPublishingPlatform })}>{platforms.map((platform) => <option key={platform}>{platform}</option>)}</select></label>
    </div>
    {!binding ? <p className="drama-release-blocker" role="alert">缺少当前 approved Gate 3 或 E01–E03 artifact hash 精确绑定，表单已阻断。</p> : <div className="drama-release-binding" aria-label="当前 Gate 3 与单集母版精确绑定">
      <span>Gate 3 <code>{binding.gateId}</code></span>
      <span>decision_hash <code>{binding.decisionHash}</code></span>
      <span>{cell.episodeId} final_master_hash <code>{binding.finalMasterHashes[cell.episodeId]}</code></span>
    </div>}
    <div className="drama-release-fields">
      <label><span>published_at</span><input type="datetime-local" required step="1" min={binding ? localDateTimeValue(new Date(binding.approvedAt)) : undefined} max={localDateTimeValue()} value={publishedAt} onChange={(event) => setPublishedAt(event.target.value)} /></label>
      <label><span>external_post_id</span><input required minLength={1} maxLength={200} pattern="[A-Za-z0-9][A-Za-z0-9._:-]*" value={externalPostId} onChange={(event) => setExternalPostId(event.target.value)} placeholder="平台帖子 ID" /></label>
      <label className="wide"><span>public_url</span><input type="url" required minLength={12} maxLength={2048} value={publicUrl} onChange={(event) => setPublicUrl(event.target.value)} placeholder={cell.platform === 'TikTok' ? 'https://www.tiktok.com/@account/video/123…' : 'https://www.youtube.com/shorts/PostId'} /></label>
    </div>
    <EvidenceArtifactField id="publishing-evidence-artifact" label="发布证据 Artifact（PNG / PDF）" artifacts={eligible} value={evidenceArtifactId} onChange={setEvidenceArtifactId} emptyMessage={`当前没有 ${cell.episodeId} 可用的 PNG/PDF job-scoped Artifact。`} />
    <div className="drama-release-fields"><label className="wide"><span>notes（可选）</span><textarea maxLength={4000} rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} /></label></div>
    <p className="drama-release-form-note"><ShieldAlert size={14} />URL 与 PNG/PDF 仅按当前 version + SHA 留档；不会被界面升级为平台已验证发布。同一证据 Artifact 不跨单元格复用。</p>
    <SubmissionFeedback success={success} error={error} />
    <button className="btn btn-solid" type="submit" disabled={submitting || !binding || !selectedArtifact}>{submitting ? '正在追加…' : `追加 ${cell.episodeId} · ${cell.platform} PublishingReceipt`}</button>
  </form>
}

function PerformanceSnapshotForm({
  projectId,
  run,
  cell,
  receipts,
  snapshots,
  latestSnapshot,
  artifacts,
  onCellChange,
  onCreated,
  onConflict,
}: {
  projectId: string
  run: DramaRun
  cell: ReleaseCell
  receipts: Map<string, PublishingReceipt>
  snapshots: PerformanceSnapshot[]
  latestSnapshot?: PerformanceSnapshot
  artifacts: ReleaseArtifact[]
  onCellChange: (cell: ReleaseCell) => void
  onCreated: (revision: number) => Promise<void>
  onConflict: () => Promise<void>
}) {
  const receipt = receipts.get(cellKey(cell.episodeId, cell.platform))
  const now = new Date()
  const receiptPublishedAt = receipt ? new Date(receipt.published_at) : null
  const latestCapturedAt = latestSnapshot ? new Date(latestSnapshot.captured_at) : null
  const initialWindowStart = receiptPublishedAt && !Number.isNaN(receiptPublishedAt.valueOf())
    ? receiptPublishedAt
    : new Date(now.getTime() - 24 * 60 * 60_000)
  const [measurementWindowStart, setMeasurementWindowStart] = useState(() => localDateTimeValue(initialWindowStart))
  const [measurementWindowEnd, setMeasurementWindowEnd] = useState(() => localDateTimeValue(now))
  const [capturedAt, setCapturedAt] = useState(() => localDateTimeValue(now))
  const [sourceKind, setSourceKind] = useState<SnapshotSourceKind>('json_artifact')
  const [sourceArtifactId, setSourceArtifactId] = useState('')
  const [metrics, setMetrics] = useState<Record<keyof ObservedPerformanceMetrics, string>>({
    views: '', likes: '', comments: '', shares: '', saves: '', completed_views: '', watch_time_seconds: '', followers_gained: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const eligible = eligibleArtifacts(artifacts, run, cell.episodeId, snapshotSourceMimes[sourceKind]).filter((artifact) => !snapshots.some((snapshot) => (
    snapshot.source_artifact_id === artifact.id
    && cellKey(snapshot.episode_id, snapshot.platform) !== cellKey(cell.episodeId, cell.platform)
  )))
  const selectedArtifact = eligible.find((artifact) => artifact.id === sourceArtifactId)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSuccess(null)
    setError(null)
    if (!receipt) {
      setError(`缺少 ${cell.episodeId} · ${cell.platform} 当前最新 PublishingReceipt，不能绑定 PerformanceSnapshot。`)
      return
    }
    if (!selectedArtifact) {
      setError(`请选择与 ${sourceKind} 对应且同 Run 的当前证据 Artifact。`)
      return
    }
    const windowStart = new Date(measurementWindowStart)
    const windowEnd = new Date(measurementWindowEnd)
    const captured = new Date(capturedAt)
    if ([windowStart, windowEnd, captured].some((value) => Number.isNaN(value.valueOf()))) {
      setError('measurement window 或 captured_at 不是有效时间。')
      return
    }
    const receiptPublished = new Date(receipt.published_at)
    if (Number.isNaN(receiptPublished.valueOf())) {
      setError('当前 PublishingReceipt 的 published_at 无效，不能安全追加快照。')
      return
    }
    if (windowStart < receiptPublished) {
      setError('measurement_window_start 不能早于当前 PublishingReceipt published_at。')
      return
    }
    if (windowEnd <= windowStart) {
      setError('measurement_window_end 必须严格晚于 measurement_window_start。')
      return
    }
    if (captured < windowEnd) {
      setError('measurement_window_end 不能晚于 captured_at。')
      return
    }
    if (captured > new Date()) {
      setError('captured_at 不能晚于当前时间。')
      return
    }
    if (latestSnapshot) {
      const priorCaptured = new Date(latestSnapshot.captured_at)
      if (Number.isNaN(priorCaptured.valueOf())) {
        setError('当前同格 latest PerformanceSnapshot 的 captured_at 无效，不能安全追加快照。')
        return
      }
      if (captured <= priorCaptured) {
        setError('captured_at 必须严格晚于同格 latest PerformanceSnapshot captured_at。')
        return
      }
    }
    const parsed = {} as ObservedPerformanceMetrics
    for (const field of metricFields) {
      const raw = metrics[field.key]
      if (!/^\d+$/.test(raw)) {
        setError(`${field.key} 必须是非负整数观测值。`)
        return
      }
      const value = Number(raw)
      if (!Number.isSafeInteger(value) || value > 10 ** 15) {
        setError(`${field.key} 超出可接受范围。`)
        return
      }
      parsed[field.key] = value
    }
    if (parsed.completed_views > parsed.views) {
      setError('completed_views 不能大于 views。')
      return
    }
    setSubmitting(true)
    try {
      const result = await api.post<{ snapshot: PerformanceSnapshot; run_revision: number }>(
        `/drama-projects/${projectId}/runs/${run.id}/performance-snapshots`,
        {
          expected_run_revision: run.run_revision,
          episode_id: cell.episodeId,
          platform: cell.platform,
          publishing_receipt_id: receipt.id,
          publishing_receipt_hash: receipt.receipt_hash,
          measurement_window_start: windowStart.toISOString(),
          measurement_window_end: windowEnd.toISOString(),
          captured_at: captured.toISOString(),
          observation_status: 'observed',
          verification_status: 'manual_unverified',
          source_kind: sourceKind,
          source_artifact_id: selectedArtifact.id,
          source_artifact_version: selectedArtifact.current_version,
          source_artifact_checksum: selectedArtifact.checksum,
          metrics: parsed,
        },
        true,
        createIdempotencyKey(`performance-snapshot-${run.id}-${cell.episodeId}-${cell.platform}`),
      )
      setSuccess(`${result.snapshot.episode_id} · ${result.snapshot.platform} 指标快照已追加；数据仍为 observed / manual_unverified，metrics_externally_verified=false。`)
      setSourceArtifactId('')
      setMetrics({ views: '', likes: '', comments: '', shares: '', saves: '', completed_views: '', watch_time_seconds: '', followers_gained: '' })
      await onCreated(result.run_revision)
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 409) {
        setError(conflictMessage(reason))
        await onConflict()
      } else {
        setError(humanError(reason))
      }
    } finally {
      setSubmitting(false)
    }
  }

  return <form className="drama-release-form" onSubmit={submit} aria-labelledby="performance-snapshot-form-title">
    <div className="drama-release-form-heading">
      <div><BarChart3 size={17} /><div><h4 id="performance-snapshot-form-title">追加 PerformanceSnapshot</h4><p>只保存一个 episode × platform 的八项人工观察值，不预测、不补零。</p></div></div>
      <span className="drama-manual-badge">manual_unverified</span>
    </div>
    <div className="drama-release-fields">
      <label><span>episode_id</span><select value={cell.episodeId} onChange={(event) => onCellChange({ ...cell, episodeId: event.target.value as DramaEpisodeId })}>{episodeIds.map((episodeId) => <option key={episodeId}>{episodeId}</option>)}</select></label>
      <label><span>平台</span><select value={cell.platform} onChange={(event) => onCellChange({ ...cell, platform: event.target.value as DramaPublishingPlatform })}>{platforms.map((platform) => <option key={platform}>{platform}</option>)}</select></label>
      <label><span>measurement_window_start</span><input type="datetime-local" required step="1" min={receiptPublishedAt && !Number.isNaN(receiptPublishedAt.valueOf()) ? localDateTimeValue(receiptPublishedAt) : undefined} value={measurementWindowStart} onChange={(event) => setMeasurementWindowStart(event.target.value)} /></label>
      <label><span>measurement_window_end</span><input type="datetime-local" required step="1" min={laterLocalDateTimeBound(strictSecondLowerBound(new Date(measurementWindowStart)))} max={capturedAt} value={measurementWindowEnd} onChange={(event) => setMeasurementWindowEnd(event.target.value)} /></label>
      <label><span>captured_at</span><input type="datetime-local" required step="1" min={laterLocalDateTimeBound(new Date(measurementWindowEnd), latestCapturedAt ? strictSecondLowerBound(latestCapturedAt) : null)} max={localDateTimeValue()} value={capturedAt} onChange={(event) => setCapturedAt(event.target.value)} /></label>
      <label><span>source_kind</span><select value={sourceKind} onChange={(event) => { setSourceKind(event.target.value as SnapshotSourceKind); setSourceArtifactId('') }}><option value="json_artifact">json_artifact</option><option value="csv_artifact">csv_artifact</option></select></label>
    </div>
    {receipt ? <div className="drama-release-binding" aria-label={`${cell.episodeId} ${cell.platform} 当前发布回执绑定`}><span>latest receipt r{receipt.receipt_revision} <code>{receipt.id}</code></span><span>receipt_hash <code>{receipt.receipt_hash}</code></span></div> : <p className="drama-release-blocker" role="alert">缺少 {cell.episodeId} · {cell.platform} 当前最新 PublishingReceipt，表单已阻断。</p>}
    <EvidenceArtifactField id="performance-source-artifact" label="指标来源 Artifact（CSV / JSON）" artifacts={eligible} value={sourceArtifactId} onChange={setSourceArtifactId} emptyMessage={`当前没有 ${cell.episodeId} 与 ${sourceKind} MIME 对应的 job-scoped Artifact。`} />
    <div className="drama-metric-fields">
      {metricFields.map((field) => <label key={field.key}><span>{field.label}</span><input type="number" required min="0" max={10 ** 15} step="1" inputMode="numeric" value={metrics[field.key]} onChange={(event) => setMetrics((current) => ({ ...current, [field.key]: event.target.value }))} /></label>)}
    </div>
    <p className="drama-release-form-note"><ShieldAlert size={14} />CSV/JSON 内容还必须与当前 episode、platform、时间窗和八项指标精确一致；服务端会重新读取文件并校验。observed 不代表外部核验或平台 API 回传。</p>
    <SubmissionFeedback success={success} error={error} />
    <button className="btn btn-solid" type="submit" disabled={submitting || !receipt || !selectedArtifact}>{submitting ? '正在追加…' : `追加 ${cell.episodeId} · ${cell.platform} PerformanceSnapshot`}</button>
  </form>
}

function PublishingHistory({ receipts, latest }: { receipts: PublishingReceipt[]; latest: Map<string, PublishingReceipt> }) {
  return <section className="drama-release-ledger" aria-labelledby="publishing-receipts-title">
    <header><div><FileCheck2 size={16} /><h4 id="publishing-receipts-title">PublishingReceipt 历史 revisions</h4></div><span>{receipts.length} records</span></header>
    {!receipts.length ? <div className="drama-release-empty"><b>尚无人工发布回执</b><p>URL、Job done 或发布包文档均不会被页面补造成 PublishingReceipt。</p></div> : <div className="drama-release-card-list">{receipts.map((receipt) => {
      const href = safeHttpsUrl(receipt.public_url)
      const isLatest = latest.get(cellKey(receipt.episode_id, receipt.platform))?.id === receipt.id
      return <article className="drama-release-card" key={receipt.id}>
        <header><div><b>{receipt.episode_id} · {receipt.platform} · r{receipt.receipt_revision}</b><span>{formatTimestamp(receipt.created_at)}</span></div><StatusBadge status="manual_unverified" label={isLatest ? 'latest · manual_unverified' : 'history · manual_unverified'} /></header>
        <div className="drama-release-flags"><strong>platform_api_called={String(receipt.platform_api_called)}</strong><strong>人工声明 / 未外部核验</strong></div>
        <dl>
          <div><dt>external_post_id</dt><dd>{receipt.external_post_id}</dd></div>
          <div><dt>published_at</dt><dd>{formatTimestamp(receipt.published_at)}</dd></div>
          <div className="wide"><dt>public_url</dt><dd>{href ? <a href={href} target="_blank" rel="noreferrer">{receipt.public_url}<ExternalLink size={11} /></a> : receipt.public_url}</dd></div>
          <div className="wide"><dt>Gate 3 / final master</dt><dd><code>{receipt.gate_3_id}</code><code>{receipt.gate_3_decision_hash}</code><code>{receipt.final_master_hash}</code></dd></div>
          <div className="wide"><dt>evidence Artifact</dt><dd><code>{receipt.evidence_artifact_id}</code><code>v{receipt.evidence_artifact_version} · {receipt.evidence_artifact_checksum}</code></dd></div>
          <div className="wide"><dt>receipt_id / hash</dt><dd><code>{receipt.id}</code><code>{receipt.receipt_hash}</code></dd></div>
        </dl>
        {receipt.notes ? <p className="drama-release-notes">notes: {receipt.notes}</p> : null}
      </article>
    })}</div>}
  </section>
}

function PerformanceHistory({ snapshots, latest }: { snapshots: PerformanceSnapshot[]; latest: Map<string, PerformanceSnapshot> }) {
  return <section className="drama-release-ledger" aria-labelledby="performance-snapshots-title">
    <header><div><BarChart3 size={16} /><h4 id="performance-snapshots-title">PerformanceSnapshot 历史 revisions</h4></div><span>{snapshots.length} records</span></header>
    {!snapshots.length ? <div className="drama-release-empty"><b>尚无人工指标快照</b><p>没有八项观测值、时间窗、来源 Artifact 与同格 receipt hash 绑定时，页面不会显示推测指标。</p></div> : <div className="drama-release-card-list">{snapshots.map((snapshot) => {
      const isLatest = latest.get(cellKey(snapshot.episode_id, snapshot.platform))?.id === snapshot.id
      return <article className="drama-release-card" key={snapshot.id}>
        <header><div><b>{snapshot.episode_id} · {snapshot.platform} · r{snapshot.snapshot_revision}</b><span>{formatTimestamp(snapshot.created_at)}</span></div><StatusBadge status="manual_unverified" label={isLatest ? 'latest · manual_unverified' : 'history · manual_unverified'} /></header>
        <div className="drama-release-flags"><strong>platform_api_called={String(snapshot.platform_api_called)}</strong><strong>metrics_externally_verified={String(snapshot.metrics_externally_verified)}</strong><strong>{snapshot.observation_status}</strong></div>
        <dl>
          <div className="wide"><dt>snapshot_id / hash</dt><dd><code>{snapshot.id}</code><code>{snapshot.snapshot_hash}</code></dd></div>
          <div className="wide"><dt>PublishingReceipt exact binding</dt><dd><code>{snapshot.publishing_receipt_id}</code><code>{snapshot.publishing_receipt_hash}</code></dd></div>
          <div><dt>measurement window</dt><dd>{formatTimestamp(snapshot.measurement_window_start)}<br />→ {formatTimestamp(snapshot.measurement_window_end)}</dd></div>
          <div><dt>captured_at</dt><dd>{formatTimestamp(snapshot.captured_at)}</dd></div>
          <div className="wide"><dt>source Artifact</dt><dd>{snapshot.source_kind}<code>{snapshot.source_artifact_id}</code><code>v{snapshot.source_artifact_version} · {snapshot.source_artifact_checksum}</code></dd></div>
          <div className="wide"><dt>metrics_hash</dt><dd><code>{snapshot.metrics_hash}</code></dd></div>
        </dl>
        <div className="drama-metric-grid">{metricFields.map((field) => <div key={field.key}><span>{field.key}</span><b>{snapshot.metrics[field.key].toLocaleString('en-US')}</b></div>)}</div>
      </article>
    })}</div>}
  </section>
}

export default function DramaReleaseEvidence({ projectId, run, gates, onRunRevision, onReloadRun }: ReleaseEvidenceProps) {
  const queriedJobIds = releaseArtifactJobIds(run)
  const artifactJobKey = queriedJobIds.join('|')
  const releaseRemote = useRemote(async () => {
    const base = `/drama-projects/${projectId}/runs/${run.id}`
    const [receipts, snapshots, artifactResponses] = await Promise.all([
      api.getWithMeta<PublishingReceipt[]>(`${base}/publishing-receipts`),
      api.getWithMeta<PerformanceSnapshot[]>(`${base}/performance-snapshots`),
      Promise.all(queriedJobIds.map((jobId) => api.getWithMeta<ReleaseArtifact[]>(`/artifacts?job_id=${encodeURIComponent(jobId)}&artifact_type=file&status=available&stale=false`))),
    ])
    const artifactsById = new Map<string, ReleaseArtifact>()
    for (const response of artifactResponses) for (const artifact of response.data) artifactsById.set(artifact.id, artifact)
    const artifacts = [...artifactsById.values()].sort((left, right) => (right.created_at ?? '').localeCompare(left.created_at ?? ''))
    return {
      projectId,
      runId: run.id,
      artifactJobKey,
      receipts: receipts.data,
      snapshots: snapshots.data,
      artifacts,
      receiptsMeta: receipts.meta,
      snapshotsMeta: snapshots.meta,
      artifactRequestIds: artifactResponses.map((response) => response.meta?.request_id ?? '—'),
    }
  }, [projectId, run.id, artifactJobKey])
  const scoped = releaseRemote.data?.projectId === projectId
    && releaseRemote.data.runId === run.id
    && releaseRemote.data.artifactJobKey === artifactJobKey
    ? releaseRemote.data
    : null
  const gateBinding = currentGate3Binding(gates)
  const latestReceipts = latestByCell(scoped?.receipts ?? [], (receipt) => receipt.receipt_revision)
  const latestSnapshots = latestByCell(scoped?.snapshots ?? [], (snapshot) => snapshot.snapshot_revision)
  const [publishingCell, setPublishingCell] = useState<ReleaseCell>({ episodeId: 'E01', platform: 'TikTok' })
  const [snapshotCell, setSnapshotCell] = useState<ReleaseCell>({ episodeId: 'E01', platform: 'TikTok' })

  async function created(revision: number) {
    onRunRevision(revision)
    await releaseRemote.reload()
  }

  async function reloadConflictState() {
    await Promise.all([onReloadRun(), releaseRemote.reload()])
  }

  return <section className="drama-acceptance-panel drama-release-evidence" aria-labelledby="drama-release-evidence-title">
    <header>
      <div><ShieldAlert size={18} /><h3 id="drama-release-evidence-title">受控人工发布与指标证据</h3></div>
      <button className="btn btn-line drama-release-refresh" type="button" disabled={releaseRemote.loading} onClick={() => void releaseRemote.reload()}><RefreshCw size={14} />{releaseRemote.loading ? '刷新中…' : '刷新证据'}</button>
    </header>
    <div className="drama-release-truth" role="note">
      <b>platform_api_called=false · manual_unverified · metrics_externally_verified=false</b>
      <p>本地候选仅保存 3 集 × 2 平台的人工声明和人工观察值。写入成功不等于平台 API 核验、服务端 readiness、真实归因或生产发布证明；本页也不会自动推进 Run。</p>
    </div>
    {releaseRemote.error ? <ErrorState message={releaseRemote.error} onRetry={releaseRemote.reload} /> : releaseRemote.loading && !scoped ? <LoadingState label="正在并行读取 6-cell 账本与同 Run 证据 Artifact…" /> : scoped ? <>
      {releaseRemote.loading ? <p className="drama-release-refreshing" role="status">正在重新读取 receipts、snapshots 与有界 Artifact 列表…</p> : null}
      <ArtifactScope run={run} artifacts={scoped.artifacts} queriedJobIds={queriedJobIds} />
      <div className="drama-release-matrix-grid">
        <CompletionMatrix title="PublishingReceipt 3×2 登记矩阵" records={scoped.receipts} latest={latestReceipts} selected={publishingCell} revisionOf={(receipt) => receipt.receipt_revision} onSelect={setPublishingCell} />
        <CompletionMatrix title="PerformanceSnapshot 3×2 登记矩阵" records={scoped.snapshots} latest={latestSnapshots} selected={snapshotCell} revisionOf={(snapshot) => snapshot.snapshot_revision} onSelect={setSnapshotCell} />
      </div>
      <div className="drama-release-ledger-grid">
        <PublishingHistory receipts={scoped.receipts} latest={latestReceipts} />
        <PerformanceHistory snapshots={scoped.snapshots} latest={latestSnapshots} />
      </div>
      <div className="drama-release-request-meta"><span>Publishing request {scoped.receiptsMeta?.request_id ?? '—'}</span><span>Performance request {scoped.snapshotsMeta?.request_id ?? '—'}</span><span>Artifact requests {scoped.artifactRequestIds.join(' · ')}</span></div>
      {run.status === 'waiting_manual_publish' ? <PublishingReceiptForm
        key={`publishing-${cellKey(publishingCell.episodeId, publishingCell.platform)}`}
        projectId={projectId}
        run={run}
        cell={publishingCell}
        binding={gateBinding}
        artifacts={scoped.artifacts}
        receipts={scoped.receipts}
        onCellChange={setPublishingCell}
        onCreated={created}
        onConflict={reloadConflictState}
      /> : run.status === 'measuring' ? <PerformanceSnapshotForm
        key={`snapshot-${cellKey(snapshotCell.episodeId, snapshotCell.platform)}`}
        projectId={projectId}
        run={run}
        cell={snapshotCell}
        receipts={latestReceipts}
        snapshots={scoped.snapshots}
        latestSnapshot={latestSnapshots.get(cellKey(snapshotCell.episodeId, snapshotCell.platform))}
        artifacts={scoped.artifacts}
        onCellChange={setSnapshotCell}
        onCreated={created}
        onConflict={reloadConflictState}
      /> : <div className="drama-release-state-block" role="note"><b>当前状态仅允许只读查看</b><p>Run status 为 <code>{run.status}</code>。PublishingReceipt 仅在 <code>waiting_manual_publish</code> 追加；PerformanceSnapshot 仅在 <code>measuring</code> 追加。本页不调用 advance。</p></div>}
    </> : null}
  </section>
}
