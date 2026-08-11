import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { jsonResponse } from '../test/helpers'
import DepartmentPage from './DepartmentPage'

describe('部门工作流定义', () => {
  it('把服务端节点 kind 映射为真实的人工作业、门禁与可选节点', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input) => {
      const url = String(input)
      if (url.includes('/agents?')) return jsonResponse([])
      if (url.includes('/workflows?')) return jsonResponse([{
        id: 'workflow_content_v1',
        name: '内容工作流',
        industry: 'content',
        definition_version: '1.0.0',
        nodes: [
          { id: 'draft', name: '生成初稿', kind: 'agent' },
          { id: 'approve', name: '人工审批', kind: 'approval', depends_on: ['draft'] },
          { id: 'gate', name: '合规门禁', kind: 'compliance', depends_on: ['approve'] },
          { id: 'optional', name: '可选扩展', kind: 'agent', optional: true, depends_on: ['gate'] },
        ],
      }])
      throw new Error(`Unexpected request: ${url}`)
    }))

    render(
      <MemoryRouter initialEntries={['/departments/content']}>
        <Routes><Route path="/departments/:industry" element={<DepartmentPage />} /></Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('人工审批')).toBeInTheDocument()
    const workflow = screen.getByRole('list', { name: '内容生产部工作流' })
    expect(workflow).toHaveTextContent('串行')
    expect(workflow).toHaveTextContent('人工')
    expect(workflow).toHaveTextContent('门禁')
    expect(workflow).toHaveTextContent('可选')
  })
})
