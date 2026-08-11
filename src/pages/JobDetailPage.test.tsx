import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { Job } from '../types'
import { jsonResponse } from '../test/helpers'
import JobDetailPage from './JobDetailPage'

vi.mock('../hooks/useJobEvents', () => ({ useJobEvents: () => undefined }))

const medicalBlockedJob: Job = {
  id: 'medical-job-1',
  display_id: 'M-42',
  title: '家用制氧机宣传稿',
  brief: '检查适用范围与疗效表述',
  industry: 'medical',
  workflow_id: 'medical-v1',
  workflow_name: '医疗合规工作流',
  approval_mode: 'key',
  status: 'gate_blocked',
  version: 3,
  stage_runs: [{ id: 'gate-stage', node_id: 'med-gate', name: '医疗门禁', status: 'awaiting_review', version: 2 }],
  artifacts: [{ id: 'artifact-1', name: '宣传稿候选版', version: 2, summary: '包含待修正的绝对化疗效宣称。' }],
  latest_gate: {
    id: 'gate-1',
    artifact_id: 'artifact-1',
    status: 'blocked',
    findings: [{ id: 'finding-1', category: '绝对化疗效', level: 'high', message: '“治愈率 100%”没有有效注册依据。', overridable: true }],
  },
  reviews: [],
  audit_events: [],
  created_at: '2026-08-02T00:00:00Z',
  updated_at: '2026-08-02T00:01:00Z',
}

