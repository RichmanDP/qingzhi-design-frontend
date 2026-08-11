import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Bell, ChevronDown, LogOut, Menu, Plus, X } from 'lucide-react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useSession } from './session'

const industries = [
  ['/departments/medical', '医疗器械'], ['/drama', '短剧工作台'], ['/departments/drama', 'AI短剧部门'], ['/departments/consulting', 'AI咨询'], ['/departments/taoism', '传统文化'], ['/departments/culture_legal', '文化法务'],
]
const moreLinks = [
  ['/knowledge', '知识库'], ['/assets', '资产库'], ['/schedules', '定时任务'], ['/notifications', '通知'], ['/team', '团队权限'], ['/settings', '设置与连接器'], ['/settings/control-plane', 'Agent 控制面'], ['/channels', '渠道与交付'], ['/billing', '成本账本'], ['/admin', '运维审计'],
]

function MenuPopover({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const close = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  return <div className="nav-popover" ref={ref}>
    <button className="nav-popover-trigger" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{label}<ChevronDown size={13} /></button>
    {open ? <div className="nav-popover-menu" onClick={() => setOpen(false)}>{children}</div> : null}
  </div>
}

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const mobilePanelRef = useRef<HTMLDivElement>(null)
  const mobileButtonRef = useRef<HTMLButtonElement>(null)
  const { pathname } = useLocation()
  const { userLabel, signOut } = useSession()
  useEffect(() => setMobileOpen(false), [pathname])
  useEffect(() => {
    if (!mobileOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusables = () => Array.from(mobilePanelRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? [])
    focusables()[0]?.focus()
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setMobileOpen(false); mobileButtonRef.current?.focus(); return }
      if (event.key !== 'Tab') return
      const elements = focusables()
      if (!elements.length) return
      const first = elements[0]
      const last = elements[elements.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', handleKey)
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', handleKey) }
  }, [mobileOpen])
  return <div className="app-shell">
    <nav className="nav app-nav"><div className="nav-in app-nav-in">
      <Link className="brand" to="/app"><b>擎智集团</b><span>QINGZHI</span></Link>
      <div className="nav-links app-nav-links">
        <NavLink to="/app">集团楼层</NavLink>
        <NavLink to="/tasks">任务中心</NavLink>
        <NavLink to="/meetings">会议室</NavLink>
        <NavLink to="/departments/content">内容生产</NavLink>
        <MenuPopover label="产业部门">
          {industries.map(([to, label]) => <NavLink key={to} to={to}>{label}</NavLink>)}
        </MenuPopover>
        <NavLink to="/avatar">数字人</NavLink>
        <MenuPopover label="更多">
          {moreLinks.map(([to, label]) => <NavLink key={to} to={to}>{label}</NavLink>)}
        </MenuPopover>
      </div>
      <div className="nav-cta app-nav-actions">
        <NavLink className="icon-button" to="/notifications" aria-label="通知"><Bell size={17} /></NavLink>
        <Link className="btn btn-gold nav-new-task" to="/tasks/new"><Plus size={15} />派一个活</Link>
        <MenuPopover label={userLabel}>
          <Link to="/team">账号与团队</Link>
          <button onClick={signOut}><LogOut size={14} />退出登录</button>
        </MenuPopover>
        <button ref={mobileButtonRef} className="mobile-menu-button" aria-label={mobileOpen ? '关闭导航' : '打开导航'} aria-expanded={mobileOpen} aria-controls="mobile-navigation" onClick={() => setMobileOpen((value) => !value)}>{mobileOpen ? <X /> : <Menu />}</button>
      </div>
    </div>
      {mobileOpen ? <div className="mobile-nav-panel" id="mobile-navigation" ref={mobilePanelRef} role="dialog" aria-label="移动端导航" aria-modal="true">
        <NavLink to="/app">集团楼层</NavLink><NavLink to="/tasks">任务中心</NavLink><NavLink to="/tasks/new">下达任务</NavLink><NavLink to="/meetings">会议室</NavLink><NavLink to="/departments/content">内容生产</NavLink>
        <div className="mobile-nav-label">产业部门</div>{industries.map(([to, label]) => <NavLink key={to} to={to}>{label}</NavLink>)}
        <NavLink to="/avatar">数字人</NavLink><NavLink to="/marketing">营销工具</NavLink>
        <div className="mobile-nav-label">管理</div>{moreLinks.map(([to, label]) => <NavLink key={to} to={to}>{label}</NavLink>)}
        <div className="mobile-nav-label">账号 · {userLabel}</div><NavLink to="/team">账号与团队</NavLink><button className="mobile-signout" onClick={signOut}><LogOut size={14} />退出登录</button>
      </div> : null}
    </nav>
    <main className="wrap app-main">{children}</main>
    <footer><div className="foot-in"><div><b>擎智集团 QINGZHI</b><br />本地全栈候选版 · 结构化产物与安全门禁</div><div>内容生产 · 医疗器械 · AI短剧 · AI咨询 · 传统文化 · 数字人 · 文化法务</div><div>真实外发、付费模型与高风险签发默认关闭</div></div></footer>
  </div>
}
