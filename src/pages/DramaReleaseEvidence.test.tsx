import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  Artifact,
  DramaEpisodeId,
  DramaGate,
  DramaPublishingPlatform,
  DramaRun,
  PerformanceSnapshot,
  PublishingReceipt,
} from '../types'
import DramaReleaseEvidence from './DramaReleaseEvidence'

const originalInnerWidth = window.innerWidth
const fixedNow = new Date('2026-08-04T12:00:37.000Z')
const projectId = 'dramaproject-release-test'
const run: DramaRun = {
  id: 'dramarun-release-test',
  project_id: projectId,
  parent_job_id: 'job-release-parent',
  run_number: 1,
  run_revision: 21,
  status: 'waiting_manual_publish',
  spec_hash: '1'.repeat(64),
  spec: {
    market: 'US', language: 'en-US', platforms: ['TikTok', 'YouTube Shorts'], episode_count: 3,
    target_duration_seconds: 60, duration_tolerance_seconds: 5, aspect_ratio: '9:16', resolution: '480p',
    editing_mode: 'manual', publishing_mode: 'manual', budget_cents: 12_000,
  },
  episodes: [
    { id: 'episode-e01', drama_run_id: 'dramarun-release-test', episode_index: 1, logical_key: 'E01', dispatch_key: 'episode:E01', child_job_id: 'job-release-e01' },
    { id: 'episode-e02', drama_run_id: 'dramarun-release-test', episode_index: 2, logical_key: 'E02', dispatch_key: 'episode:E02', child_job_id: 'job-release-e02' },
    { id: 'episode-e03', drama_run_id: 'dramarun-release-test', episode_index: 3, logical_key: 'E03', dispatch_key: 'episode:E03', child_job_id: 'job-release-e03' },
  ],
}

const finalMasterHashes = { E01: 'a'.repeat(64), E02: 'b'.repeat(64), E03: 'c'.repeat(64) }
const gateThree: DramaGate = {
  id: 'dramagate-release-three',
  drama_run_id: run.id,
  gate_number: 3,
  gate_revision: 2,
  status: 'approved',
  run_revision: 20,
  approved_by: 'reviewer-release',
  approved_by_role: 'reviewer',
  approved_at: '2026-08-04T01:00:00Z',
  decision_hash: 'd'.repeat(64),
  bindings: (['E01', 'E02', 'E03'] as const).map((episode, index) => ({
    id: `binding-${episode}`,
    gate_id: 'dramagate-release-three',
    binding_type: 'artifact',
    requirement_key: `final_master:${episode}`,
    artifact_id: `artifact-${episode}`,
    artifact_checksum: finalMasterHashes[episode],
    provenance: { technical_qc: { passed: true, ordinal: index + 1 } },
    stale: false,
  })),
}

type TestArtifact = Artifact & {
  job_id: string
  artifact_type: string
  current_version: number
  checksum: string
  mime_type: string
  authorization_scope: string
  status: string
  stale: boolean
}

function evidenceArtifact(id: string, mimeType: string, jobId = run.parent_job_id, overrides: Partial<TestArtifact> = {}): TestArtifact {
  return {
    id,
    job_id: jobId,
    name: id,
    original_filename: `${id}.${mimeType === 'application/pdf' ? 'pdf' : mimeType === 'application/json' ? 'json' : mimeType.includes('csv') ? 'csv' : 'png'}`,
    artifact_type: 'file',
    current_version: 2,
    checksum: id.slice(-1).repeat(64).replace(/[^0-9a-f]/g, 'a'),
    mime_type: mimeType,
    authorization_scope: 'job',
    status: 'available',
    stale: false,
    created_at: '2026-08-04T09:00:00Z',
    ...overrides,
  }
}

