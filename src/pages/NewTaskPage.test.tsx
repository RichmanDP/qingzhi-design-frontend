import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { Job, WorkflowDefinition } from '../types'
import { jsonResponse, LocationProbe } from '../test/helpers'
import NewTaskPage from './NewTaskPage'

const workflows: WorkflowDefinition[] = [
  { id: 'content-v1', name: '内容工作流', industry: 'content', version: '1.0.0', nodes: [{ id: 'draft', name: '撰稿' }] },
  { id: 'medical-v1', name: '医疗合规工作流', industry: 'medical', version: '1.0.0', nodes: [{ id: 'evidence', name: '证据核验' }, { id: 'cost-review', name: '成本复核', optional: true }, { id: 'platform-fit', name: '平台适配', type: 'optional' }, { id: 'gate', name: '医疗门禁' }] },
]

function renderPage(route = '/tasks/new?industry=medical') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/tasks/new" element={<NewTaskPage />} />
        <Route path="/jobs/:id" element={<h1>工单已创建</h1>} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  )
}

function stubApi(createdJob?: Job, settings = { default_approval_mode: 'key', enabled_industries: ['content', 'medical'] }) {
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input)
    if (url.endsWith('/workflows')) return jsonResponse(workflows)
    if (url.endsWith('/settings')) return jsonResponse(settings)
    if (url.endsWith('/jobs') && init?.method === 'POST' && createdJob) return jsonResponse(createdJob)
    throw new Error(`Unexpected request: ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('下达任务表单', () => {
  it('阻止只有空白字符的必填内容提交，并声明字段边界', async () => {
    const fetchMock = stubApi()
    renderPage()

    const title = screen.getByLabelText(/任务标题/)
    const brief = screen.getByLabelText(/一句话需求与背景/)
    expect(title).toBeRequired()
    expect(title).toHaveAttribute('maxlength', '160')
    expect(brief).toBeRequired()
    expect(brief).toHaveAttribute('maxlength', '6000')
    expect(screen.getByLabelText(/成本上限/)).toHaveAttribute('min', '0')

    await waitFor(() => {
      expect(screen.getByLabelText('工作流版本')).toHaveValue('medical-v1')
      expect(screen.getByRole('checkbox', { name: /成本复核/ })).toBeChecked()
      expect(screen.getByRole('checkbox', { name: /平台适配/ })).toBeChecked()
    })
    fireEvent.change(title, { target: { value: '   ' } })
    fireEvent.change(brief, { target: { value: '\n  ' } })
    fireEvent.submit(screen.getByRole('button', { name: '确认并创建任务' }).closest('form')!)

    expect(await screen.findByText('请完整填写任务标题、需求、已启用行业和工作流。')).toBeInTheDocument()
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0)
  })

  it('医疗任务禁用全自动，并在行业切换后恢复安全默认值', async () => {
    stubApi()
    renderPage('/tasks/new?industry=content')

    await waitFor(() => expect(screen.getByLabelText('工作流版本')).toHaveValue('content-v1'))
    const automatic = screen.getByRole('radio', { name: /全自动/ })
    fireEvent.click(automatic)
    expect(automatic).toBeChecked()

    fireEvent.change(screen.getByLabelText('行业'), { target: { value: 'medical' } })

    await waitFor(() => {
      expect(automatic).toBeDisabled()
      expect(screen.getByRole('radio', { name: /关键审批/ })).toBeChecked()
      expect(screen.getByLabelText('工作流版本')).toHaveValue('medical-v1')
    })
    expect(screen.getByText(/高风险 Gate 在服务端和交付出口均不可 override/)).toBeInTheDocument()
  })

  it('读取租户默认审批模式，并在行业允许时应用', async () => {
    stubApi(undefined, { default_approval_mode: 'managed', enabled_industries: ['content'] })
    renderPage('/tasks/new?industry=content')

    await waitFor(() => expect(screen.getByRole('radio', { name: /完全托管/ })).toBeChecked())
    expect(screen.getByRole('radio', { name: /完全托管.*租户默认/ })).toBeChecked()
    expect(screen.getByText(/已应用租户默认审批模式/)).toBeInTheDocument()
  })

  it('显式空行业设置时不提供工作流并阻止提交', async () => {
    stubApi(undefined, { default_approval_mode: 'key', enabled_industries: [] })
    renderPage('/tasks/new?industry=medical')

    await waitFor(() => expect(screen.getByLabelText('行业')).toBeDisabled())
    expect(screen.getByLabelText('行业')).toHaveValue('')
    expect(screen.getByText('租户未启用任何行业，请先由管理员在设置页启用。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认并创建任务' })).toBeDisabled()
  })

  it('提交结构化约束、资料名和幂等请求，并跳转到新工单', async () => {
    const createdJob: Job = {
      id: 'job-created-1', title: '医疗选购指南', brief: '基于已批准适用范围写作', industry: 'medical',
      workflow_id: 'medical-v1', approval_mode: 'key', status: 'queued', version: 1,
      created_at: '2026-08-02T00:00:00Z', updated_at: '2026-08-02T00:00:00Z',
    }
    const fetchMock = stubApi(createdJob)
    renderPage()

    await waitFor(() => expect(screen.getByLabelText('工作流版本')).toHaveValue('medical-v1'))
    fireEvent.change(screen.getByLabelText(/任务标题/), { target: { value: '  医疗选购指南  ' } })
    fireEvent.change(screen.getByLabelText(/一句话需求与背景/), { target: { value: '  基于已批准适用范围写作  ' } })
    fireEvent.change(screen.getByLabelText(/验收标准/), { target: { value: '保留来源\n\n禁止疗效承诺' } })
    fireEvent.change(screen.getByLabelText(/成本上限/), { target: { value: '80' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /公众号/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /平台适配/ }))
    fireEvent.change(screen.getByLabelText('参考资料'), { target: { files: [new File(['evidence'], 'register.pdf', { type: 'application/pdf' })] } })
    fireEvent.submit(screen.getByRole('button', { name: '确认并创建任务' }).closest('form')!)

    expect(await screen.findByRole('heading', { name: '工单已创建' })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/jobs/job-created-1')

    const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')
    expect(postCall).toBeDefined()
    const postInit = postCall?.[1]
    expect(new Headers(postInit?.headers).get('Idempotency-Key')).toBeTruthy()
    expect(JSON.parse(String(postInit?.body))).toMatchObject({
      title: '医疗选购指南',
      brief: '基于已批准适用范围写作',
      industry: 'medical',
      workflow_id: 'medical-v1',
      approval_mode: 'key',
      platforms: ['公众号'],
      acceptance_criteria: ['保留来源', '禁止疗效承诺'],
      budget_cents: 8000,
      material_names: ['register.pdf'],
      optional_nodes: ['cost-review'],
    })
  })

  it('失败重试复用同一幂等键，实质表单变化后轮换', async () => {
    const createdJob: Job = {
      id: 'job-retry-1', title: '重试测试任务 v2', brief: '验证不确定响应后的安全重试', industry: 'content',
      workflow_id: 'content-v1', approval_mode: 'key', status: 'queued', version: 1,
      created_at: '2026-08-02T00:00:00Z', updated_at: '2026-08-02T00:00:00Z',
    }
    let postCount = 0
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input)
      if (url.endsWith('/workflows')) return jsonResponse(workflows)
      if (url.endsWith('/settings')) return jsonResponse({ default_approval_mode: 'key', enabled_industries: ['content'] })
      if (url.endsWith('/jobs') && init?.method === 'POST') {
        postCount += 1
        if (postCount < 3) return new Response(JSON.stringify({ error: { code: 'TEMPORARY_FAILURE', message: '临时失败，请重试' } }), { status: 503, headers: { 'Content-Type': 'application/json' } })
        return jsonResponse(createdJob, 201)
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    renderPage('/tasks/new?industry=content')

    await waitFor(() => expect(screen.getByLabelText('工作流版本')).toHaveValue('content-v1'))
    fireEvent.change(screen.getByLabelText(/任务标题/), { target: { value: '重试测试任务' } })
    fireEvent.change(screen.getByLabelText(/一句话需求与背景/), { target: { value: '验证不确定响应后的安全重试' } })
    const form = screen.getByRole('button', { name: '确认并创建任务' }).closest('form')!
    fireEvent.submit(form)
    expect(await screen.findByText('临时失败，请重试')).toBeInTheDocument()
    fireEvent.submit(form)
    await waitFor(() => expect(postCount).toBe(2))
    fireEvent.change(screen.getByLabelText(/任务标题/), { target: { value: '重试测试任务 v2' } })
    fireEvent.submit(form)
    expect(await screen.findByRole('heading', { name: '工单已创建' })).toBeInTheDocument()

    const keys = fetchMock.mock.calls
      .filter(([input, init]) => String(input).endsWith('/jobs') && init?.method === 'POST')
      .map(([, init]) => new Headers(init?.headers).get('Idempotency-Key'))
    expect(keys).toHaveLength(3)
    expect(keys[1]).toBe(keys[0])
    expect(keys[2]).not.toBe(keys[0])
  })
})
