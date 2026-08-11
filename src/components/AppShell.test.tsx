import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { LocationProbe } from '../test/helpers'
import { AppShell } from './AppShell'
import { SessionProvider } from './session'

describe('移动端导航', () => {
  it('可打开、限制焦点、用 Escape 关闭，并在导航后收起', async () => {
    window.localStorage.setItem('qingzhi.session.token.v1', 'mobile-test-token')
    render(
      <MemoryRouter initialEntries={['/app']}>
        <SessionProvider>
          <AppShell><h1>移动导航测试页</h1></AppShell>
          <LocationProbe />
        </SessionProvider>
      </MemoryRouter>,
    )

    const openButton = screen.getByRole('button', { name: '打开导航' })
    expect(openButton).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(openButton)

    const dialog = screen.getByRole('dialog', { name: '移动端导航' })
    const firstLink = within(dialog).getByRole('link', { name: '集团楼层' })
    const dialogControls = Array.from(dialog.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'))
    expect(openButton).toHaveAttribute('aria-expanded', 'true')
    expect(document.body).toHaveStyle({ overflow: 'hidden' })
    expect(firstLink).toHaveFocus()

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(dialogControls.at(-1)).toHaveFocus()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: '移动端导航' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '打开导航' })).toHaveFocus()
    expect(document.body).not.toHaveStyle({ overflow: 'hidden' })

    fireEvent.click(screen.getByRole('button', { name: '打开导航' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: '移动端导航' })).getByRole('link', { name: '任务中心' }))

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/tasks'))
    expect(screen.queryByRole('dialog', { name: '移动端导航' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '打开导航' }))
    const accountDialog = screen.getByRole('dialog', { name: '移动端导航' })
    expect(within(accountDialog).getByRole('link', { name: '短剧工作台' })).toHaveAttribute('href', '/drama')
    expect(within(accountDialog).getByRole('link', { name: 'AI短剧部门' })).toHaveAttribute('href', '/departments/drama')
    expect(within(accountDialog).getByRole('link', { name: 'Agent 控制面' })).toHaveAttribute('href', '/settings/control-plane')
    expect(within(accountDialog).getByRole('link', { name: '账号与团队' })).toHaveAttribute('href', '/team')
    fireEvent.click(within(accountDialog).getByRole('button', { name: /退出登录/ }))
    expect(window.localStorage.getItem('qingzhi.session.token.v1')).toBeNull()
  })
})
