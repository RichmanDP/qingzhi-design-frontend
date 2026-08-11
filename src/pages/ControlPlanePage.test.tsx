import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { AgentRevision, AgentSampleRunResult, ModelProfile, PromptVersion, SkillVersion } from '../types'
import ControlPlanePage from './ControlPlanePage'

const fingerprintA = 'a'.repeat(64)
const fingerprintB = 'b'.repeat(64)

const promptPublished: PromptVersion = {
  id: 'promptv-1', prompt_key: 'drama.writer', revision_number: 1, name: 'Drama writer',
  content_format: 'json', content: { system: 'Write structured drama' }, content_hash: '1'.repeat(64),
  status: 'published', source_version_id: null, published_at: '2026-08-04T08:00:00Z',
  created_at: '2026-08-04T07:00:00Z', updated_at: '2026-08-04T08:00:00Z', version: 2,
}

const promptDraft: PromptVersion = {
  ...promptPublished, id: 'promptv-2', revision_number: 2, name: 'Drama writer draft',
  content: { system: 'Draft only' }, content_hash: '2'.repeat(64), status: 'draft',
  published_at: null, created_at: '2026-08-04T09:00:00Z', updated_at: '2026-08-04T09:00:00Z', version: 1,
}

const skillPublished: SkillVersion = {
  id: 'skillv-1', skill_key: 'drama.structure', revision_number: 1, name: 'Drama structure',
  content_format: 'markdown', content: '# Structure', content_hash: '3'.repeat(64), status: 'published',
  source_version_id: null, published_at: '2026-08-04T08:00:00Z', created_at: '2026-08-04T07:00:00Z',
  updated_at: '2026-08-04T08:00:00Z', version: 2,
}

const modelWaiting: ModelProfile = {
  id: 'modelp-1', name: 'Local CC Switch', surface: 'cc_switch', protocol: 'openai',
  base_url: 'http://127.0.0.1:15721', model_id: 'kimi-k3', catalog_fingerprint: fingerprintA,
  observed_catalog_fingerprint: fingerprintB, secret_ref_configured: true,
  status: 'waiting_route_confirmation', route_checked_at: '2026-08-04T09:00:00Z', version: 3,
}

const modelReady: ModelProfile = {
  ...modelWaiting,
  catalog_fingerprint: fingerprintA,
  observed_catalog_fingerprint: fingerprintA,
  status: 'ready',
  version: 4,
}

const directCreated: ModelProfile = {
  id: 'modelp-direct', name: 'Kimi Code K3', surface: 'direct_api', protocol: 'openai_chat_completions',
  base_url: 'https://api.kimi.com/coding/v1', model_id: 'k3', catalog_fingerprint: null,
  observed_catalog_fingerprint: null, secret_ref_configured: false, provider_preset: 'kimi_code_cn',
  usage_scope: 'personal_interactive', status: 'needs_user_setup', route_checked_at: null, version: 1,
}

const directCredentialed: ModelProfile = {
  ...directCreated, secret_ref_configured: true, version: 2,
}

const directWaiting: ModelProfile = {
  ...directCredentialed, observed_catalog_fingerprint: fingerprintB,
  status: 'waiting_route_confirmation', route_checked_at: '2026-08-04T09:10:00Z', version: 3,
}

const directReady: ModelProfile = {
  ...directWaiting, catalog_fingerprint: fingerprintB, status: 'ready', version: 4,
}

const agentPublished: AgentRevision = {
  id: 'agentrev-1', agent_key: 'drama.writer', revision_number: 1, name: 'Drama Writer',
  description: 'Structured short-drama writer', content: { role: 'writer' }, content_hash: '4'.repeat(64),
  status: 'published', published_at: '2026-08-04T08:30:00Z', created_at: '2026-08-04T07:30:00Z',
  updated_at: '2026-08-04T08:30:00Z', version: 2,
  binding: {
    id: 'agentbind-1', agent_revision_id: 'agentrev-1', model_profile_id: modelWaiting.id,
    prompt_version_id: promptPublished.id, skill_version_ids: [skillPublished.id],
    tool_allowlist: ['artifact.read'], output_schema: { type: 'object' }, params: { temperature: 0.2 },
    params_hash: '5'.repeat(64), created_at: '2026-08-04T07:30:00Z',
  },
}

