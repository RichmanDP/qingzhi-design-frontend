import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  AgentRevision,
  CCSwitchDiscovery,
  DramaDocumentVersion,
  DramaGate,
  DramaGate1Readiness,
  DramaProject,
  DramaRun,
  GenerationRun,
  Job,
  ProviderHealth,
  WorkflowDefinition,
} from '../types'
import DramaWorkspacePage from './DramaWorkspacePage'

const originalInnerWidth = window.innerWidth

const workflow: WorkflowDefinition = {
  id: 'workflow_drama_v1',
  name: 'AI 短剧工作流',
  industry: 'drama',
  definition_version: '1.1.0',
  enabled: true,
  nodes: [
    { id: 'topic', name: '题材策划', kind: 'agent' },
    { id: 'gate_1', name: '原创与剧本锁定', kind: 'approval', mandatory_review: true },
    { id: 'final_review', name: '最终人工复核', kind: 'approval', mandatory_review: true },
  ],
}

const parentJob: Job = {
  id: 'job-drama-parent',
  display_id: 'DR-100',
  title: '现代职场复仇三集试制',
  brief: 'US en-US 三集短剧试制',
  industry: 'drama',
  workflow_id: workflow.id,
  approval_mode: 'managed',
  status: 'waiting_children',
  version: 4,
  run_revision: 2,
  created_at: '2026-08-04T08:00:00Z',
  updated_at: '2026-08-04T08:30:00Z',
}

const childJob: Job = {
  ...parentJob,
  id: 'job-drama-e01',
  display_id: 'DR-101',
  title: 'E01 · 失控的董事会',
  parent_job_id: parentJob.id,
  dispatch_key: 'episode:E01',
  status: 'done',
  version: 2,
  updated_at: '2026-08-04T08:20:00Z',
}

const mockRun: GenerationRun = {
  id: 'genrun-e01-shot-01',
  job_id: childJob.id,
  provider: 'mock-libtv',
  mode: 'mixed2video',
  status: 'succeeded',
  run_revision: 2,
  remote_lineage: { mock_receipt: 'receipt-1' },
  attempts: [{
    id: 'attempt-1', generation_run_id: 'genrun-e01-shot-01', attempt_number: 1,
    provider: 'mock-libtv', mode: 'mixed2video', status: 'succeeded',
  }],
  updated_at: '2026-08-04T08:25:00Z',
}

const dramaProject: DramaProject = {
  id: 'dramaproject-office-revenge',
  title: 'Office Revenge',
  description: 'Three-part pilot acceptance ledger',
  status: 'active',
  version: 1,
  created_at: '2026-08-04T07:00:00Z',
  updated_at: '2026-08-04T09:00:00Z',
}

const dramaRun: DramaRun = {
  id: 'dramarun-office-revenge-r1',
  project_id: dramaProject.id,
  parent_job_id: parentJob.id,
  run_number: 1,
  run_revision: 9,
  status: 'waiting_gate_2',
  spec_hash: '1'.repeat(64),
  spec: {
    market: 'US',
    language: 'en-US',
    platforms: ['TikTok', 'YouTube Shorts'],
    episode_count: 3,
    target_duration_seconds: 60,
    duration_tolerance_seconds: 5,
    aspect_ratio: '9:16',
    resolution: '480p',
    editing_mode: 'manual',
    publishing_mode: 'manual',
    budget_cents: 12_000,
  },
  episodes: [
    { id: 'episode-e01', drama_run_id: 'dramarun-office-revenge-r1', episode_index: 1, logical_key: 'E01', dispatch_key: 'episode:E01', child_job_id: childJob.id },
    { id: 'episode-e02', drama_run_id: 'dramarun-office-revenge-r1', episode_index: 2, logical_key: 'E02', dispatch_key: 'episode:E02', child_job_id: 'job-drama-e02' },
    { id: 'episode-e03', drama_run_id: 'dramarun-office-revenge-r1', episode_index: 3, logical_key: 'E03', dispatch_key: 'episode:E03', child_job_id: 'job-drama-e03' },
  ],
}

const researchDocument: DramaDocumentVersion = {
  id: 'dramadoc-research-v1',
  drama_run_id: dramaRun.id,
  doc_type: 'research_snapshot',
  logical_key: 'GLOBAL',
  revision_number: 1,
  run_revision: 4,
  content_format: 'json',
  content: { receipt_sha256: '4'.repeat(64), summary: 'Research inputs only' },
  content_hash: '2'.repeat(64),
  source_refs: [{ kind: 'codex_web_search', source_url: 'https://example.test/source' }],
  evidence_refs: [{ evidence_id: 'evidence-research-1', scope: 'research_inputs_only' }],
  created_at: '2026-08-04T08:10:00Z',
}

const mockAssetDocument: DramaDocumentVersion = {
  id: 'dramadoc-asset-v1',
  drama_run_id: dramaRun.id,
  doc_type: 'asset_manifest',
  logical_key: 'GLOBAL',
  revision_number: 1,
  run_revision: 7,
  content_format: 'json',
  content: { provider: 'mock-libtv', media_materialized: false },
  content_hash: '6'.repeat(64),
  source_refs: [{ kind: 'mock_generation_ledger', provider_invoked: false }],
  evidence_refs: [{ evidence_id: 'candidate-only' }],
}

