import { CalendarDays, Crosshair, Eye, FileImage, Megaphone, Radio, Rocket, Scissors, TrendingUp } from 'lucide-react'
import { Link } from 'react-router-dom'
import { InlineNotice, PageHeader, SectionTitle } from '../components/ui'
import { marketingTools } from '../data/catalog'

const icons = [TrendingUp, CalendarDays, Eye, Rocket, Crosshair, FileImage, Megaphone, Scissors]

export default function MarketingPage() {
  return <>
    <PageHeader eyebrow="营销部 · GROWTH TOOLKIT" title="把增长动作变成可追溯任务。" description="八个工具都是预填 Brief 模板：创建后进入统一任务账本、遵循行业 Gate，并按真实模型/工具/存储成本记录，不采用静态点价。" crumbs={<><Link to="/app">集团楼层</Link> / <b>营销部</b></>} actions={<Link className="btn btn-gold" to="/tasks/new?industry=marketing">＋ 自定义营销任务</Link>} />
    <InlineNotice tone="warning" title="连接器安全边界">工具可以先生成内部草稿和行动清单；联网、视频或渠道写入节点若未配置，会以“未配置”停止并要求人工处理，不会伪造完成。</InlineNotice>
    <SectionTitle index="具" title="8 个任务模板" />
    <div className="grid-tool">{marketingTools.map((tool, index) => { const Icon = icons[index]; const connectorRequired = ['lead-radar', 'video-remix'].includes(tool.id); return <article className={`tool ${connectorRequired ? 'safe-disabled' : ''}`} key={tool.id}><div className="t-ic"><Icon size={23} aria-hidden="true" /></div><h4>{tool.name}</h4><p>{tool.description}</p><div className="t-foot"><span className="cost">{tool.cost}</span><Link className="go" to={`/tasks/new?template=${tool.id}`}>填写 Brief →</Link></div>{connectorRequired ? <div className="field-help">后续节点需要连接器；未配置时安全停止。</div> : null}</article>})}</div>
    <SectionTitle index="约" title="订阅式自动化" />
    <div className="split"><section className="panel"><h3><CalendarDays size={17} /> 到点创建真实任务</h3><p>每天扫描、每周周报或 T+1/3/7 复盘都由调度器创建带幂等键和来源的任务。任务失败会留在账本，不在后台静默丢失。</p><Link className="btn btn-line" style={{ marginTop: 16 }} to="/schedules">管理定时规则</Link></section><section className="panel" style={{ borderLeft: '3px solid var(--gold)' }}><h3><Radio size={17} /> 行业联动</h3><p>模板会挂载所选行业的 WorkflowDefinition 与政策包；内容门禁、医疗高风险锁定和传统文化表述边界仍照常生效。</p></section></div>
  </>
}