describe('医疗高风险工单门禁', () => {
  it('即使响应误标可 override，仍锁死继续按钮，只允许修改后重新质检', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input)
      if (url.endsWith('/jobs/medical-job-1') && (!init?.method || init.method === 'GET')) return jsonResponse(medicalBlockedJob)
      if (url.endsWith('/artifacts/artifact-1/versions') && init?.method === 'POST') return jsonResponse({ id: 'version-3' })
      if (url.endsWith('/artifacts/artifact-1/compliance-evaluations') && init?.method === 'POST') return jsonResponse({ id: 'evaluation-2' })
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter initialEntries={['/jobs/medical-job-1']}>
        <Routes><Route path="/jobs/:id" element={<JobDetailPage />} /></Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: '#M-42 家用制氧机宣传稿' })).toBeInTheDocument()
    expect(screen.getByText('质检拦截')).toHaveClass('b-stop')
    expect(screen.getByText('高')).toHaveClass('finding-level', 'high')

    const override = screen.getByRole('button', { name: '知晓风险，继续' })
    expect(override).toBeDisabled()
    expect(override).toHaveAttribute('title', '医疗高风险问题只能改稿、补证后重新质检')
    expect(screen.getByText('服务端锁定：医疗高风险不可 override')).toBeInTheDocument()

    fireEvent.click(override)
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0)

    const revision = screen.getByLabelText('删改/补证后的新版本内容')
    fireEvent.change(revision, { target: { value: '已删除绝对化疗效表述，并补充注册证来源。' } })
    const recheck = screen.getByRole('button', { name: '保存新版本并重新质检' })
    expect(recheck).toBeEnabled()
    fireEvent.click(recheck)
    await waitFor(() => expect(fetchMock.mock.calls.some(([input, init]) => String(input).endsWith('/artifacts/artifact-1/versions') && init?.method === 'POST')).toBe(true))
    const versionRequest = fetchMock.mock.calls.find(([input, init]) => String(input).endsWith('/artifacts/artifact-1/versions') && init?.method === 'POST')
    const versionBody = JSON.parse(String(versionRequest?.[1]?.body))
    expect(versionBody.payload.payload.draft).toBe('已删除绝对化疗效表述，并补充注册证来源。')
    await waitFor(() => expect(fetchMock.mock.calls.some(([input, init]) => String(input).endsWith('/artifacts/artifact-1/compliance-evaluations') && init?.method === 'POST')).toBe(true))
  })

  it('医疗门禁通过但尚未专家签发时仍禁止创建交付', async () => {
    const unsignedJob: Job = {
      ...medicalBlockedJob,
      status: 'awaiting_review',
      latest_gate: { id: 'gate-passed', artifact_id: 'artifact-1', status: 'passed', findings: [], attestation_id: 'attestation-1', attestation_valid: true, signed_by: null },
      gate_attestations: [{ id: 'attestation-1', gate_id: 'gate-passed', artifact_id: 'artifact-1', valid: true, signed_by: null }],
      stage_runs: [{ id: 'expert-stage', node_id: 'expert-sign', name: '法规专家签发', kind: 'expert_review', status: 'awaiting_review', version: 1 }],
      reviews: [{ id: 'review-1', stage_run_id: 'expert-stage', status: 'pending', version: 1 }],
    }
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => jsonResponse(unsignedJob)))

    render(
      <MemoryRouter initialEntries={['/jobs/medical-job-1']}>
        <Routes><Route path="/jobs/:id" element={<JobDetailPage />} /></Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('button', { name: '创建本地交付' })).toBeDisabled()
    expect(screen.getByText('任务尚未完成或最终审批仍待处理，不能提前创建交付')).toBeInTheDocument()
    const sign = screen.getByRole('button', { name: '专家签发' })
    expect(sign).toBeDisabled()
    fireEvent.change(screen.getByLabelText('审批意见或退回依据'), { target: { value: '已核对注册证和说明书依据。' } })
    expect(sign).toBeEnabled()
  })

  it('使用 Attestation 明确绑定的产物创建交付，而不是数组最后一个产物', async () => {
    const deliverableJob: Job = {
      ...medicalBlockedJob,
      industry: 'content',
      status: 'done',
      artifacts: [
        { id: 'artifact-bound', name: '已通过门禁的交付稿', checksum: 'checksum-bound', version: 2 },
        { id: 'artifact-later', name: '较晚生成但未绑定的附件', checksum: 'checksum-later', version: 1 },
      ],
      latest_gate: { id: 'gate-passed', artifact_id: 'artifact-bound', status: 'passed', findings: [], attestation_id: 'attestation-bound', attestation_valid: true },
      gate_attestations: [{ id: 'attestation-bound', gate_id: 'gate-passed', artifact_id: 'artifact-bound', artifact_checksum: 'checksum-bound', valid: true }],
    }
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input)
      if (url.endsWith('/jobs/medical-job-1') && (!init?.method || init.method === 'GET')) return jsonResponse(deliverableJob)
      if (url.endsWith('/deliveries') && init?.method === 'POST') return jsonResponse({ id: 'delivery-1' }, 201)
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(
      <MemoryRouter initialEntries={['/jobs/medical-job-1']}>
        <Routes><Route path="/jobs/:id" element={<JobDetailPage />} /></Routes>
      </MemoryRouter>,
    )

    const deliveryButton = await screen.findByRole('button', { name: '创建本地交付' })
    expect(deliveryButton).toBeEnabled()
    fireEvent.click(deliveryButton)

    await waitFor(() => expect(fetchMock.mock.calls.some(([input, init]) => String(input).endsWith('/deliveries') && init?.method === 'POST')).toBe(true))
    const deliveryRequest = fetchMock.mock.calls.find(([input, init]) => String(input).endsWith('/deliveries') && init?.method === 'POST')
    expect(JSON.parse(String(deliveryRequest?.[1]?.body))).toMatchObject({
      artifact_id: 'artifact-bound',
      gate_attestation_id: 'attestation-bound',
    })
  })

  it('证明已过期时在客户端预先禁用交付并说明处理方式', async () => {
    const expiredJob: Job = {
      ...medicalBlockedJob,
      industry: 'content',
      status: 'done',
      artifacts: [{ id: 'artifact-expired', name: '过期证明绑定稿', checksum: 'checksum-expired', version: 1 }],
      latest_gate: { id: 'gate-expired', artifact_id: 'artifact-expired', status: 'passed', findings: [], attestation_id: 'attestation-expired', attestation_valid: true },
      gate_attestations: [{ id: 'attestation-expired', gate_id: 'gate-expired', artifact_id: 'artifact-expired', artifact_checksum: 'checksum-expired', valid: true, expires_at: '2020-01-01T00:00:00Z' }],
    }
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => jsonResponse(expiredJob)))

    render(
      <MemoryRouter initialEntries={['/jobs/medical-job-1']}>
        <Routes><Route path="/jobs/:id" element={<JobDetailPage />} /></Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('button', { name: '创建本地交付' })).toBeDisabled()
    expect(screen.getByText('GateAttestation 已过期，需对当前产物重新质检后再交付')).toBeInTheDocument()
  })

  it('交付失败重试复用幂等键，成功后再次交付会轮换', async () => {
    const deliverableJob: Job = {
      ...medicalBlockedJob,
      industry: 'content',
      status: 'done',
      artifacts: [{ id: 'artifact-stable', name: '稳定交付稿', checksum: 'checksum-stable', version: 1 }],
      latest_gate: { id: 'gate-stable', artifact_id: 'artifact-stable', status: 'passed', findings: [], attestation_id: 'attestation-stable', attestation_valid: true },
      gate_attestations: [{ id: 'attestation-stable', gate_id: 'gate-stable', artifact_id: 'artifact-stable', artifact_checksum: 'checksum-stable', valid: true, expires_at: '2030-01-01T00:00:00Z' }],
    }
    let deliveryPosts = 0
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input)
      if (url.endsWith('/jobs/medical-job-1') && (!init?.method || init.method === 'GET')) return jsonResponse(deliverableJob)
      if (url.endsWith('/deliveries') && init?.method === 'POST') {
        deliveryPosts += 1
        if (deliveryPosts === 1) return new Response(JSON.stringify({ error: { code: 'TEMPORARY_FAILURE', message: '交付响应暂不可用' } }), { status: 503, headers: { 'Content-Type': 'application/json' } })
        return jsonResponse({ id: `delivery-${deliveryPosts}` }, 201)
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(
      <MemoryRouter initialEntries={['/jobs/medical-job-1']}>
        <Routes><Route path="/jobs/:id" element={<JobDetailPage />} /></Routes>
      </MemoryRouter>,
    )

    const button = await screen.findByRole('button', { name: '创建本地交付' })
    fireEvent.click(button)
    expect(await screen.findByText('交付响应暂不可用')).toBeInTheDocument()
    fireEvent.click(button)
    await waitFor(() => expect(deliveryPosts).toBe(2))
    fireEvent.click(button)
    await waitFor(() => expect(deliveryPosts).toBe(3))

    const keys = fetchMock.mock.calls
      .filter(([input, init]) => String(input).endsWith('/deliveries') && init?.method === 'POST')
      .map(([, init]) => new Headers(init?.headers).get('Idempotency-Key'))
    expect(keys[1]).toBe(keys[0])
    expect(keys[2]).not.toBe(keys[0])
  })
})
