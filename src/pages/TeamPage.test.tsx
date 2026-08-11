import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { jsonResponse } from '../test/helpers'
import TeamPage from './TeamPage'

describe('团队与权限页面', () => {
  it('解析 tenant/members/roles 响应并展示服务端成员和完整角色选项', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input) => {
      const url = String(input)
      if (url.endsWith('/team')) {
        return jsonResponse({
          tenant: { id: 'tenant-1', name: '擎智测试企业', slug: 'qingzhi-demo' },
          members: [{
            id: 'user-1',
            email: 'owner@qingzhi.local',
            name: '本地管理员',
            role: 'admin',
            permissions: ['industry:medical', 'module:tasks', 'action:review'],
            industries: ['medical'],
            modules: ['tasks'],
            actions: ['review'],
            active: true,
            created_at: '2026-08-02T00:00:00Z',
          }],
          roles: [
            { id: 'viewer', name: '只读成员' },
            { id: 'operator', name: '任务操作员' },
            { id: 'reviewer', name: '审批人' },
            { id: 'medical_signer', name: '医疗签发人' },
            { id: 'admin', name: '租户管理员' },
          ],
        })
      }
      throw new Error(`Unexpected request: ${url}`)
    }))

    render(<MemoryRouter><TeamPage /></MemoryRouter>)

    expect(await screen.findByText('本地管理员')).toBeInTheDocument()
    expect(screen.getByText('owner@qingzhi.local')).toBeInTheDocument()
    expect(screen.getByText(/擎智测试企业（qingzhi-demo）/)).toBeInTheDocument()
    expect(screen.getByText(/主要业务写接口会进一步按 allowlist 收口/)).toBeInTheDocument()
    expect(screen.getByText('行业:medical · 模块:tasks · 动作:review')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '添加成员' }))
    const roleSelect = screen.getByLabelText('服务端角色')
    for (const roleName of ['只读成员', '任务成员', '任务操作员', '审批人', '医疗签发人', '租户管理员']) {
      expect(within(roleSelect).getByRole('option', { name: roleName })).toBeInTheDocument()
    }
  })
})