const gateOne: DramaGate = {
  id: 'dramagate-one-r1',
  drama_run_id: dramaRun.id,
  gate_number: 1,
  gate_revision: 1,
  status: 'approved',
  run_revision: 6,
  approved_by: 'user-reviewer-1',
  approved_by_role: 'reviewer',
  approved_at: '2026-08-04T08:40:00Z',
  decision_hash: '3'.repeat(64),
  bindings: [{
    id: 'binding-research',
    gate_id: 'dramagate-one-r1',
    binding_type: 'document',
    requirement_key: 'research_snapshot:GLOBAL',
    document_version_id: researchDocument.id,
    document_content_hash: researchDocument.content_hash,
    provenance: {
      receipt_sha256: '4'.repeat(64),
      receipt_schema_version: 'qingzhi-codex-research-receipt/v2',
      gate_1_research_assessment: { scope: 'research_inputs_only', eligible: true, distinct_work_count: 2, reasons: [] },
    },
    stale: false,
  }],
}

const staleGateTwo: DramaGate = {
  id: 'dramagate-two-r1',
  drama_run_id: dramaRun.id,
  gate_number: 2,
  gate_revision: 1,
  status: 'stale',
  run_revision: 8,
  approved_by: 'user-reviewer-1',
  approved_by_role: 'reviewer',
  approved_at: '2026-08-04T08:50:00Z',
  decision_hash: '7'.repeat(64),
  stale_at: '2026-08-04T08:55:00Z',
  stale_reason: 'new_document_version:dramadoc-asset-v2',
  bindings: [{
    id: 'binding-asset-manifest',
    gate_id: 'dramagate-two-r1',
    binding_type: 'document',
    requirement_key: 'asset_manifest:GLOBAL',
    document_version_id: mockAssetDocument.id,
    document_content_hash: mockAssetDocument.content_hash,
    provenance: {},
    stale: true,
  }],
}

const gate1RequirementKeys = [
  'research_snapshot:GLOBAL',
  'fusion_plan:GLOBAL',
  'series_bible:GLOBAL',
  'episode_script:E01',
  'episode_script:E02',
  'episode_script:E03',
  'originality_report:GLOBAL',
] as const

function readinessItem(requirementKey: typeof gate1RequirementKeys[number], valid: boolean) {
  const [docType, logicalKey] = requirementKey.split(':')
  return {
    requirement_key: requirementKey,
    doc_type: docType,
    logical_key: logicalKey,
    document_version_id: valid ? `doc-${requirementKey}` : null,
    document_content_hash: valid ? 'a'.repeat(64) : null,
    run_revision: valid ? 9 : null,
    present: valid,
    latest: valid,
    contract: { valid, error: valid ? null : 'missing' },
    source: { valid, kind: valid ? (requirementKey === 'research_snapshot:GLOBAL' ? 'codex_research_receipt' : 'drama_stage_materialization') : null },
    model_receipt: null,
  }
}

const blockedGate1Readiness: DramaGate1Readiness = {
  schema_version: 'qingzhi-gate1-readiness/v1',
  drama_run_id: dramaRun.id,
  run_revision: dramaRun.run_revision,
  run_status: dramaRun.status,
  run_spec_hash: dramaRun.spec_hash,
  required_agent_contract: {
    stage_key: 'gate_1_draft_pack',
    candidate_pack_schema_version: 'qingzhi-gate1-candidate-pack/v1',
    required_skill_keys: ['drama.fusion.plan', 'drama.story.script', 'drama.story.originality'],
    document_requirement_keys: gate1RequirementKeys.slice(1),
    provider_receipt_required: true,
    human_originality_review_required: true,
  },
  output_schema_hash: null,
  stage: { latest_invocation: null, provider_receipt: null, latest_materialization: null },
  items: gate1RequirementKeys.map((key) => readinessItem(key, key === 'research_snapshot:GLOBAL')),
  cross_checks: {
    run_contract: { passed: false, details: { status: dramaRun.status } },
    current_research_receipt: { passed: true, details: {} },
    single_materialization: { passed: false, details: {} },
    provider_receipt_integrity: { passed: false, details: {} },
    materialized_documents_exact: { passed: false, details: {} },
    candidate_business_contract: { passed: false, details: {} },
    human_originality_review: { passed: false, details: {} },
  },
  blockers: [
    { code: 'DRAMA_GATE1_STATE_INVALID', message: 'DramaRun 当前不在 waiting_gate_1' },
    { code: 'DRAMA_GATE1_MATERIALIZATION_MISSING', message: 'Gate 1 尚无真实模型候选物化' },
  ],
  can_human_approve: false,
  readiness_hash: 'b'.repeat(64),
}

const readyCc: CCSwitchDiscovery = {
  status: 'ready',
  base_url: 'http://127.0.0.1:15721',
  health: { status: 'healthy' },
  models: [{ id: 'claude-sonnet-route' }],
  catalog_fingerprint: '1234567890abcdef1234567890abcdef',
}

const providerHealth: ProviderHealth = {
  production_ready: false,
  providers: [
    { id: 'cc-switch', kind: 'model_gateway', status: 'ready', detail: readyCc },
    { id: 'codex-research', kind: 'research_gateway', status: 'unconfigured', reason: '尚无真实研究收据' },
    { id: 'libtv', kind: 'media_provider', status: 'unconfigured' },
  ],
}

