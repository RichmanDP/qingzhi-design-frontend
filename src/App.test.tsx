import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import App from './App'
import { jsonResponse, LocationProbe } from './test/helpers'

describe('认证路由', () => {
  it('将未登录用户送到登录页，并在登录后返回原受保护地址', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input)
      if (url.endsWith('/auth/login')) return jsonResponse({ access_token: 'local-test-token' })
      if (url.endsWith('/jobs')) return jsonResponse([])
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter initialEntries={['/tasks?status=failed']}>
        <App />
        <LocationProbe />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: '进入集团' })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/login')

    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'developer@example.test' } })
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'test-password' } })
    fireEvent.click(screen.getByRole('button', { name: '登录并连接 API' }))

    expect(await screen.findByRole('heading', { name: '任务中心' })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/tasks?status=failed')
    expect(window.localStorage.getItem('qingzhi.session.token.v1')).toBe('local-test-token')

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const jobsCall = fetchMock.mock.calls.find(([input]) => String(input).endsWith('/jobs'))
    expect(jobsCall).toBeDefined()
    expect(new Headers(jobsCall?.[1]?.headers).get('Authorization')).toBe('Bearer local-test-token')
  })

  it('让已登录用户从 /drama 直接进入短剧工作台而不是部门重定向', async () => {
    window.localStorage.setItem('qingzhi.session.token.v1', 'drama-route-token')
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input) => {
      const url = String(input)
      if (url.endsWith('/workflows?industry=drama')) return jsonResponse([])
      if (url.endsWith('/jobs?industry=drama')) return jsonResponse([])
      if (url.endsWith('/generation-runs')) return jsonResponse([])
      if (url.endsWith('/cc-switch/discover')) return jsonResponse({
        status: 'needs_user_setup', base_url: 'http://127.0.0.1:15721',
        health: { status: 'healthy' }, models: [], catalog_fingerprint: null,
      })
      throw new Error(`Unexpected request: ${url}`)
    }))

    render(
      <MemoryRouter initialEntries={['/drama']}>
        <App />
        <LocationProbe />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: '短剧工作台' })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/drama')
    for (const link of screen.getAllByRole('link', { name: /创建短剧任务/ })) expect(link).toHaveAttribute('href', '/tasks/new?industry=drama')
  })

  it('让已登录用户从 /settings/control-plane 进入版本治理页面', async () => {
    window.localStorage.setItem('qingzhi.session.token.v1', 'control-plane-route-token')
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input) => {
      const url = String(input)
      if (url.endsWith('/prompt-versions') || url.endsWith('/skill-versions') || url.endsWith('/agent-configs') || url.endsWith('/model-profiles')) return jsonResponse([])
      throw new Error(`Unexpected request: ${url}`)
    }))

    render(
      <MemoryRouter initialEntries={['/settings/control-plane']}>
        <App />
        <LocationProbe />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'Agent 控制面' })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/settings/control-plane')
    expect(screen.getByRole('heading', { name: '还没有 AgentRevision' })).toBeInTheDocument()
  })
})