const publishingPng = evidenceArtifact('artifact-publish-a', 'image/png')
const publishingPdf = evidenceArtifact('artifact-publish-b', 'application/pdf', 'job-release-e01')
const sourceJson = evidenceArtifact('artifact-metrics-c', 'application/json')
const sourceCsv = evidenceArtifact('artifact-metrics-d', 'text/csv', 'job-release-e01')
const otherEpisodePng = evidenceArtifact('artifact-other-e', 'image/png', 'job-release-e02')
const tenantScopedPng = evidenceArtifact('artifact-tenant-f', 'image/png', run.parent_job_id, { authorization_scope: 'tenant' })
const defaultArtifacts = [publishingPng, publishingPdf, sourceJson, sourceCsv, otherEpisodePng, tenantScopedPng]

function publishingReceipt(
  episodeId: DramaEpisodeId = 'E01',
  platform: DramaPublishingPlatform = 'TikTok',
  revision = 1,
): PublishingReceipt {
  const postId = platform === 'TikTok' ? `${741852960 + revision}` : `Short${episodeId}R${revision}`
  return {
    id: `pubreceipt-${episodeId}-${platform === 'TikTok' ? 'tt' : 'yt'}-r${revision}`,
    drama_run_id: run.id,
    episode_id: episodeId,
    platform,
    receipt_revision: revision,
    run_revision: 21 + revision,
    gate_3_id: gateThree.id,
    gate_3_decision_hash: gateThree.decision_hash,
    final_master_hash: finalMasterHashes[episodeId],
    verification_status: 'manual_unverified',
    published_at: '2026-08-04T01:30:00Z',
    external_post_id: postId,
    public_url: platform === 'TikTok' ? `https://www.tiktok.com/@studio/video/${postId}` : `https://www.youtube.com/shorts/${postId}`,
    evidence_artifact_id: publishingPng.id,
    evidence_artifact_version: publishingPng.current_version,
    evidence_artifact_checksum: publishingPng.checksum,
    notes: '人工发布记录',
    receipt_hash: (revision % 2 ? 'e' : 'f').repeat(64),
    platform_api_called: false,
    created_at: `2026-08-04T08:3${revision}:00Z`,
  }
}

function performanceSnapshot(receipt = publishingReceipt(), revision = 1): PerformanceSnapshot {
  return {
    id: `perfsnapshot-${receipt.episode_id}-${receipt.platform === 'TikTok' ? 'tt' : 'yt'}-r${revision}`,
    drama_run_id: run.id,
    episode_id: receipt.episode_id,
    platform: receipt.platform,
    snapshot_revision: revision,
    run_revision: 24 + revision,
    publishing_receipt_id: receipt.id,
    publishing_receipt_hash: receipt.receipt_hash,
    measurement_window_start: '2026-08-04T01:30:00Z',
    measurement_window_end: '2026-08-04T02:00:00Z',
    captured_at: '2026-08-04T02:05:00Z',
    observation_status: 'observed',
    verification_status: 'manual_unverified',
    source_kind: 'json_artifact',
    source_artifact_id: sourceJson.id,
    source_artifact_version: sourceJson.current_version,
    source_artifact_checksum: sourceJson.checksum,
    metrics: { views: 1000, likes: 80, comments: 12, shares: 9, saves: 7, completed_views: 610, watch_time_seconds: 42_000, followers_gained: 15 },
    metrics_hash: '7'.repeat(64),
    snapshot_hash: '8'.repeat(64),
    platform_api_called: false,
    metrics_externally_verified: false,
    created_at: '2026-08-04T09:06:00Z',
  }
}

function jsonResponse(data: unknown, status = 200, requestId = 'req-test') {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'X-Request-ID': requestId } })
}

function localDateTimeInput(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 19)
}