const gate1Agent: AgentRevision = {
  id: 'agentrevision-gate1-published',
  agent_key: 'drama.gate1.candidate-pack',
  revision_number: 1,
  name: 'Gate 1 candidate pack',
  description: 'Published test binding',
  content: { stage_key: 'gate_1_draft_pack' },
  content_hash: '7'.repeat(64),
  status: 'published',
  version: 3,
  binding: {
    id: 'agentbinding-gate1-published',
    agent_revision_id: 'agentrevision-gate1-published',
    model_profile_id: 'modelprofile-cc-switch',
    prompt_version_id: 'promptversion-gate1',
    skill_version_ids: ['skillversion-fusion'],
    tool_allowlist: [],
    output_schema: { type: 'object' },
    params: { temperature: 0.2 },
    params_hash: '8'.repeat(64),
  },
}

function response<T>(data: T, count?: number) {
  return new Response(JSON.stringify({ data, meta: { request_id: 'req-drama-test', ...(count === undefined ? {} : { count }) } }), {
    headers: { 'Content-Type': 'application/json' },
  })
}

function installApi({
  workflows = [workflow],
  jobs = [parentJob, childJob],
  runs = [mockRun],
  cc = readyCc,
  health = providerHealth,
  projects = [dramaProject],
  agents = [],
  runsByProject,
  detailsByRun,
  documentsByRun,
  gatesByRun,
  readinessByRun,
  approveResult,
  postResults = {},
  failPath,
}: {
  workflows?: WorkflowDefinition[]
  jobs?: Job[]
  runs?: GenerationRun[]
  cc?: CCSwitchDiscovery
  health?: ProviderHealth
  projects?: DramaProject[]
  agents?: AgentRevision[]
  runsByProject?: Record<string, DramaRun[]>
  detailsByRun?: Record<string, DramaRun>
  documentsByRun?: Record<string, DramaDocumentVersion[]>
  gatesByRun?: Record<string, DramaGate[]>
  readinessByRun?: Record<string, DramaGate1Readiness>
  approveResult?: { gate: DramaGate; run: DramaRun }
  postResults?: Record<string, unknown>
  failPath?: string
} = {}) {
  const projectRuns = runsByProject ?? { [dramaProject.id]: [dramaRun] }
  const runDetails = detailsByRun ?? { [dramaRun.id]: dramaRun }
  const runDocuments = documentsByRun ?? { [dramaRun.id]: [researchDocument, mockAssetDocument] }
  const runGates = gatesByRun ?? { [dramaRun.id]: [gateOne, staleGateTwo] }
  const runReadiness = readinessByRun ?? { [dramaRun.id]: blockedGate1Readiness }
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input)
    if (failPath && url.includes(failPath)) {
      return new Response(JSON.stringify({ error: { code: 'DRAMA_READ_FAILED', message: failPath.includes('/drama-projects') ? '短剧验收数据暂不可用' : '短剧只读账本暂不可用' }, meta: { request_id: 'req-failed' } }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (url.endsWith('/workflows?industry=drama')) return response(workflows, workflows.length)
    if (url.endsWith('/jobs?industry=drama')) return response(jobs, jobs.length)
    if (url.endsWith('/generation-runs')) return response(runs, runs.length)
    if (url.endsWith('/cc-switch/discover')) return response(cc)
    if (url.endsWith('/provider-health')) return response(health)

    const pathname = new URL(url, 'http://qingzhi.test').pathname
    if (pathname === '/api/v1/artifacts') return response([], 0)
    if (pathname.endsWith('/agent-configs') && (!init?.method || init.method === 'GET')) return response(agents, agents.length)
    if (pathname.endsWith('/drama-projects')) return response(projects, projects.length)
    if (init?.method === 'POST' && Object.prototype.hasOwnProperty.call(postResults, pathname)) return response(postResults[pathname])
    const gateApproveMatch = pathname.match(/\/drama-projects\/([^/]+)\/runs\/([^/]+)\/gates\/1\/approve$/)
    if (gateApproveMatch && init?.method === 'POST' && approveResult) return response(approveResult)
    const readinessMatch = pathname.match(/\/drama-projects\/([^/]+)\/runs\/([^/]+)\/gates\/1\/readiness$/)
    if (readinessMatch) return response(runReadiness[readinessMatch[2]] ?? blockedGate1Readiness)
    const documentsMatch = pathname.match(/\/drama-projects\/([^/]+)\/runs\/([^/]+)\/documents$/)
    if (documentsMatch) return response(runDocuments[documentsMatch[2]] ?? [], (runDocuments[documentsMatch[2]] ?? []).length)
    const gatesMatch = pathname.match(/\/drama-projects\/([^/]+)\/runs\/([^/]+)\/gates$/)
    if (gatesMatch) return response(runGates[gatesMatch[2]] ?? [], (runGates[gatesMatch[2]] ?? []).length)
    const publishingMatch = pathname.match(/\/drama-projects\/([^/]+)\/runs\/([^/]+)\/publishing-receipts$/)
    if (publishingMatch) return response([], 0)
    const performanceMatch = pathname.match(/\/drama-projects\/([^/]+)\/runs\/([^/]+)\/performance-snapshots$/)
    if (performanceMatch) return response([], 0)
    const detailMatch = pathname.match(/\/drama-projects\/([^/]+)\/runs\/([^/]+)$/)
    if (detailMatch && runDetails[detailMatch[2]]) return response(runDetails[detailMatch[2]])
    const runsMatch = pathname.match(/\/drama-projects\/([^/]+)\/runs$/)
    if (runsMatch) return response(projectRuns[runsMatch[1]] ?? [], (projectRuns[runsMatch[1]] ?? []).length)
    throw new Error(`Unexpected request: ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderPage() {
  return render(<MemoryRouter><DramaWorkspacePage /></MemoryRouter>)
}

afterEach(() => {
  vi.unstubAllGlobals()
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalInnerWidth })
})

describe('短剧工作台', () => {
  it('控制面与 DramaProject 验收数据未返回前保留明确加载态', () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(() => new Promise<Response>(() => undefined)))
    renderPage()

    expect(screen.getByText(/正在读取 DramaProject 真实账本/)).toBeInTheDocument()
    expect(screen.getByText(/正在读取短剧工作流、Job、GenerationRun、CC Switch 与研究收据/)).toBeInTheDocument()
  })

  it('展示真实 Project、冻结 Run spec、E01–E03、Gate binding/provenance 与文档证据', async () => {
    const fetchMock = installApi()
    renderPage()

    expect(await screen.findByRole('heading', { name: '冻结 DramaRunSpec' })).toBeInTheDocument()
    expect(screen.getByText(dramaRun.spec_hash)).toBeInTheDocument()
    expect(screen.getByText('12000')).toBeInTheDocument()
    const episodes = screen.getByRole('heading', { name: 'E01–E03 精确分集关系' }).closest('section')
    expect(episodes).toHaveTextContent('episode:E01')
    expect(episodes).toHaveTextContent('episode:E02')
    expect(episodes).toHaveTextContent('episode:E03')
    expect(within(episodes!).getByRole('link', { name: childJob.id })).toHaveAttribute('href', `/jobs/${childJob.id}`)

    const gatePanel = screen.getByRole('heading', { name: '当前 Gate 审批与精确绑定' }).closest('section')
    expect(gatePanel).toHaveTextContent('approved')
    expect(gatePanel).toHaveTextContent('stale')
    expect(gatePanel).toHaveTextContent(gateOne.decision_hash)
    expect(gatePanel).toHaveTextContent(researchDocument.content_hash)
    expect(gatePanel).toHaveTextContent('receipt_schema_version')
    expect(gatePanel).toHaveTextContent('new_document_version:dramadoc-asset-v2')

    const documents = screen.getByRole('heading', { name: 'DramaDocumentVersion 证据账本' }).closest('section')
    expect(documents).toHaveTextContent('research_snapshot')
    expect(documents).toHaveTextContent(researchDocument.content_hash)
    expect(documents).toHaveTextContent('source_refs（1）')
    expect(documents).toHaveTextContent('evidence_refs（1）')
    expect(documents).toHaveTextContent('回执输入 ≠ Gate 批准')
    expect(documents).toHaveTextContent('Mock / 候选证据')

    const gate1Pack = screen.getByRole('heading', { name: 'Gate 1 候选包与服务端 readiness' }).closest('section')
    expect(gate1Pack).toHaveTextContent('阻断 · 1/7')
    expect(gate1Pack).toHaveTextContent('DRAMA_GATE1_MATERIALIZATION_MISSING')
    expect(within(gate1Pack!).queryByRole('button', { name: /批准 Gate 1/ })).not.toBeInTheDocument()

    await screen.findByText('claude-sonnet-route')
    expect(screen.getByText(mockRun.id)).toBeInTheDocument()
    expect(screen.getByText('Mock / 候选记录')).toBeInTheDocument()
    const calledUrls = fetchMock.mock.calls.map(([input]) => String(input))
    expect(calledUrls).toEqual(expect.arrayContaining([
      expect.stringMatching(/\/drama-projects$/),
      expect.stringMatching(new RegExp(`/drama-projects/${dramaProject.id}/runs$`)),
      expect.stringMatching(new RegExp(`/drama-projects/${dramaProject.id}/runs/${dramaRun.id}$`)),
      expect.stringMatching(new RegExp(`/drama-projects/${dramaProject.id}/runs/${dramaRun.id}/documents$`)),
      expect.stringMatching(new RegExp(`/drama-projects/${dramaProject.id}/runs/${dramaRun.id}/gates$`)),
      expect.stringMatching(new RegExp(`/drama-projects/${dramaProject.id}/runs/${dramaRun.id}/gates/1/readiness$`)),
      expect.stringMatching(new RegExp(`/drama-projects/${dramaProject.id}/runs/${dramaRun.id}/publishing-receipts$`)),
      expect.stringMatching(new RegExp(`/drama-projects/${dramaProject.id}/runs/${dramaRun.id}/performance-snapshots$`)),
    ]))
    expect(screen.getByRole('heading', { name: '受控人工发布与指标证据' })).toBeInTheDocument()
    expect(screen.getByText(/platform_api_called=false · manual_unverified · metrics_externally_verified=false/)).toBeInTheDocument()
    expect(await screen.findByText('当前状态仅允许只读查看')).toBeInTheDocument()
  })

  it('Codex receipt 文档存在但 /gates 为空时三道 Gate 仍全部未批准', async () => {
    installApi({ gatesByRun: { [dramaRun.id]: [] }, documentsByRun: { [dramaRun.id]: [researchDocument] } })
    renderPage()

    expect(await screen.findByText('回执输入 ≠ Gate 批准')).toBeInTheDocument()
    expect(screen.getAllByText('未批准')).toHaveLength(3)
    const gatePanel = screen.getByRole('heading', { name: '当前 Gate 审批与精确绑定' }).closest('section')
    expect(within(gatePanel!).queryByText('approved')).not.toBeInTheDocument()
    expect(gatePanel).toHaveTextContent('其他回执不能填补此空缺')
  })

  it('仅在服务端 readiness 全绿后允许显式确认并提交 Gate 1 hash', async () => {
    const waitingRun: DramaRun = { ...dramaRun, status: 'waiting_gate_1', run_revision: 12 }
    const approvedRun: DramaRun = { ...waitingRun, status: 'building_assets', run_revision: 13 }
    const receipt = {
      id: 'modelreceipt-gate1-live',
      status: 'succeeded' as const,
      provider_invoked: true,
      receipt_hash: 'c'.repeat(64),
      response_id: 'response-live-1',
      raw_response_sha256: 'd'.repeat(64),
      model_id: 'cc-switch-model',
      protocol: 'openai_responses',
      integrity_verified: true,
    }
    const ready: DramaGate1Readiness = {
      ...blockedGate1Readiness,
      drama_run_id: waitingRun.id,
      run_revision: waitingRun.run_revision,
      run_status: waitingRun.status,
      stage: {
        latest_invocation: { id: 'stageinv-live', status: 'succeeded', version: 3, run_revision: 10, stage_key: 'gate_1_draft_pack', output_schema_hash: '1'.repeat(64) },
        provider_receipt: {
          invocation_receipt_id: 'stage-receipt-live',
          model_invocation_receipt_id: receipt.id,
          status: receipt.status,
          provider_invoked: receipt.provider_invoked,
          receipt_hash: receipt.receipt_hash,
          response_id: receipt.response_id,
          raw_response_sha256: receipt.raw_response_sha256,
          integrity_verified: true,
        },
        latest_materialization: { id: 'materialization-live', input_run_revision: 10, result_run_revision: 11, manifest_hash: '2'.repeat(64), materialization_hash: 'e'.repeat(64), integrity_verified: true },
      },
      items: gate1RequirementKeys.map((key) => ({ ...readinessItem(key, true), run_revision: key === 'originality_report:GLOBAL' ? 12 : 11, model_receipt: key === 'research_snapshot:GLOBAL' ? null : receipt })),
      cross_checks: Object.fromEntries(Object.keys(blockedGate1Readiness.cross_checks).map((key) => [key, { passed: true, details: {} }])),
      blockers: [],
      can_human_approve: true,
      readiness_hash: 'f'.repeat(64),
    }
    const approvedGate: DramaGate = { ...gateOne, id: 'gate-one-approved-live', run_revision: 13, decision_hash: '9'.repeat(64) }
    const fetchMock = installApi({
      runsByProject: { [dramaProject.id]: [waitingRun] },
      detailsByRun: { [waitingRun.id]: waitingRun },
      gatesByRun: { [waitingRun.id]: [] },
      readinessByRun: { [waitingRun.id]: ready },
      approveResult: { gate: approvedGate, run: approvedRun },
    })
    renderPage()

    expect(await screen.findByText('可人工批准')).toBeInTheDocument()
    const approveButton = screen.getByRole('button', { name: '批准 Gate 1 并锁定当前 hash' })
    expect(approveButton).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.change(screen.getByRole('textbox', { name: '批准说明（至少 24 个字符）' }), {
      target: { value: 'I independently reviewed originality, continuity, and three distinct episode drafts.' },
    })
    expect(approveButton).toBeEnabled()
    fireEvent.click(approveButton)

    expect(await screen.findByText(/Gate 1 已由服务端批准并绑定 decision hash/)).toBeInTheDocument()
    const postCall = fetchMock.mock.calls.find(([input, init]) => String(input).endsWith(`/drama-projects/${dramaProject.id}/runs/${waitingRun.id}/gates/1/approve`) && init?.method === 'POST')
    expect(postCall).toBeDefined()
    expect(JSON.parse(String(postCall?.[1]?.body))).toMatchObject({
      expected_run_revision: 12,
      expected_readiness_hash: ready.readiness_hash,
      originality_review_acknowledged: true,
    })
  })

  it('没有已发布绑定的 Gate 1 Agent 时只引导到控制面，不开放 Provider 调用', async () => {
    const waitingRun: DramaRun = { ...dramaRun, status: 'waiting_gate_1', run_revision: 10 }
    const readiness: DramaGate1Readiness = {
      ...blockedGate1Readiness,
      run_status: waitingRun.status,
      run_revision: waitingRun.run_revision,
      cross_checks: {
        ...blockedGate1Readiness.cross_checks,
        run_contract: { passed: true, details: { status: waitingRun.status } },
      },
    }
    installApi({
      runsByProject: { [dramaProject.id]: [waitingRun] },
      detailsByRun: { [waitingRun.id]: waitingRun },
      readinessByRun: { [waitingRun.id]: readiness },
      agents: [],
    })
    renderPage()

    const controlPlaneLink = await screen.findByRole('link', { name: 'Agent 控制面' })
    expect(controlPlaneLink).toHaveAttribute('href', '/settings/control-plane')
    expect(screen.queryByRole('button', { name: /调用已绑定模型/ })).not.toBeInTheDocument()
  })

  it('prepare 只冻结当前 research 与 published AgentRevision，不调用 Provider', async () => {
    const waitingRun: DramaRun = { ...dramaRun, status: 'waiting_gate_1', run_revision: 10 }
    const readiness: DramaGate1Readiness = {
      ...blockedGate1Readiness,
      run_status: waitingRun.status,
      run_revision: waitingRun.run_revision,
      cross_checks: {
        ...blockedGate1Readiness.cross_checks,
        run_contract: { passed: true, details: { status: waitingRun.status } },
      },
    }
    const postPath = `/api/v1/drama-projects/${dramaProject.id}/runs/${waitingRun.id}/stage-invocations`
    const fetchMock = installApi({
      runsByProject: { [dramaProject.id]: [waitingRun] },
      detailsByRun: { [waitingRun.id]: waitingRun },
      readinessByRun: { [waitingRun.id]: readiness },
      agents: [gate1Agent],
      postResults: { [postPath]: { invocation: { id: 'stageinv-prepared', status: 'prepared' } } },
    })
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: '准备冻结调用意图' }))
    expect(await screen.findByText(/已冻结本 Run revision/)).toBeInTheDocument()
    const postCall = fetchMock.mock.calls.find(([input, init]) => new URL(String(input), 'http://qingzhi.test').pathname === postPath && init?.method === 'POST')
    expect(postCall).toBeDefined()
    expect(JSON.parse(String(postCall?.[1]?.body))).toEqual({
      expected_run_revision: waitingRun.run_revision,
      stage_key: 'gate_1_draft_pack',
      agent_revision_id: gate1Agent.id,
      expected_agent_version: gate1Agent.version,
      research_document_version_id: 'doc-research_snapshot:GLOBAL',
      research_document_content_hash: 'a'.repeat(64),
    })
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
  })

  it('prepared invocation 必须显式确认后才执行一次，并提交冻结 version', async () => {
    const waitingRun: DramaRun = { ...dramaRun, status: 'waiting_gate_1', run_revision: 10 }
    const invocation = { id: 'stageinv-prepared-live', status: 'prepared', version: 4, run_revision: 10, stage_key: 'gate_1_draft_pack', output_schema_hash: '1'.repeat(64) }
    const readiness: DramaGate1Readiness = {
      ...blockedGate1Readiness,
      run_status: waitingRun.status,
      run_revision: waitingRun.run_revision,
      stage: { latest_invocation: invocation, provider_receipt: null, latest_materialization: null },
    }
    const postPath = `/api/v1/drama-projects/${dramaProject.id}/runs/${waitingRun.id}/stage-invocations/${invocation.id}/execute`
    const fetchMock = installApi({
      runsByProject: { [dramaProject.id]: [waitingRun] },
      detailsByRun: { [waitingRun.id]: waitingRun },
      readinessByRun: { [waitingRun.id]: readiness },
      postResults: { [postPath]: { invocation: { ...invocation, status: 'succeeded', version: 6 } } },
    })
    renderPage()

    const executeButton = await screen.findByRole('button', { name: '显式调用已绑定模型一次' })
    expect(executeButton).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox', { name: /执行一次可能计费的模型调用/ }))
    expect(executeButton).toBeEnabled()
    fireEvent.click(executeButton)

    expect(await screen.findByText(/单次已绑定模型调用已结束/)).toBeInTheDocument()
    const postCalls = fetchMock.mock.calls.filter(([input, init]) => new URL(String(input), 'http://qingzhi.test').pathname === postPath && init?.method === 'POST')
    expect(postCalls).toHaveLength(1)
    expect(JSON.parse(String(postCalls[0][1]?.body))).toEqual({
      expected_run_revision: waitingRun.run_revision,
      expected_version: invocation.version,
    })
  })

  it('succeeded receipt 以精确 ID/hash 原子物化，随后人工原创复核仍是独立操作', async () => {
    const waitingRun: DramaRun = { ...dramaRun, status: 'waiting_gate_1', run_revision: 10 }
    const invocation = { id: 'stageinv-succeeded-live', status: 'succeeded', version: 6, run_revision: 10, stage_key: 'gate_1_draft_pack', output_schema_hash: '1'.repeat(64) }
    const providerReceipt = {
      invocation_receipt_id: 'stage-receipt-live',
      model_invocation_receipt_id: 'model-receipt-live',
      status: 'succeeded',
      provider_invoked: true,
      receipt_hash: 'c'.repeat(64),
      response_id: 'response-live',
      raw_response_sha256: 'd'.repeat(64),
      integrity_verified: true,
    }
    const materializeReadiness: DramaGate1Readiness = {
      ...blockedGate1Readiness,
      run_status: waitingRun.status,
      run_revision: waitingRun.run_revision,
      stage: { latest_invocation: invocation, provider_receipt: providerReceipt, latest_materialization: null },
    }
    const materializePath = `/api/v1/drama-projects/${dramaProject.id}/runs/${waitingRun.id}/stage-invocations/${invocation.id}/materialize`
    const materializeFetch = installApi({
      runsByProject: { [dramaProject.id]: [waitingRun] },
      detailsByRun: { [waitingRun.id]: waitingRun },
      readinessByRun: { [waitingRun.id]: materializeReadiness },
      postResults: { [materializePath]: { materialization: { id: 'materialization-live' }, run: { ...waitingRun, run_revision: 11 } } },
    })
    const firstRender = renderPage()

    fireEvent.click(await screen.findByRole('button', { name: '物化当前真实回执' }))
    expect(await screen.findByText(/一次性物化为六份不可变文档/)).toBeInTheDocument()
    const materializeCall = materializeFetch.mock.calls.find(([input, init]) => new URL(String(input), 'http://qingzhi.test').pathname === materializePath && init?.method === 'POST')
    expect(JSON.parse(String(materializeCall?.[1]?.body))).toEqual({
      expected_run_revision: waitingRun.run_revision,
      expected_invocation_version: invocation.version,
      model_invocation_receipt_id: providerReceipt.model_invocation_receipt_id,
      model_invocation_receipt_hash: providerReceipt.receipt_hash,
    })
    firstRender.unmount()

    const materialization = { id: 'materialization-live', input_run_revision: 10, result_run_revision: 11, manifest_hash: '2'.repeat(64), materialization_hash: 'e'.repeat(64), integrity_verified: true }
    const originalityItems = gate1RequirementKeys.map((key) => {
      const item = readinessItem(key, key === 'research_snapshot:GLOBAL')
      if (key !== 'originality_report:GLOBAL') return item
      return {
        ...item,
        document_version_id: 'originality-candidate-live',
        document_content_hash: 'f'.repeat(64),
        run_revision: 11,
        present: true,
        latest: true,
        contract: { valid: true, error: null },
        source: { valid: false, kind: 'model_candidate_requires_human_review', materialization_id: materialization.id },
      }
    })
    const originalityReadiness: DramaGate1Readiness = {
      ...blockedGate1Readiness,
      run_status: waitingRun.status,
      run_revision: 11,
      stage: { latest_invocation: invocation, provider_receipt: providerReceipt, latest_materialization: materialization },
      items: originalityItems,
    }
    const reviewPath = `/api/v1/drama-projects/${dramaProject.id}/runs/${waitingRun.id}/gates/1/originality-reviews`
    const reviewFetch = installApi({
      runsByProject: { [dramaProject.id]: [{ ...waitingRun, run_revision: 11 }] },
      detailsByRun: { [waitingRun.id]: { ...waitingRun, run_revision: 11 } },
      readinessByRun: { [waitingRun.id]: originalityReadiness },
      postResults: { [reviewPath]: { review: { id: 'originality-review-live' }, run: { ...waitingRun, run_revision: 12 } } },
    })
    renderPage()

    fireEvent.click(await screen.findByRole('checkbox', { name: /我已独立核对标题/ }))
    const reviewNote = 'I checked identities, dialogue, scene sequence, visuals, and all researched works independently.'
    fireEvent.change(screen.getByRole('textbox', { name: '原创复核说明（至少 24 个字符）' }), { target: { value: reviewNote } })
    fireEvent.click(screen.getByRole('button', { name: '记录人工原创复核通过' }))
    expect(await screen.findByText(/独立人工原创复核已创建新的 pass 文档版本/)).toBeInTheDocument()
    const reviewCall = reviewFetch.mock.calls.find(([input, init]) => new URL(String(input), 'http://qingzhi.test').pathname === reviewPath && init?.method === 'POST')
    expect(JSON.parse(String(reviewCall?.[1]?.body))).toEqual({
      expected_run_revision: 11,
      materialization_id: materialization.id,
      candidate_document_version_id: 'originality-candidate-live',
      candidate_document_content_hash: 'f'.repeat(64),
      decision: 'pass',
      review_note: reviewNote,
    })
    expect(screen.queryByRole('button', { name: /批准 Gate 1/ })).not.toBeInTheDocument()
  })

  it('DramaProject 为空时不继续请求 Run，也不从 Job 补造 Project', async () => {
    const projectsFetch = installApi({ projects: [] })
    renderPage()
    expect(await screen.findByRole('heading', { name: '尚无 DramaProject' })).toBeInTheDocument()
    expect(projectsFetch.mock.calls.map(([input]) => String(input)).some((url) => url.includes('/drama-projects/') && url.endsWith('/runs'))).toBe(false)
  })

  it('Project 下没有 Run 时给出独立 empty 状态', async () => {
    installApi({ runsByProject: { [dramaProject.id]: [] } })
    renderPage()
    expect(await screen.findByRole('heading', { name: '当前 Project 尚无 DramaRun' })).toBeInTheDocument()
  })

  it('Run 下 Documents 与 Gates 为空时分别 fail closed', async () => {
    installApi({ documentsByRun: { [dramaRun.id]: [] }, gatesByRun: { [dramaRun.id]: [] } })
    renderPage()
    expect(await screen.findByRole('heading', { name: '当前 Run 尚无文档版本' })).toBeInTheDocument()
    expect(screen.getAllByText('未批准')).toHaveLength(3)
  })

  it('验收 API 失败时只读面板显示错误和重试，不伪造旧数据', async () => {
    installApi({ failPath: '/documents' })
    renderPage()

    expect(await screen.findByText('短剧只读账本暂不可用')).toBeInTheDocument()
    const alerts = screen.getAllByRole('alert')
    expect(alerts.some((alert) => within(alert).queryByRole('button', { name: '重试' }) !== null)).toBe(true)
    expect(screen.queryByRole('heading', { name: '当前 Gate 审批与精确绑定' })).not.toBeInTheDocument()
  })

  it('可切换 Project/Run，并按所选 ID 读取新的验收证据', async () => {
    const secondProject: DramaProject = { ...dramaProject, id: 'dramaproject-second', title: 'Second Pilot' }
    const secondRun: DramaRun = {
      ...dramaRun,
      id: 'dramarun-second-r2',
      project_id: secondProject.id,
      run_number: 2,
      run_revision: 3,
      status: 'draft',
      spec_hash: '8'.repeat(64),
      episodes: dramaRun.episodes?.map((episode) => ({ ...episode, id: `${episode.id}-second`, drama_run_id: 'dramarun-second-r2', child_job_id: null })),
    }
    const fetchMock = installApi({
      projects: [dramaProject, secondProject],
      runsByProject: { [dramaProject.id]: [dramaRun], [secondProject.id]: [secondRun] },
      detailsByRun: { [dramaRun.id]: dramaRun, [secondRun.id]: secondRun },
      documentsByRun: { [dramaRun.id]: [researchDocument], [secondRun.id]: [] },
      gatesByRun: { [dramaRun.id]: [gateOne], [secondRun.id]: [] },
    })
    renderPage()
    await screen.findByText(dramaRun.spec_hash)

    fireEvent.change(screen.getByRole('combobox', { name: 'DramaProject' }), { target: { value: secondProject.id } })
    expect(await screen.findByText(secondRun.spec_hash)).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'DramaRun' })).toHaveValue(secondRun.id)
    await waitFor(() => expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual(expect.arrayContaining([
      expect.stringMatching(new RegExp(`/drama-projects/${secondProject.id}/runs$`)),
      expect.stringMatching(new RegExp(`/drama-projects/${secondProject.id}/runs/${secondRun.id}/documents$`)),
      expect.stringMatching(new RegExp(`/drama-projects/${secondProject.id}/runs/${secondRun.id}/gates$`)),
    ])))
  })

  it('把健康但空模型目录明确归类为 needs_user_setup，同时保留验收面板', async () => {
    installApi({
      workflows: [], jobs: [], runs: [],
      cc: { ...readyCc, status: 'ready', models: [], catalog_fingerprint: null },
    })
    renderPage()

    expect(await screen.findByText('needs_user_setup')).toBeInTheDocument()
    expect(screen.getByText(/CC Switch 健康，但模型目录为空/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '冻结 DramaRunSpec' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '尚无短剧工作流定义' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '还没有短剧 Job' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '没有可关联的 GenerationRun' })).toBeInTheDocument()
  })

  it('原控制面任一 API 失败时仍显示错误态和可重试动作', async () => {
    installApi({ failPath: '/jobs?industry=drama' })
    renderPage()

    const message = await screen.findByText('短剧只读账本暂不可用')
    const alert = message.closest<HTMLElement>('[role="alert"]')
    expect(alert).not.toBeNull()
    expect(within(alert!).getByRole('button', { name: '重试' })).toBeInTheDocument()
    expect(screen.queryByLabelText('短剧母子任务')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '冻结 DramaRunSpec' })).toBeInTheDocument()
  })

  it('done、Mock Job 与 Mock document 均不会被升级为真实媒体', async () => {
    installApi({ jobs: [{ ...parentJob, status: 'done' }], runs: [] })
    renderPage()

    expect(await screen.findByText('Mock Job 不是模型、Research 或 LibTV 的真实生成证据')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '没有可关联的 GenerationRun' })).toBeInTheDocument()
    expect(screen.getByText(/即使进入 done，也不会因此升级为真实模型/)).toBeInTheDocument()
    expect(screen.getByText('Mock / 候选证据')).toBeInTheDocument()
    expect(screen.queryByText('真实生成已完成')).not.toBeInTheDocument()
    expect(screen.getAllByText('未实跑')).toHaveLength(3)
  })

  it('Provider health 的 Codex 研究输入状态仍不单独宣称 Gate 1 通过', async () => {
    installApi({
      gatesByRun: { [dramaRun.id]: [] },
      health: {
        production_ready: false,
        providers: [
          { id: 'cc-switch', kind: 'model_gateway', status: 'needs_user_setup' },
          { id: 'codex-research', kind: 'research_gateway', status: 'evidence_recorded', web_search_event_count: 6, source_count: 5, distinct_work_count: 2, gate_1_eligible: true },
          { id: 'libtv', kind: 'media_provider', status: 'unconfigured' },
        ],
      },
    })
    renderPage()

    expect(await screen.findByText('研究输入合格')).toBeInTheDocument()
    expect(screen.getByText(/覆盖 2 个独立作品/)).toBeInTheDocument()
    expect(screen.getByText(/仍需融合计划、Bible、三集成稿、原创报告和人工审批/)).toBeInTheDocument()
    expect(screen.getAllByText('未批准')).toHaveLength(3)
    expect(screen.queryByText('Gate 1 已通过')).not.toBeInTheDocument()
  })

  it('390px 视口仍保留项目、运行、Gate 与文档的可访问结构', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    installApi()
    renderPage()
    window.dispatchEvent(new Event('resize'))

    expect(await screen.findByRole('combobox', { name: 'DramaProject' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'DramaRun' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'E01–E03 精确分集关系' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '当前 Gate 审批与精确绑定' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'DramaDocumentVersion 证据账本' })).toBeInTheDocument()
  })
})