const sampleResult: AgentSampleRunResult = {
  status: 'unconfigured', configuration_valid: true, provider_invoked: false,
  reason: 'model_profile_waiting_route_confirmation', agent_revision_id: agentPublished.id,
  content_hash: agentPublished.content_hash, params_hash: agentPublished.binding!.params_hash,
  sample_input_hash: '6'.repeat(64),
  receipt: {
    id: 'modelreceipt-unconfigured', status: 'unconfigured', receipt_hash: '7'.repeat(64),
    request_id: 'modelrequest-unconfigured', request_hash: '8'.repeat(64),
    agent_revision_id: agentPublished.id, model_profile_id: modelWaiting.id, prompt_version_id: promptPublished.id,
    sample_input_hash: '6'.repeat(64),
    model_id: modelWaiting.model_id, protocol: modelWaiting.protocol, catalog_fingerprint: null,
    provider_invoked: false, response_id: null, raw_response_sha256: null,
    compiled_prompt_hash: '9'.repeat(64), output_schema_hash: 'a'.repeat(64),
    params_hash: agentPublished.binding!.params_hash, created_at: '2026-08-04T09:30:00Z',
    error: { code: 'MODEL_PROFILE_WAITING_ROUTE_CONFIRMATION' },
    integrity_verified: true,
  },
}

const sampleSucceeded: AgentSampleRunResult = {
  ...sampleResult,
  status: 'succeeded', configuration_valid: true, provider_invoked: true,
  reason: 'model_invoke_succeeded', output: { title: 'Glass Ladder', beats: 8 },
  receipt: {
    ...sampleResult.receipt,
    id: 'modelreceipt-succeeded', status: 'succeeded', receipt_hash: 'b'.repeat(64),
    request_id: 'modelrequest-succeeded', request_hash: 'c'.repeat(64),
    catalog_fingerprint: fingerprintA, provider_invoked: true, response_id: 'resp_1',
    raw_response_sha256: 'd'.repeat(64), created_at: '2026-08-04T09:31:00Z', error: null,
  },
}

const directSampleProfile: ModelProfile = {
  ...directReady,
  id: modelWaiting.id,
}

const directSampleSucceeded: AgentSampleRunResult = {
  ...sampleSucceeded,
  receipt: {
    ...sampleSucceeded.receipt,
    model_id: directSampleProfile.model_id,
    protocol: directSampleProfile.protocol,
    catalog_fingerprint: fingerprintB,
  },
}

const sampleFailed: AgentSampleRunResult = {
  ...sampleResult,
  status: 'failed', configuration_valid: true, provider_invoked: false,
  reason: 'cc_switch_route_confirmation_required',
  receipt: {
    ...sampleResult.receipt,
    id: 'modelreceipt-failed', status: 'failed', receipt_hash: 'e'.repeat(64),
    request_id: 'modelrequest-failed', request_hash: 'f'.repeat(64),
    created_at: '2026-08-04T09:32:00Z',
    error: { code: 'CC_SWITCH_ROUTE_CONFIRMATION_REQUIRED', message: 'route changed' },
  },
}

const sampleUnknown: AgentSampleRunResult = {
  ...sampleResult,
  status: 'unknown', configuration_valid: true, provider_invoked: true,
  automatic_retry_permitted: false,
  reason: 'model_invoke_outcome_unknown',
  receipt: {
    ...sampleResult.receipt,
    id: 'modelreceipt-unknown', status: 'failed', receipt_hash: '1'.repeat(64),
    request_id: 'modelrequest-unknown', request_hash: '2'.repeat(64),
    provider_invoked: true, raw_response_sha256: '3'.repeat(64),
    created_at: '2026-08-04T09:33:00Z',
    error: { code: 'MODEL_RESPONSE_TIMEOUT', message: 'provider outcome unknown' },
  },
}