function installReleaseApi({
  receipts = [],
  snapshots = [],
  artifacts = defaultArtifacts,
  writeConflict,
  readError = false,
  pending = false,
}: {
  receipts?: PublishingReceipt[]
  snapshots?: PerformanceSnapshot[]
  artifacts?: TestArtifact[]
  writeConflict?: 'publishing' | 'performance'
  readError?: boolean
  pending?: boolean
} = {}) {
  const storedReceipts = [...receipts]
  const storedSnapshots = [...snapshots]
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input), 'http://qingzhi.test')
    const method = init?.method ?? 'GET'
    if (pending && method === 'GET') return new Promise<Response>(() => undefined)
    if (readError && method === 'GET') {
      return jsonResponse({ error: { code: 'DRAMA_RELEASE_READ_FAILED', message: '人工证据账本暂不可用' } }, 503)
    }
    if (url.pathname === '/api/v1/artifacts') {
      const jobId = url.searchParams.get('job_id')
      const rows = artifacts.filter((artifact) => artifact.job_id === jobId)
      return jsonResponse({ data: rows, meta: { request_id: `req-artifacts-${jobId}`, count: rows.length } })
    }
    if (url.pathname.endsWith('/publishing-receipts')) {
      if (method === 'GET') return jsonResponse({ data: storedReceipts, meta: { request_id: 'req-publishing', count: storedReceipts.length } })
      if (writeConflict === 'publishing') return jsonResponse({ error: { code: 'DRAMA_RUN_REVISION_CONFLICT', message: 'DramaRun revision 已变化' } }, 409)
      const body = JSON.parse(String(init?.body))
      const revision = storedReceipts.filter((receipt) => receipt.episode_id === body.episode_id && receipt.platform === body.platform).length + 1
      const receipt: PublishingReceipt = {
        ...body,
        id: `pubreceipt-created-${body.episode_id}-${revision}`,
        drama_run_id: run.id,
        receipt_revision: revision,
        run_revision: body.expected_run_revision + 1,
        receipt_hash: '9'.repeat(64),
        platform_api_called: false,
        created_at: '2026-08-04T09:30:00Z',
      }
      storedReceipts.push(receipt)
      return jsonResponse({ data: { receipt, run_revision: receipt.run_revision }, meta: { request_id: 'req-publishing-create' } }, 201)
    }
    if (url.pathname.endsWith('/performance-snapshots')) {
      if (method === 'GET') return jsonResponse({ data: storedSnapshots, meta: { request_id: 'req-performance', count: storedSnapshots.length } })
      if (writeConflict === 'performance') return jsonResponse({ error: { code: 'DRAMA_RUN_REVISION_CONFLICT', message: 'DramaRun revision 已变化' } }, 409)
      const body = JSON.parse(String(init?.body))
      const revision = storedSnapshots.filter((snapshot) => snapshot.episode_id === body.episode_id && snapshot.platform === body.platform).length + 1
      const snapshot: PerformanceSnapshot = {
        ...body,
        id: `perfsnapshot-created-${body.episode_id}-${revision}`,
        drama_run_id: run.id,
        snapshot_revision: revision,
        run_revision: body.expected_run_revision + 1,
        metrics_hash: '6'.repeat(64),
        snapshot_hash: '5'.repeat(64),
        platform_api_called: false,
        metrics_externally_verified: false,
        created_at: '2026-08-04T10:00:00Z',
      }
      storedSnapshots.push(snapshot)
      return jsonResponse({ data: { snapshot, run_revision: snapshot.run_revision }, meta: { request_id: 'req-performance-create' } }, 201)
    }
    throw new Error(`Unexpected request: ${method} ${url.pathname}${url.search}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return { fetchMock, storedReceipts, storedSnapshots }
}

function renderEvidence({
  selectedRun = run,
  gates = [gateThree],
  onRunRevision = vi.fn(),
  onReloadRun = vi.fn(async () => undefined),
}: {
  selectedRun?: DramaRun
  gates?: DramaGate[]
  onRunRevision?: (revision: number) => void
  onReloadRun?: () => Promise<void>
} = {}) {
  return render(<MemoryRouter><DramaReleaseEvidence projectId={projectId} run={selectedRun} gates={gates} onRunRevision={onRunRevision} onReloadRun={onReloadRun} /></MemoryRouter>)
}

function fillMetrics(values = { views: 1000, likes: 80, comments: 12, shares: 9, saves: 7, completed_views: 610, watch_time_seconds: 42_000, followers_gained: 15 }) {
  for (const { key, label } of [
    { key: 'views', label: '播放量 views' }, { key: 'likes', label: '点赞 likes' }, { key: 'comments', label: '评论 comments' },
    { key: 'shares', label: '分享 shares' }, { key: 'saves', label: '收藏 saves' }, { key: 'completed_views', label: '完播 completed_views' },
    { key: 'watch_time_seconds', label: '观看秒数 watch_time_seconds' }, { key: 'followers_gained', label: '新增关注 followers_gained' },
  ] as const) fireEvent.change(screen.getByLabelText(label), { target: { value: String(values[key]) } })
  return values
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(fixedNow)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalInnerWidth })
})

describe('DramaReleaseEvidence v0014', () => {
  it('展示两张 3×2 recorded matrix、人工未验证边界与有界 parent/child Artifact 查询', async () => {
    const { fetchMock } = installReleaseApi()
    renderEvidence({ selectedRun: { ...run, status: 'waiting_gate_3' } })

    expect(screen.getByText(/platform_api_called=false · manual_unverified · metrics_externally_verified=false/)).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'PublishingReceipt 3×2 登记矩阵' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'PerformanceSnapshot 3×2 登记矩阵' })).toBeInTheDocument()
    expect(screen.getAllByText('0 / 6 recorded')).toHaveLength(2)
    expect(screen.getByText(run.parent_job_id)).toBeInTheDocument()
    expect(screen.getByText('job-release-e01')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '去资产库上传' })).toHaveAttribute('href', '/assets')
    expect(screen.getByText('当前状态仅允许只读查看')).toBeInTheDocument()

    const artifactUrls = fetchMock.mock.calls.map(([input]) => new URL(String(input), 'http://qingzhi.test')).filter((url) => url.pathname === '/api/v1/artifacts')
    expect(artifactUrls).toHaveLength(4)
    expect(new Set(artifactUrls.map((url) => url.searchParams.get('job_id')))).toEqual(new Set([run.parent_job_id, 'job-release-e01', 'job-release-e02', 'job-release-e03']))
    expect(artifactUrls.every((url) => url.searchParams.get('artifact_type') === 'file' && url.searchParams.get('status') === 'available' && url.searchParams.get('stale') === 'false')).toBe(true)
  })

  it('Run 未暴露 child_job_id 时只查 parent job，并明确提示不猜测', async () => {
    const { fetchMock } = installReleaseApi({ artifacts: [publishingPng] })
    renderEvidence({ selectedRun: { ...run, episodes: undefined, status: 'waiting_gate_3' } })

    await screen.findByRole('heading', { name: '同 Run 证据 Artifact' })
    const artifactUrls = fetchMock.mock.calls.map(([input]) => new URL(String(input), 'http://qingzhi.test')).filter((url) => url.pathname === '/api/v1/artifacts')
    expect(artifactUrls).toHaveLength(1)
    expect(artifactUrls[0].searchParams.get('job_id')).toBe(run.parent_job_id)
    expect(screen.getAllByText('未暴露；不猜测')).toHaveLength(3)
    expect(screen.getByText(/不会无界读取全租户 Artifact/)).toBeInTheDocument()
  })

  it('waiting_gate_1 的真实空账本只读展示 0/6，不虚构 child job、receipt、snapshot 或候选 Artifact', async () => {
    const waitingGateOneRun: DramaRun = {
      ...run,
      status: 'waiting_gate_1',
      episodes: run.episodes?.map((episode) => ({ ...episode, child_job_id: null })),
    }
    const { fetchMock } = installReleaseApi({ receipts: [], snapshots: [], artifacts: [] })
    renderEvidence({ selectedRun: waitingGateOneRun, gates: [] })

    expect(await screen.findAllByText('0 / 6 recorded')).toHaveLength(2)
    expect(screen.getByText('尚无人工发布回执')).toBeInTheDocument()
    expect(screen.getByText('尚无人工指标快照')).toBeInTheDocument()
    expect(screen.getByText('当前状态仅允许只读查看').closest('[role="note"]')).toHaveTextContent('waiting_gate_1')
    expect(screen.queryByRole('heading', { name: '追加 PublishingReceipt' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '追加 PerformanceSnapshot' })).not.toBeInTheDocument()
    expect(screen.getByText(/0 个当前候选文件/)).toBeInTheDocument()
    expect(screen.getAllByText('未暴露；不猜测')).toHaveLength(3)

    const artifactUrls = fetchMock.mock.calls.map(([input]) => new URL(String(input), 'http://qingzhi.test')).filter((url) => url.pathname === '/api/v1/artifacts')
    expect(artifactUrls).toHaveLength(1)
    expect(artifactUrls[0].searchParams.get('job_id')).toBe(run.parent_job_id)
  })

  it('按 episode+platform 计算 latest，矩阵计数不把历史 revisions 重复计入', async () => {
    const e01r1 = publishingReceipt('E01', 'TikTok', 1)
    const e01r2 = publishingReceipt('E01', 'TikTok', 2)
    const e02yt = publishingReceipt('E02', 'YouTube Shorts', 1)
    installReleaseApi({ receipts: [e01r1, e01r2, e02yt], snapshots: [performanceSnapshot(e01r2)] })
    renderEvidence({ selectedRun: { ...run, status: 'completed' } })

    const publishingMatrix = await screen.findByRole('region', { name: 'PublishingReceipt 3×2 登记矩阵' })
    expect(publishingMatrix).toHaveTextContent('2 / 6 recorded')
    expect(publishingMatrix).toHaveTextContent('r2 已登记')
    expect(publishingMatrix).toHaveTextContent('2 revisions')
    const performanceMatrix = screen.getByRole('region', { name: 'PerformanceSnapshot 3×2 登记矩阵' })
    expect(performanceMatrix).toHaveTextContent('1 / 6 recorded')
    const history = screen.getByRole('heading', { name: 'PublishingReceipt 历史 revisions' }).closest('section')
    expect(history).toHaveTextContent('E01 · TikTok · r1')
    expect(history).toHaveTextContent('E01 · TikTok · r2')
    expect(history).toHaveTextContent('latest · manual_unverified')
  })

  it('waiting_manual_publish 提交单集母版与 PNG Artifact 的 exact ID/version/SHA', async () => {
    const onRunRevision = vi.fn()
    const { fetchMock } = installReleaseApi()
    renderEvidence({ onRunRevision })
    await screen.findByRole('heading', { name: '追加 PublishingReceipt' })

    expect(screen.queryByRole('heading', { name: '追加 PerformanceSnapshot' })).not.toBeInTheDocument()
    const artifactSelect = screen.getByLabelText('发布证据 Artifact（PNG / PDF）')
    expect(within(artifactSelect).getByRole('option', { name: new RegExp(publishingPng.id) })).toBeInTheDocument()
    expect(within(artifactSelect).getByRole('option', { name: new RegExp(publishingPdf.id) })).toBeInTheDocument()
    expect(within(artifactSelect).queryByRole('option', { name: new RegExp(sourceJson.id) })).not.toBeInTheDocument()
    expect(within(artifactSelect).queryByRole('option', { name: new RegExp(otherEpisodePng.id) })).not.toBeInTheDocument()
    expect(within(artifactSelect).queryByRole('option', { name: new RegExp(tenantScopedPng.id) })).not.toBeInTheDocument()

    fireEvent.change(artifactSelect, { target: { value: publishingPng.id } })
    expect(screen.getByLabelText('发布证据 Artifact（PNG / PDF） 精确绑定')).toHaveTextContent(publishingPng.checksum)
    fireEvent.change(screen.getByLabelText('external_post_id'), { target: { value: '741852963' } })
    fireEvent.change(screen.getByLabelText('public_url'), { target: { value: 'https://www.tiktok.com/@studio/video/741852963' } })
    fireEvent.change(screen.getByLabelText('notes（可选）'), { target: { value: '由运营人工登记' } })
    fireEvent.click(screen.getByRole('button', { name: '追加 E01 · TikTok PublishingReceipt' }))

    expect(await screen.findByText(/人工发布回执已追加/)).toHaveTextContent('platform_api_called=false')
    const post = fetchMock.mock.calls.find(([input, init]) => String(input).endsWith('/publishing-receipts') && init?.method === 'POST')
    const body = JSON.parse(String(post?.[1]?.body))
    expect(body).toMatchObject({
      expected_run_revision: run.run_revision,
      episode_id: 'E01',
      platform: 'TikTok',
      gate_3_id: gateThree.id,
      gate_3_decision_hash: gateThree.decision_hash,
      final_master_hash: finalMasterHashes.E01,
      verification_status: 'manual_unverified',
      external_post_id: '741852963',
      public_url: 'https://www.tiktok.com/@studio/video/741852963',
      evidence_artifact_id: publishingPng.id,
      evidence_artifact_version: publishingPng.current_version,
      evidence_artifact_checksum: publishingPng.checksum,
    })
    expect(body).not.toHaveProperty('final_master_hashes')
    expect(new Headers(post?.[1]?.headers).get('Idempotency-Key')).toMatch(/^publishing-receipt-.*-E01-TikTok-/)
    expect(onRunRevision).toHaveBeenCalledWith(run.run_revision + 1)
  })

  it('Gate 3 stale 时阻断 Publishing 写入', async () => {
    const { fetchMock } = installReleaseApi()
    renderEvidence({ gates: [{ ...gateThree, stale_at: '2026-08-04T09:10:00Z', stale_reason: 'new final master' }] })

    expect(await screen.findByText(/缺少当前 approved Gate 3/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '追加 E01 · TikTok PublishingReceipt' })).toBeDisabled()
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  })

  it('published_at 保留秒级边界，并在客户端拒绝早于 Gate 3 approved_at 或晚于当前时间', async () => {
    const gateApprovedAt = '2026-08-04T11:59:45.000Z'
    const { fetchMock } = installReleaseApi()
    renderEvidence({ gates: [{ ...gateThree, approved_at: gateApprovedAt }] })
    const heading = await screen.findByRole('heading', { name: '追加 PublishingReceipt' })
    const form = heading.closest('form')!
    const publishedInput = screen.getByLabelText('published_at')

    expect(publishedInput).toHaveAttribute('step', '1')
    expect(publishedInput).toHaveAttribute('min', localDateTimeInput(gateApprovedAt))
    expect(publishedInput).toHaveAttribute('max', localDateTimeInput(fixedNow))
    expect((publishedInput as HTMLInputElement).value.startsWith(localDateTimeInput(fixedNow))).toBe(true)

    fireEvent.change(screen.getByLabelText('发布证据 Artifact（PNG / PDF）'), { target: { value: publishingPng.id } })
    fireEvent.change(screen.getByLabelText('external_post_id'), { target: { value: '741852963' } })
    fireEvent.change(screen.getByLabelText('public_url'), { target: { value: 'https://www.tiktok.com/@studio/video/741852963' } })
    fireEvent.change(publishedInput, { target: { value: localDateTimeInput('2026-08-04T11:59:44.000Z') } })
    fireEvent.submit(form)
    expect(screen.getByRole('alert')).toHaveTextContent('published_at 不能早于当前 Gate 3 approved_at')

    fireEvent.change(publishedInput, { target: { value: localDateTimeInput('2026-08-04T12:00:38.000Z') } })
    fireEvent.submit(form)
    expect(screen.getByRole('alert')).toHaveTextContent('published_at 不能晚于当前时间')
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  })

  it('measuring 精确绑定同格 latest receipt，并提交时间窗、JSON Artifact 与八项 observed metrics', async () => {
    const oldReceipt = publishingReceipt('E01', 'TikTok', 1)
    const latestReceipt = publishingReceipt('E01', 'TikTok', 2)
    const otherCellReceipt = publishingReceipt('E02', 'TikTok', 1)
    const onRunRevision = vi.fn()
    const { fetchMock } = installReleaseApi({ receipts: [oldReceipt, latestReceipt, otherCellReceipt] })
    renderEvidence({ selectedRun: { ...run, status: 'measuring', run_revision: 23 }, onRunRevision })
    await screen.findByRole('heading', { name: '追加 PerformanceSnapshot' })

    expect(screen.getByLabelText('E01 TikTok 当前发布回执绑定')).toHaveTextContent(latestReceipt.id)
    fireEvent.change(screen.getByLabelText('指标来源 Artifact（CSV / JSON）'), { target: { value: sourceJson.id } })
    const windowStart = '2026-08-04T01:30:00.000Z'
    const windowEnd = '2026-08-04T02:00:00.000Z'
    const capturedAt = '2026-08-04T02:05:00.000Z'
    fireEvent.change(screen.getByLabelText('measurement_window_start'), { target: { value: localDateTimeInput(windowStart) } })
    fireEvent.change(screen.getByLabelText('measurement_window_end'), { target: { value: localDateTimeInput(windowEnd) } })
    fireEvent.change(screen.getByLabelText('captured_at'), { target: { value: localDateTimeInput(capturedAt) } })
    const values = fillMetrics()
    fireEvent.click(screen.getByRole('button', { name: '追加 E01 · TikTok PerformanceSnapshot' }))

    expect(await screen.findByText(/指标快照已追加/)).toHaveTextContent('metrics_externally_verified=false')
    const post = fetchMock.mock.calls.find(([input, init]) => String(input).endsWith('/performance-snapshots') && init?.method === 'POST')
    const body = JSON.parse(String(post?.[1]?.body))
    expect(body).toMatchObject({
      expected_run_revision: 23,
      episode_id: 'E01',
      platform: 'TikTok',
      publishing_receipt_id: latestReceipt.id,
      publishing_receipt_hash: latestReceipt.receipt_hash,
      observation_status: 'observed',
      verification_status: 'manual_unverified',
      source_kind: 'json_artifact',
      source_artifact_id: sourceJson.id,
      source_artifact_version: sourceJson.current_version,
      source_artifact_checksum: sourceJson.checksum,
      metrics: values,
    })
    expect(body.measurement_window_start).toBe(windowStart)
    expect(body.measurement_window_end).toBe(windowEnd)
    expect(body.captured_at).toBe(capturedAt)
    expect(Object.keys(body.metrics)).toHaveLength(8)
    expect(new Headers(post?.[1]?.headers).get('Idempotency-Key')).toMatch(/^performance-snapshot-.*-E01-TikTok-/)
    expect(onRunRevision).toHaveBeenCalledWith(24)
  })

  it('PerformanceSnapshot 保留 receipt 秒级下界，并拒绝早于 receipt 或不晚于同格 latest captured_at', async () => {
    const receipt = { ...publishingReceipt(), published_at: '2026-08-04T01:30:42.000Z' }
    const latest = { ...performanceSnapshot(receipt, 2), captured_at: '2026-08-04T02:05:17.000Z' }
    const { fetchMock } = installReleaseApi({ receipts: [receipt], snapshots: [latest] })
    renderEvidence({ selectedRun: { ...run, status: 'measuring', run_revision: 26 } })
    const heading = await screen.findByRole('heading', { name: '追加 PerformanceSnapshot' })
    const form = heading.closest('form')!
    const windowStart = screen.getByLabelText('measurement_window_start')
    const windowEnd = screen.getByLabelText('measurement_window_end')
    const capturedAt = screen.getByLabelText('captured_at')

    expect(windowStart).toHaveAttribute('step', '1')
    expect(windowEnd).toHaveAttribute('step', '1')
    expect(capturedAt).toHaveAttribute('step', '1')
    expect((windowStart as HTMLInputElement).value.startsWith(localDateTimeInput(receipt.published_at))).toBe(true)
    expect(windowStart).toHaveAttribute('min', localDateTimeInput(receipt.published_at))

    fireEvent.change(screen.getByLabelText('指标来源 Artifact（CSV / JSON）'), { target: { value: sourceJson.id } })
    fillMetrics()
    fireEvent.change(windowStart, { target: { value: localDateTimeInput('2026-08-04T01:30:41.000Z') } })
    fireEvent.change(windowEnd, { target: { value: localDateTimeInput('2026-08-04T02:05:00.000Z') } })
    expect(capturedAt).toHaveAttribute('min', localDateTimeInput('2026-08-04T02:05:18.000Z'))
    fireEvent.change(capturedAt, { target: { value: localDateTimeInput(latest.captured_at) } })
    fireEvent.submit(form)
    expect(screen.getByRole('alert')).toHaveTextContent('measurement_window_start 不能早于当前 PublishingReceipt published_at')

    fireEvent.change(windowStart, { target: { value: localDateTimeInput(receipt.published_at) } })
    fireEvent.submit(form)
    expect(screen.getByRole('alert')).toHaveTextContent('captured_at 必须严格晚于同格 latest PerformanceSnapshot captured_at')
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  })

  it('其他 episode/platform 有 receipt 也不能填补当前格，且 completed_views 校验 fail closed', async () => {
    const { fetchMock } = installReleaseApi({ receipts: [publishingReceipt('E02', 'TikTok')] })
    renderEvidence({ selectedRun: { ...run, status: 'measuring' } })
    await screen.findByRole('heading', { name: '追加 PerformanceSnapshot' })

    expect(screen.getByText(/缺少 E01 · TikTok 当前最新 PublishingReceipt/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '追加 E01 · TikTok PerformanceSnapshot' })).toBeDisabled()
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  })

  it('CAS 409 保留 fail-closed 错误并同时 reload Run 与 releaseRemote 账本', async () => {
    const onReloadRun = vi.fn(async () => undefined)
    const { fetchMock } = installReleaseApi({ writeConflict: 'publishing' })
    renderEvidence({ onReloadRun })
    await screen.findByRole('heading', { name: '追加 PublishingReceipt' })
    fireEvent.change(screen.getByLabelText('发布证据 Artifact（PNG / PDF）'), { target: { value: publishingPng.id } })
    fireEvent.change(screen.getByLabelText('external_post_id'), { target: { value: '741852963' } })
    fireEvent.change(screen.getByLabelText('public_url'), { target: { value: 'https://www.tiktok.com/@studio/video/741852963' } })
    fireEvent.click(screen.getByRole('button', { name: '追加 E01 · TikTok PublishingReceipt' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('DRAMA_RUN_REVISION_CONFLICT')
    expect(alert).toHaveTextContent('已重新读取 Run 与证据账本')
    expect(onReloadRun).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      const receiptReads = fetchMock.mock.calls.filter(([input, init]) => String(input).endsWith('/publishing-receipts') && (init?.method ?? 'GET') === 'GET')
      expect(receiptReads).toHaveLength(2)
    })
  })

  it('处理 loading、error/retry；390px 仅做 DOM 结构 smoke，视觉布局留给真实浏览器验收', async () => {
    installReleaseApi({ pending: true })
    const first = renderEvidence({ selectedRun: { ...run, status: 'completed' } })
    expect(screen.getByText('正在并行读取 6-cell 账本与同 Run 证据 Artifact…')).toBeInTheDocument()
    first.unmount()

    const { fetchMock } = installReleaseApi({ readError: true })
    renderEvidence({ selectedRun: { ...run, status: 'completed' } })
    const message = await screen.findByText('人工证据账本暂不可用')
    fireEvent.click(within(message.closest<HTMLElement>('[role="alert"]')!).getByRole('button', { name: '重试' }))
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(6))

    vi.unstubAllGlobals()
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    installReleaseApi({ receipts: [publishingReceipt()] })
    renderEvidence({ selectedRun: { ...run, status: 'measuring' } })
    window.dispatchEvent(new Event('resize'))
    expect(await screen.findByRole('heading', { name: 'PublishingReceipt 3×2 登记矩阵' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'PerformanceSnapshot 3×2 登记矩阵' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '同 Run 证据 Artifact' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '追加 PerformanceSnapshot' })).toBeInTheDocument()
  })
})
