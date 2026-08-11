import { Plus, Users } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, ErrorState, IndustryBadge, InlineNotice, LoadingState, PageHeader, PrimaryButton, RelativeTime, StatusBadge } from '../components/ui'
import { industryMeta } from '../data/catalog'
import { useRemote } from '../hooks/useRemote'
import { api, humanError } from '../lib/api'
import type { AgentDefinition, Meeting } from '../types'

type MeetingProposal = NonNullable<Meeting['proposals']>[number]
type MeetingCounterargument = NonNullable<Meeting['counterarguments']>[number]

function mockMeetingContent(meeting: Meeting, agents: AgentDefinition[]) {
  const proposals: MeetingProposal[] = meeting.proposals?.length ? meeting.proposals.slice(0, 3) : agents.slice(0, 3).map((agent, index) => ({
    agent_id: agent.id,
    title: `Mock 候选 ${index + 1} · ${agent.name}`,
    summary: `[Mock] 从“${agent.department}”职责出发，先定义可验证门槛、最小行动和退出条件，再判断是否推进。`,
  }))
  const counterarguments: MeetingCounterargument[] = meeting.counterarguments?.length ? meeting.counterarguments : [{
    agent_id: agents[1]?.id ?? agents[0]?.id,
    risk: 'Mock 反证 · 证据不足',
    summary: `[Mock] “${meeting.question ?? meeting.brief ?? meeting.title}”尚未经过真实专家、来源和外部数据验证，形成结论前需明确风险与缺失信息。`,
  }]
  return { proposals, counterarguments }
}

