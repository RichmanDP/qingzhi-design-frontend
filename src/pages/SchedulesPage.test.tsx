import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { WorkflowDefinition } from '../types'
import { jsonResponse } from '../test/helpers'
import SchedulesPage from './SchedulesPage'

const workflows: WorkflowDefinition[] = [
  { id: 'content-v1', name: '内容工作流', industry: 'content', version: '1.0.0', enabled: true, nodes: [] },
  { id: 'medical-v1', name: '医疗工作流', industry: 'medical', version: '1.0.0', enabled: true, nodes: [] },
]

function renderPage(settings: { timezone: string; default_approval_mode: string; enabled_industries: string[] }) {
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input)
    if (url.endsWith('/schedules') && init?.method === 'POST') return jsonResponse({ id: 'schedule-created' }, 201)
    if (url.endsWith('/schedules')) return jsonResponse([])
    if (url.endsWith('/workflows')) return jsonResponse(workflows)
    if (url.endsWith('/settings')) return jsonResponse(settings)
    throw new Error(`Unexpected request: ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  render(<MemoryRouter><SchedulesPage /></MemoryRouter>)
  return fetchMock
}

describe('定时任务租户默认', () => {
  it('使用租户时区、审批默认和启用行业创建计划', async () => {
    const fetchMock = renderPage({ timezone: 'Asia/Hong_Kong', default_approval_mode: 'managed', enabled_industries: ['content'] })

    await screen.findByText('没有定时任务')
    fireEvent.click(screen.getByRole('button', { name: '新建规则' }))
    expect(screen.getByLabelText('行业')).toHaveValue('content')
    expect(screen.queryByRole('option', { name: '医疗器械产业部' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Cron（Asia/Hong_Kong）')).toBeInTheDocument()
    expect(screen.getByText(/到点创建的任务采用“完全托管”/)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('名称'), { target: { value: '每周内容复盘' } })
    fireEvent.change(screen.getByLabelText('工作流'), { target: { value: 'content-v1' } })
    fireEvent.click(screen.getByRole('button', { name: '保存调度规则' }))

    await waitFor(() => expect(fetchMock.mock.calls.some(([input, init]) => String(input).endsWith('/schedules') && init?.method === 'POST')).toBe(true))
    const request = fetchMock.mock.calls.find(([input, init]) => String(input).endsWith('/schedules') && init?.method === 'POST')
    expect(JSON.parse(String(request?.[1]?.body))).toMatchObject({
      timezone: 'Asia/Hong_Kong',
      job_template: { industry: 'content', workflow_id: 'content-v1', approval_mode: 'managed' },
    })
  })

  it('显式空行业设置时阻止创建计划', async () => {
    renderPage({ timezone: 'Asia/Shanghai', default_approval_mode: 'key', enabled_industries: [] })

    await screen.findByText('没有定时任务')
    fireEvent.click(screen.getByRole('button', { name: '新建规则' }))
    expect(screen.getByLabelText('行业')).toBeDisabled()
    expect(screen.getByLabelText('行业')).toHaveValue('')
    expect(screen.getByText('租户未启用任何行业，不能创建新计划。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存调度规则' })).toBeDisabled()
  })
})
