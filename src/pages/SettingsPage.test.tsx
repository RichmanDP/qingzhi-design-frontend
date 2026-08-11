import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { jsonResponse } from '../test/helpers'
import SettingsPage from './SettingsPage'

describe('租户设置', () => {
  it('保存企业、语言、时区和通知偏好，并始终保留外发终审', async () => {
    const settings = {
      version: 4,
      tenant_name: '擎智本地企业',
      locale: 'zh-CN',
      timezone: 'Asia/Shanghai',
      default_approval_mode: 'key',
      retention_days: 365,
      retention_status: { enforcement: 'terminal_jobs_and_idempotency_records', automatic_deletion: true, last_run_at: null },
      culture_legal_automatic_enabled: false,
      enabled_industries: ['content'],
      notification_channels: ['in_app'],
      external_publish_requires_confirmation: true,
    }
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input)
      if (url.endsWith('/settings') && init?.method === 'PATCH') return jsonResponse({ ...settings, version: 5 })
      if (url.endsWith('/settings')) return jsonResponse(settings)
      if (url.endsWith('/connectors')) return jsonResponse([])
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<MemoryRouter><SettingsPage /></MemoryRouter>)

    const tenantName = await screen.findByLabelText('企业名称')
    await waitFor(() => expect(tenantName).toHaveValue('擎智本地企业'))
    expect(screen.getByText(/保留策略每日清理到期的终态任务及幂等记录/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /配置 Kimi 与模型/ })).toHaveAttribute('href', '/settings/control-plane')
    expect(screen.getByRole('group', { name: '启用行业' })).toBeInTheDocument()
    fireEvent.change(tenantName, { target: { value: '擎智验收企业' } })
    fireEvent.change(screen.getByLabelText('界面语言'), { target: { value: 'en-US' } })
    fireEvent.change(screen.getByLabelText('默认时区'), { target: { value: 'Asia/Hong_Kong' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /邮件/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /允许文化法务任务选择全自动推进/ }))
    fireEvent.click(screen.getByRole('button', { name: '保存设置' }))

    await waitFor(() => expect(fetchMock.mock.calls.some(([input, init]) => String(input).endsWith('/settings') && init?.method === 'PATCH')).toBe(true))
    const patchRequest = fetchMock.mock.calls.find(([input, init]) => String(input).endsWith('/settings') && init?.method === 'PATCH')
    expect(JSON.parse(String(patchRequest?.[1]?.body))).toMatchObject({
      tenant_name: '擎智验收企业',
      locale: 'en-US',
      timezone: 'Asia/Hong_Kong',
      notification_channels: ['in_app', 'email'],
      culture_legal_automatic_enabled: true,
      external_publish_requires_confirmation: true,
      expected_version: 4,
    })
    expect(screen.getByRole('checkbox', { name: /外部发布始终终审/ })).toBeChecked()
  })

  it('明确提示空行业会阻止所有新任务与计划', async () => {
    const settings = {
      version: 1,
      tenant_name: '擎智本地企业',
      locale: 'zh-CN',
      timezone: 'Asia/Shanghai',
      default_approval_mode: 'key',
      retention_days: 365,
      enabled_industries: ['content'],
      notification_channels: ['in_app'],
      external_publish_requires_confirmation: true,
    }
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input)
      if (url.endsWith('/settings') && init?.method === 'PATCH') return jsonResponse({ ...settings, enabled_industries: [], version: 2 })
      if (url.endsWith('/settings')) return jsonResponse(settings)
      if (url.endsWith('/connectors')) return jsonResponse([])
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter><SettingsPage /></MemoryRouter>)

    const content = await screen.findByRole('checkbox', { name: /内容生产部/ })
    fireEvent.click(content)
    expect(screen.getByText('当前未启用任何行业；保存后将阻止创建所有新任务与计划。')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '保存设置' }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([input, init]) => String(input).endsWith('/settings') && init?.method === 'PATCH')).toBe(true))
    const request = fetchMock.mock.calls.find(([input, init]) => String(input).endsWith('/settings') && init?.method === 'PATCH')
    expect(JSON.parse(String(request?.[1]?.body))).toMatchObject({ enabled_industries: [] })
  })
})