export default function MeetingsPage() {
  const remote = useRemote(async () => {
    const [meetings, agents] = await Promise.all([api.get<Meeting[]>('/meetings'), api.get<AgentDefinition[]>('/agents?enabled=true')])
    return { meetings, agents }
  }, [])
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [brief, setBrief] = useState('')
  const [industry, setIndustry] = useState('consulting')
  const [members, setMembers] = useState<string[]>([])
  const [conclusionFor, setConclusionFor] = useState<string | null>(null)
  const [decision, setDecision] = useState<'GO' | 'NO_GO' | 'NEED_INFO'>('GO')
  const [rationale, setRationale] = useState('')
  const [createActionJob, setCreateActionJob] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const visibleAgents = useMemo(() => (remote.data?.agents ?? []).filter((agent) => agent.industry === industry || agent.industry === 'content'), [remote.data?.agents, industry])

  async function createMeeting(event: FormEvent) {
    event.preventDefault()
    if (members.length < 2 || members.length > 6) { setError('结果型会议必须选择 2–6 位成员。'); return }
    setBusy(true); setError(null)
    try { await api.post('/meetings', { title, question: brief, industry, agent_ids: members }, true); setShowForm(false); setTitle(''); setBrief(''); setMembers([]); await remote.reload() }
    catch (reason) { setError(humanError(reason)) } finally { setBusy(false) }
  }

  function openConclusion(meeting: Meeting) {
    const currentDecision = meeting.decision && ['GO', 'NO_GO', 'NEED_INFO'].includes(meeting.decision) ? meeting.decision as 'GO' | 'NO_GO' | 'NEED_INFO' : 'GO'
    setConclusionFor(meeting.id)
    setDecision(currentDecision)
    setRationale(meeting.rationale ?? '')
    setCreateActionJob(currentDecision === 'GO')
    setError(null)
  }

  async function conclude(event: FormEvent, meeting: Meeting, meetingIndustry: string) {
    event.preventDefault()
    const trimmedRationale = rationale.trim()
    if (!trimmedRationale) { setError('请填写结论依据、失败风险或缺失信息。'); return }
    setBusy(true); setError(null)
    try { await api.post(`/meetings/${meeting.id}/conclude`, { decision, rationale: trimmedRationale, expected_version: meeting.version ?? 1, action_items: decision === 'GO' && createActionJob ? [{ title: `${meeting.title} · 行动任务`, brief: trimmedRationale, industry: meetingIndustry, create_job: true }] : [] }); setConclusionFor(null); setRationale(''); await remote.reload() }
    catch (reason) { setError(humanError(reason)) } finally { setBusy(false) }
  }

  return <>
    <PageHeader eyebrow="受控多 Agent 协作 · MEETINGS" title="AI 结果型会议室" description="2–6 位 Agent 分别提案，最多保留 3 个候选并反证，最终必须收敛为 GO、NO-GO 或 NEED INFO 与责任任务。" actions={<button className="btn btn-gold" onClick={() => setShowForm((value) => !value)}><Plus size={15} />发起会议</button>} />
    <InlineNotice tone="warning" title="不冒充真人专家">会议提案来自当前 Mock/模型策略，只是候选建议；“专家签发”必须由有权限的真人完成。</InlineNotice>
    {showForm ? <form className="panel form-panel" onSubmit={createMeeting} style={{ marginTop: 20 }}>
      <div className="form-grid"><div className="field-group"><label htmlFor="meeting-title">会议目标</label><input id="meeting-title" className="field" required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：首个短剧 MVP 应选哪一题材" /></div><div className="field-group"><label htmlFor="meeting-industry">行业</label><select id="meeting-industry" className="field" value={industry} onChange={(event) => { setIndustry(event.target.value); setMembers([]) }}>{Object.entries(industryMeta).filter(([key]) => !['marketing', 'avatar'].includes(key)).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></div><div className="field-group full"><label htmlFor="meeting-brief">决策背景和成功条件</label><textarea id="meeting-brief" className="field" required value={brief} onChange={(event) => setBrief(event.target.value)} /></div><fieldset className="field-group full"><legend className="field-label">选择成员（{members.length}/6）</legend><div className="checkbox-grid">{visibleAgents.map((agent) => <label className={`choice-card ${!members.includes(agent.id) && members.length >= 6 ? 'disabled' : ''}`} key={agent.id}><input type="checkbox" checked={members.includes(agent.id)} disabled={!members.includes(agent.id) && members.length >= 6} onChange={() => setMembers((current) => current.includes(agent.id) ? current.filter((id) => id !== agent.id) : [...current, agent.id])} /><span><b>{agent.name}</b><span>{agent.department}</span></span></label>)}</div></fieldset></div>
      {error ? <div style={{ marginTop: 16 }}><InlineNotice tone="danger" title="无法发起会议">{error}</InlineNotice></div> : null}<div className="form-actions"><button className="btn btn-line" type="button" onClick={() => setShowForm(false)}>取消</button><PrimaryButton busy={busy} type="submit">创建并生成独立提案</PrimaryButton></div>
    </form> : null}
    {!showForm && error ? <div style={{ marginTop: 18 }}><InlineNotice tone="danger" title="操作失败">{error}</InlineNotice></div> : null}
    <div style={{ marginTop: 22 }}>{remote.loading ? <LoadingState /> : remote.error ? <ErrorState message={remote.error} onRetry={remote.reload} /> : remote.data?.meetings.length ? <div className="meeting-grid">{remote.data.meetings.map((meeting) => { const ids = meeting.agent_ids ?? meeting.member_agent_ids ?? []; const meetingAgents = meeting.members ?? (remote.data?.agents ?? []).filter((agent) => ids.includes(agent.id)); const meetingIndustry = meeting.industry ?? meetingAgents[0]?.industry ?? 'consulting'; const actionJobIds = meeting.action_job_ids ?? meeting.derived_job_ids ?? []; const mockContent = mockMeetingContent(meeting, meetingAgents); return <article className="meeting-card" key={meeting.id}><div className="meeting-card-top"><div><h3>{meeting.title}</h3><div className="job-card-meta"><IndustryBadge industry={meetingIndustry} /><StatusBadge status={meeting.status} /></div></div><Users size={20} className="muted" /></div><p>{meeting.question ?? meeting.brief}</p><div className="meeting-members" aria-label={`${ids.length || meetingAgents.length} 位成员`}>{meetingAgents.slice(0, 6).map((agent) => <span className="meeting-member" key={agent.id} title={agent.name}>{agent.glyph ?? agent.name.slice(0, 1)}</span>)}</div><div className="citation-list" aria-label="Mock 独立提案"><h4>Mock 独立提案</h4>{mockContent.proposals.map((proposal, index) => <div className="citation" key={`${proposal.agent_id ?? 'proposal'}-${index}`}><b>{proposal.title ?? `候选 ${index + 1}`}</b><div>{proposal.summary ?? '当前 Mock 提案未提供摘要。'}</div>{proposal.evidence?.length ? <small>依据：{proposal.evidence.join(' · ')}</small> : null}</div>)}</div><div className="citation-list" aria-label="Mock 反证"><h4>Mock 反证</h4>{mockContent.counterarguments.map((counterargument, index) => <div className="citation" key={`${counterargument.agent_id ?? 'counterargument'}-${index}`}><b>{counterargument.title ?? counterargument.risk ?? `反证 ${index + 1}`}</b><div>{counterargument.summary ?? counterargument.response ?? '当前 Mock 反证未提供展开说明。'}</div></div>)}</div>{meeting.decision ? <div className="decision">{meeting.decision.replace('_', ' ')}</div> : null}{meeting.rationale ? <p>{meeting.rationale}</p> : null}{conclusionFor === meeting.id && meeting.status !== 'concluded' ? <form className="form-panel" onSubmit={(event) => void conclude(event, meeting, meetingIndustry)} style={{ marginTop: 16 }}><div className="field-group"><label htmlFor={`meeting-decision-${meeting.id}`}>结论</label><select id={`meeting-decision-${meeting.id}`} className="field" value={decision} onChange={(event) => setDecision(event.target.value as 'GO' | 'NO_GO' | 'NEED_INFO')}><option value="GO">GO</option><option value="NO_GO">NO-GO</option><option value="NEED_INFO">NEED INFO</option></select></div><div className="field-group"><label htmlFor={`meeting-rationale-${meeting.id}`}>结论依据、失败风险或缺失信息</label><textarea id={`meeting-rationale-${meeting.id}`} className="field" required value={rationale} onChange={(event) => setRationale(event.target.value)} /></div>{decision === 'GO' ? <label className="choice-card"><input type="checkbox" checked={createActionJob} onChange={(event) => setCreateActionJob(event.target.checked)} /><span><b>创建可追溯行动任务</b><span>结论保存后创建 source=meeting 的真实 Job。</span></span></label> : null}<div className="form-actions"><button type="button" className="btn btn-line" onClick={() => setConclusionFor(null)}>取消</button><PrimaryButton type="submit" busy={busy}>保存结论</PrimaryButton></div></form> : null}<div className="dc-foot" style={{ marginTop: 14 }}>{meeting.created_at ? <span className="muted"><RelativeTime value={meeting.created_at} /></span> : <span />}{meeting.status !== 'concluded' && conclusionFor !== meeting.id ? <button className="btn btn-line" disabled={busy} onClick={() => openConclusion(meeting)}>形成结论</button> : meeting.status === 'concluded' && actionJobIds.length ? <Link className="btn btn-line" to={`/jobs/${actionJobIds[0]}`}>查看行动任务</Link> : meeting.status === 'concluded' ? <span className="muted">无派生任务</span> : null}</div></article> })}</div> : <EmptyState title="尚未发起结果型会议" description="选择 2–6 位 Agent，围绕一个清晰决策产出候选、反证和责任任务。" />}</div>
  </>
}
