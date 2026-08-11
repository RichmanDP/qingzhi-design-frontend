import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { AgentDefinition, Meeting } from '../types'
import { jsonResponse } from '../test/helpers'
import MeetingsPage from './MeetingsPage'

describe('结果型会议', () => {
  it('页面内展示 Mock 提案与反证，并提交结论和派生任务', async () => {
    const agents: AgentDefinition[] = [
      { id: 'agent-1', name: '策略顾问', department: '咨询', industry: 'consulting' },
      { id: 'agent-2', name: '风险顾问', department: '咨询', industry: 'consulting' },
    ]
    const meeting: Meeting = {
      id: 'meeting-1',
      title: '首个 MVP 决策',
      question: '应该先验证哪个方案？',
      industry: 'consulting',
      status: 'open',
      agent_ids: ['agent-1', 'agent-2'],
      proposals: [{ agent_id: 'agent-1', title: '小范围试点', summary: '先验证最短价值链。' }],
      counterarguments: [{ agent_id: 'agent-2', risk: '样本偏差', summary: '需要预先定义退出条件。' }],
      version: 1,
    }
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input)
      if (url.endsWith('/meetings/meeting-1/conclude') && init?.method === 'POST') {
        return jsonResponse({ ...meeting, status: 'concluded', decision: 'GO', action_job_ids: ['job-derived-1'] })
      }
      if (url.endsWith('/meetings')) return jsonResponse([meeting])
      if (url.endsWith('/agents?enabled=true')) return jsonResponse(agents)
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const promptSpy = vi.spyOn(window, 'prompt')

    render(<MemoryRouter><MeetingsPage /></MemoryRouter>)

    expect(await screen.findByText('小范围试点')).toBeInTheDocument()
    expect(screen.getByText('先验证最短价值链。')).toBeInTheDocument()
    expect(screen.getByText('样本偏差')).toBeInTheDocument()
    expect(screen.getByText('需要预先定义退出条件。')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '形成结论' }))
    fireEvent.change(screen.getByLabelText('结论依据、失败风险或缺失信息'), { target: { value: '先用两周验证，达不到门槛则停止。' } })
    expect(screen.getByRole('checkbox', { name: /创建可追溯行动任务/ })).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: '保存结论' }))

    await waitFor(() => expect(fetchMock.mock.calls.some(([input, init]) => String(input).endsWith('/meetings/meeting-1/conclude') && init?.method === 'POST')).toBe(true))
    const concludeRequest = fetchMock.mock.calls.find(([input, init]) => String(input).endsWith('/meetings/meeting-1/conclude') && init?.method === 'POST')
    const concludeBody = JSON.parse(String(concludeRequest?.[1]?.body))
    expect(concludeBody).toMatchObject({
      decision: 'GO',
      rationale: '先用两周验证，达不到门槛则停止。',
      action_items: [{ industry: 'consulting', create_job: true }],
    })
    expect(concludeBody).not.toHaveProperty('proposals')
    expect(concludeBody).not.toHaveProperty('counterarguments')
    expect(promptSpy).not.toHaveBeenCalled()
  })

  it('创建会议时把所选行业写入服务端请求', async () => {
    const agents: AgentDefinition[] = [
      { id: 'agent-1', name: '策略顾问', department: '咨询', industry: 'consulting' },
      { id: 'agent-2', name: '风险顾问', department: '咨询', industry: 'consulting' },
    ]
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input)
      if (url.endsWith('/meetings') && init?.method === 'POST') return jsonResponse({ id: 'meeting-created', title: '咨询试点', question: '是否启动咨询试点？', industry: 'consulting', status: 'ready_for_decision', agent_ids: ['agent-1', 'agent-2'] }, 201)
      if (url.endsWith('/meetings')) return jsonResponse([])
      if (url.endsWith('/agents?enabled=true')) return jsonResponse(agents)
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter><MeetingsPage /></MemoryRouter>)

    await screen.findByText('尚未发起结果型会议')
    fireEvent.click(screen.getByRole('button', { name: '发起会议' }))
    fireEvent.change(screen.getByLabelText('会议目标'), { target: { value: '咨询试点' } })
    fireEvent.change(screen.getByLabelText('决策背景和成功条件'), { target: { value: '是否启动咨询试点？' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /策略顾问/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /风险顾问/ }))
    fireEvent.click(screen.getByRole('button', { name: '创建并生成独立提案' }))

    await waitFor(() => expect(fetchMock.mock.calls.some(([input, init]) => String(input).endsWith('/meetings') && init?.method === 'POST')).toBe(true))
    const request = fetchMock.mock.calls.find(([input, init]) => String(input).endsWith('/meetings') && init?.method === 'POST')
    expect(JSON.parse(String(request?.[1]?.body))).toMatchObject({ industry: 'consulting', agent_ids: ['agent-1', 'agent-2'] })
  })
})