function apiResponse<T>(data: T, status = 200) {
  return new Response(JSON.stringify({ data, meta: { request_id: 'req-control-test' } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function apiError(code: string, message: string, status = 500) {
  return new Response(JSON.stringify({ error: { code, message }, meta: { request_id: 'req-error' } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function installApi({
  prompts = [promptPublished, promptDraft],
  skills = [skillPublished],
  agents = [agentPublished],
  models = [modelWaiting],
  failList = false,
  failModelCreateWith,
  sample = sampleResult,
}: {
  prompts?: PromptVersion[]
  skills?: SkillVersion[]
  agents?: AgentRevision[]
  models?: ModelProfile[]
  failList?: boolean
  failModelCreateWith?: string
  sample?: unknown
} = {}) {
  let currentModels = models
  function replaceModel(row: ModelProfile) {
    currentModels = [...currentModels.filter((item) => item.id !== row.id), row]
  }
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    if (method === 'GET' && failList && url.endsWith('/prompt-versions')) return apiError('CONTROL_LIST_FAILED', 'server leaked env://DO_NOT_SHOW')
    if (method === 'GET' && url.endsWith('/prompt-versions')) return apiResponse(prompts)
    if (method === 'GET' && url.endsWith('/skill-versions')) return apiResponse(skills)
    if (method === 'GET' && url.endsWith('/agent-configs')) return apiResponse(agents)
    if (method === 'GET' && url.endsWith('/model-profiles')) return apiResponse(currentModels)
    if (method === 'POST' && url.endsWith('/model-profiles') && failModelCreateWith) return apiError('MODEL_CREATE_FAILED', `bad ref ${failModelCreateWith}`, 422)
    if (method === 'PATCH' && url.endsWith(`/model-profiles/${directCreated.id}/credential`)) {
      replaceModel(directCredentialed)
      return apiResponse(directCredentialed)
    }
    if (method === 'POST' && url.endsWith(`/model-profiles/${directCreated.id}/refresh-route`)) {
      replaceModel(directWaiting)
      return apiResponse(directWaiting)
    }
    if (method === 'POST' && url.endsWith(`/model-profiles/${directCreated.id}/confirm-route`)) {
      replaceModel(directReady)
      return apiResponse(directReady)
    }
    if (method === 'POST' && url.endsWith('/sample-run')) return apiResponse(sample)
    if (method === 'POST') {
      if (url.endsWith('/prompt-versions')) return apiResponse({ ...promptDraft, id: 'promptv-new', revision_number: 3 }, 201)
      if (url.endsWith('/agent-configs')) return apiResponse(agentPublished, 201)
      if (url.endsWith('/model-profiles')) {
        const body = JSON.parse(String(init?.body)) as { surface?: string }
        if (body.surface === 'direct_api') {
          replaceModel(directCreated)
          return apiResponse(directCreated, 201)
        }
        return apiResponse(modelWaiting, 201)
      }
      return apiResponse({ ok: true })
    }
    throw new Error(`Unexpected request: ${method} ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderPage() {
  return render(<MemoryRouter><ControlPlanePage /></MemoryRouter>)
}

async function openTab(name: string) {
  const tab = await screen.findByRole('tab', { name: new RegExp(name) })
  fireEvent.click(tab)
  return tab
}

describe('Agent 控制面', () => {
  it('并行数据未返回前显示五类资源的明确加载态', () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(() => new Promise<Response>(() => undefined)))
    renderPage()
    expect(screen.getByText(/正在并行读取 PromptVersion、SkillVersion、AgentRevision、AgentBinding 与 ModelProfile/)).toBeInTheDocument()
  })

  it('展示 AgentRevision、固定 Binding 和四类资源摘要', async () => {
    installApi()
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Agent 控制面' })).toBeInTheDocument()
    const summary = screen.getByLabelText('控制面摘要')
    expect(summary).toHaveTextContent('AgentRevision1')
    expect(summary).toHaveTextContent('PromptVersion2')
    expect(summary).toHaveTextContent('待确认路由1')
    expect(screen.getByText('Drama Writer')).toBeInTheDocument()
    expect(screen.getByText(agentPublished.binding!.params_hash)).toBeInTheDocument()
    expect(screen.getByText('published · 只读')).toBeInTheDocument()
  })

  it('空列表保持可操作空态，列表错误脱敏并允许重试', async () => {
    installApi({ prompts: [], skills: [], agents: [], models: [] })
    const first = renderPage()
    expect(await screen.findByRole('heading', { name: '还没有 AgentRevision' })).toBeInTheDocument()
    await openTab('PromptVersion')
    expect(screen.getByRole('heading', { name: '还没有 PromptVersion' })).toBeInTheDocument()
    first.unmount()

    installApi({ failList: true })
    renderPage()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('CONTROL_LIST_FAILED')
    expect(alert).not.toHaveTextContent('env://DO_NOT_SHOW')
    expect(within(alert).getByRole('button', { name: '重试' })).toBeInTheDocument()
  })

  it('published 内容明确只读，只能回滚或基于其创建新 revision', async () => {
    const fetchMock = installApi()
    renderPage()
    await openTab('PromptVersion')
    const list = await screen.findByLabelText('Prompt versions')
    const publishedCard = within(list).getByText('Drama writer').closest('article')!
    expect(within(publishedCard).getByText('published · 只读')).toBeInTheDocument()
    expect(within(publishedCard).queryByRole('button', { name: '发布' })).not.toBeInTheDocument()
    expect(within(publishedCard).getByRole('button', { name: /回滚为新发布 revision/ })).toBeInTheDocument()
    fireEvent.click(within(publishedCard).getByRole('button', { name: /回滚为新发布 revision/ }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([input, init]) => String(input).endsWith(`/prompt-versions/${promptPublished.id}/rollback`) && init?.method === 'POST')).toBe(true))
    const rollbackCall = fetchMock.mock.calls.find(([input]) => String(input).endsWith(`/prompt-versions/${promptPublished.id}/rollback`))
    expect(JSON.parse(String(rollbackCall?.[1]?.body))).toEqual({ expected_version: 2, note: 'control-plane UI rollback' })

    const draftCard = within(list).getByText('Drama writer draft').closest('article')!
    fireEvent.click(within(draftCard).getByRole('button', { name: '发布' }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([input, init]) => String(input).endsWith(`/prompt-versions/${promptDraft.id}/publish`) && init?.method === 'POST')).toBe(true))
    const publishCall = fetchMock.mock.calls.find(([input]) => String(input).endsWith(`/prompt-versions/${promptDraft.id}/publish`))
    expect(JSON.parse(String(publishCall?.[1]?.body))).toEqual({ expected_version: 1 })

    fireEvent.click(within(publishedCard).getByRole('button', { name: /基于此新建 revision/ }))
    expect(screen.getByText('基于 r1 创建新 revision')).toBeInTheDocument()
    expect(fetchMock.mock.calls.every(([, init]) => init?.method !== 'PATCH')).toBe(true)
  })

  it('JSON 导入只在浏览器预览，确认后 POST 新 revision；导出只创建本地 Blob', async () => {
    const fetchMock = installApi()
    const createObjectURL = vi.fn(() => 'blob:control-plane-export')
    const revokeObjectURL = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    renderPage()
    await openTab('PromptVersion')
    fireEvent.click(await screen.findByRole('button', { name: '创建草稿' }))

    const imported = {
      prompt_key: 'drama.imported', name: 'Imported prompt', content_format: 'json',
      content: { system: 'Imported locally' },
    }
    const file = new File([JSON.stringify(imported)], 'prompt.json', { type: 'application/json' })
    Object.defineProperty(file, 'text', { configurable: true, value: async () => JSON.stringify(imported) })
    fireEvent.change(screen.getByLabelText('本地导入'), { target: { files: [file] } })

    expect(await screen.findByLabelText('导入预览')).toHaveTextContent('尚未发送')
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(screen.getByLabelText('Prompt key')).toHaveValue('drama.imported')
    fireEvent.click(screen.getByRole('button', { name: /创建草稿 revision/ }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([input, init]) => String(input).endsWith('/prompt-versions') && init?.method === 'POST')).toBe(true))
    const createCall = fetchMock.mock.calls.find(([input, init]) => String(input).endsWith('/prompt-versions') && init?.method === 'POST')
    expect(new Headers(createCall?.[1]?.headers).get('Idempotency-Key')).toBeTruthy()
    expect(JSON.parse(String(createCall?.[1]?.body))).toMatchObject({ expected_version: 0, prompt_key: 'drama.imported' })
    expect(fetchMock.mock.calls.every(([, init]) => init?.method !== 'PATCH')).toBe(true)

    const publishedCard = within(screen.getByLabelText('Prompt versions')).getByText('Drama writer').closest('article')!
    const beforeExportCalls = fetchMock.mock.calls.length
    fireEvent.click(within(publishedCard).getByRole('button', { name: '本地导出' }))
    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:control-plane-export')
    expect(fetchMock).toHaveBeenCalledTimes(beforeExportCalls)
  })

  it('ModelProfile 只提交 secret_ref，提交后清空且错误不回显引用', async () => {
    const secretRef = 'env://QINGZHI_PROVIDER_TOKEN'
    const fetchMock = installApi({ failModelCreateWith: secretRef })
    const { container } = renderPage()
    await openTab('ModelProfile')
    fireEvent.click((await screen.findAllByRole('button', { name: '新建 Profile' }))[0])
    fireEvent.change(screen.getByLabelText('接入方式'), { target: { value: 'advanced' } })
    fireEvent.change(screen.getByLabelText('名称'), { target: { value: 'Provider route' } })
    fireEvent.change(screen.getByLabelText('base_url'), { target: { value: 'https://api.example.test/v1' } })
    fireEvent.change(screen.getByLabelText('model_id'), { target: { value: 'provider-model' } })
    const secretInput = screen.getByLabelText('Secret 引用（secret_ref，可选）')
    fireEvent.change(secretInput, { target: { value: secretRef } })
    fireEvent.click(screen.getByRole('button', { name: '创建 ModelProfile' }))

    await waitFor(() => expect(secretInput).toHaveValue(''))
    expect(await screen.findByText(/MODEL_CREATE_FAILED/)).toBeInTheDocument()
    expect(container.textContent).not.toContain(secretRef)
    const createCall = fetchMock.mock.calls.find(([input, init]) => String(input).endsWith('/model-profiles') && init?.method === 'POST')
    const body = JSON.parse(String(createCall?.[1]?.body))
    expect(body.secret_ref).toBe(secretRef)
    expect(body).not.toHaveProperty('secret')
    expect(body).not.toHaveProperty('api_key')
    expect(body).not.toHaveProperty('token')
  })

  it('Kimi Code 网站配置按元数据、Keychain、目录刷新、显式确认顺序启用，Key 只进入专用 PATCH', async () => {
    const apiKey = 'test-api-key-browser-only-canary'
    const fetchMock = installApi({ models: [] })
    const { container } = renderPage()
    await openTab('ModelProfile')
    fireEvent.click((await screen.findAllByRole('button', { name: '新建 Profile' }))[0])

    expect(screen.getByText(/官方固定模型清单/)).toBeInTheDocument()
    const keyInput = screen.getByLabelText('API Key（只写入本机 Keychain）')
    fireEvent.change(keyInput, { target: { value: apiKey } })
    fireEvent.click(screen.getByRole('checkbox', { name: /仅用于用户主动点击触发的个人交互/ }))
    fireEvent.click(screen.getByRole('button', { name: '保存凭据并确认路由' }))

    await waitFor(() => expect(screen.queryByLabelText('ModelProfile 编辑器')).not.toBeInTheDocument())
    expect(await screen.findByText('Kimi Code K3')).toBeInTheDocument()
    expect(container.textContent).not.toContain(apiKey)
    expect(Object.values(window.localStorage).join('')).not.toContain(apiKey)

    const writes = fetchMock.mock.calls.filter(([, init]) => (init?.method ?? 'GET') !== 'GET')
    expect(writes.map(([input, init]) => `${init?.method} ${new URL(String(input), 'http://local').pathname}`)).toEqual([
      'POST /api/v1/model-profiles',
      `PATCH /api/v1/model-profiles/${directCreated.id}/credential`,
      `POST /api/v1/model-profiles/${directCreated.id}/refresh-route`,
      `POST /api/v1/model-profiles/${directCreated.id}/confirm-route`,
    ])
    const [createCall, credentialCall, refreshCall, confirmCall] = writes
    const createBody = JSON.parse(String(createCall[1]?.body))
    expect(createBody).toMatchObject({
      expected_version: 0,
      surface: 'direct_api',
      protocol: 'openai_chat_completions',
      base_url: 'https://api.kimi.com/coding/v1',
      model_id: 'k3',
    })
    expect(JSON.stringify(createBody)).not.toContain(apiKey)
    expect(JSON.parse(String(credentialCall[1]?.body))).toEqual({
      expected_version: 1,
      api_key: apiKey,
      usage_scope_ack: 'personal_interactive_only_v1',
    })
    expect(JSON.parse(String(refreshCall[1]?.body))).toEqual({ expected_version: 2 })
    expect(JSON.parse(String(confirmCall[1]?.body))).toEqual({ expected_version: 3, catalog_fingerprint: fingerprintB })
    expect(new Headers(credentialCall[1]?.headers).get('Idempotency-Key')).toBeNull()
    for (const call of [createCall, refreshCall, confirmCall]) {
      expect(new Headers(call[1]?.headers).get('Idempotency-Key')).toBeTruthy()
      expect(String(call[0])).not.toContain(apiKey)
      expect(JSON.stringify(Object.fromEntries(new Headers(call[1]?.headers).entries()))).not.toContain(apiKey)
    }
  })

  it('目录变化只能显式 confirm-route，并把 observed fingerprint 原样确认', async () => {
    const fetchMock = installApi()
    renderPage()
    await openTab('ModelProfile')
    expect((await screen.findAllByText('waiting_route_confirmation')).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/发现目录指纹已变化/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '确认目录变化' }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([input, init]) => String(input).endsWith(`/model-profiles/${modelWaiting.id}/confirm-route`) && init?.method === 'POST')).toBe(true))
    const confirmCall = fetchMock.mock.calls.find(([input]) => String(input).endsWith(`/model-profiles/${modelWaiting.id}/confirm-route`))
    expect(JSON.parse(String(confirmCall?.[1]?.body))).toEqual({ expected_version: modelWaiting.version, catalog_fingerprint: fingerprintB })
  })

  it('sample-run 未配置态明确未调用，打开面板本身不发请求且不伪造 output', async () => {
    const fetchMock = installApi()
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'sample-run' }))
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(screen.getByText('当前不会调用 provider')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '检查运行条件（不调用 provider）' }))
    const receipt = await screen.findByText('服务端 sample-run 回执')
    const panel = receipt.closest('.cp-sample-result')!
    expect(panel).toHaveTextContent('unconfigured')
    expect(panel).toHaveTextContent('provider_invokedfalse')
    expect(panel).toHaveTextContent('不存在 provider output')
    expect(panel).toHaveTextContent('modelreceipt-unconfigured')
    expect(panel).toHaveTextContent('7'.repeat(64))
    expect(panel).not.toHaveTextContent('generated_output')
    const call = fetchMock.mock.calls.find(([input]) => String(input).endsWith('/sample-run'))
    expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({ expected_version: 2, sample_input: { brief: 'office revenge' } })
  })

  it('sample-run 成功态只在 ready 模型连接的用户点击后展示真实回执与 output', async () => {
    const fetchMock = installApi({ models: [modelReady], sample: sampleSucceeded })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'sample-run' }))
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(screen.getByText('本次点击将尝试真实调用')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '运行样例（将调用已绑定模型）' }))
    const panel = (await screen.findByText('服务端 sample-run 回执')).closest('.cp-sample-result') as HTMLElement
    expect(panel).toHaveTextContent('succeeded')
    expect(panel).toHaveTextContent('provider_invokedtrue')
    expect(panel).toHaveTextContent('modelreceipt-succeeded')
    expect(panel).toHaveTextContent('resp_1')
    expect(panel).toHaveTextContent('d'.repeat(64))
    expect(panel).toHaveTextContent('model_idkimi-k3')
    expect(panel).toHaveTextContent('protocolopenai')
    expect(panel).toHaveTextContent('provider output')
    expect(panel).toHaveTextContent('Glass Ladder')
  })

  it('ready direct_api 同样只在点击后调用，并展示 Chat Completions lineage', async () => {
    const fetchMock = installApi({ models: [directSampleProfile], sample: directSampleSucceeded })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'sample-run' }))
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(screen.getByText(/已确认 ready 的 direct_api profile/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '运行样例（将调用已绑定模型）' }))
    const panel = (await screen.findByText('服务端 sample-run 回执')).closest('.cp-sample-result') as HTMLElement
    expect(panel).toHaveTextContent('succeeded')
    expect(panel).toHaveTextContent('provider_invokedtrue')
    expect(panel).toHaveTextContent('model_idk3')
    expect(panel).toHaveTextContent('protocolopenai_chat_completions')
    expect(panel).toHaveTextContent(fingerprintB)
    expect(panel).toHaveTextContent('Glass Ladder')
  })

  it('sample-run 失败态展示安全错误且绝不补造 output', async () => {
    installApi({ sample: sampleFailed })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'sample-run' }))
    fireEvent.click(screen.getByRole('button', { name: '检查运行条件（不调用 provider）' }))
    const panel = (await screen.findByText('服务端 sample-run 回执')).closest('.cp-sample-result') as HTMLElement
    expect(panel).toHaveTextContent('failed')
    expect(panel).toHaveTextContent('CC_SWITCH_ROUTE_CONFIRMATION_REQUIRED')
    expect(panel).toHaveTextContent('服务端未返回 output，本页不会补造')
    expect(within(panel).queryByText('provider output')).not.toBeInTheDocument()
  })

  it('sample-run 越过 provider 边界后明确展示 unknown 并禁止重试', async () => {
    installApi({ sample: sampleUnknown })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'sample-run' }))
    fireEvent.click(screen.getByRole('button', { name: '检查运行条件（不调用 provider）' }))
    const panel = (await screen.findByText('服务端 sample-run 回执')).closest('.cp-sample-result') as HTMLElement
    expect(panel).toHaveTextContent('unknown')
    expect(panel).toHaveTextContent('结果未知 · 禁止重试')
    expect(panel).toHaveTextContent('MODEL_RESPONSE_TIMEOUT')
    expect(panel).toHaveTextContent('本页不会再次 POST')
    expect(within(panel).queryByText('provider output')).not.toBeInTheDocument()
  })

  it('sample-run 拒绝 status/provider/receipt 相互冲突的伪成功回执', async () => {
    installApi({ sample: { ...sampleSucceeded, provider_invoked: false } })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'sample-run' }))
    fireEvent.click(screen.getByRole('button', { name: '检查运行条件（不调用 provider）' }))
    expect((await screen.findAllByText(/不符合 fail-closed 契约，已拒绝展示/)).length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByText('服务端 sample-run 回执')).not.toBeInTheDocument()
    expect(screen.queryByText('Glass Ladder')).not.toBeInTheDocument()
  })

  it('390px 窄屏仍保留所有资源 tab 与模型路由动作', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    window.dispatchEvent(new Event('resize'))
    installApi()
    renderPage()
    const tabs = await screen.findByRole('tablist', { name: '控制面资源' })
    expect(within(tabs).getAllByRole('tab')).toHaveLength(4)
    fireEvent.click(within(tabs).getByRole('tab', { name: /ModelProfile/ }))
    expect(await screen.findByRole('button', { name: '刷新目录' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认目录变化' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '禁用' })).toBeInTheDocument()
  })
})
