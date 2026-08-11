import {
  Download,
  FileJson2,
  FileUp,
  KeyRound,
  LockKeyhole,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
} from 'lucide-react'
import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '../components/toast'
import { EmptyState, ErrorState, InlineNotice, LoadingState, PageHeader, PrimaryButton, RelativeTime, SectionTitle, StatusBadge } from '../components/ui'
import { useRemote } from '../hooks/useRemote'
import { ApiError, api } from '../lib/api'
import type {
  AgentBinding,
  AgentRevision,
  AgentSampleRunResult,
  ControlPlaneContentFormat,
  ModelProfile,
  ModelProtocol,
  ModelSurface,
  PromptVersion,
  SkillVersion,
} from '../types'
import './ControlPlanePage.css'

type ControlTab = 'agents' | 'prompts' | 'skills' | 'models'
type VersionKind = 'prompt' | 'skill'
type ContentVersion = PromptVersion | SkillVersion
type ModelSetupMode = 'kimi_code_cn' | 'kimi_platform_cn' | 'advanced'

interface ControlPlaneData {
  prompts: PromptVersion[]
  skills: SkillVersion[]
  agents: AgentRevision[]
  models: ModelProfile[]
}

interface VersionCreatePayload {
  expected_version: 0
  name: string
  content_format: ControlPlaneContentFormat
  content: string | Record<string, unknown>
  prompt_key?: string
  skill_key?: string
}

interface AgentCreatePayload {
  expected_version: 0
  agent_key: string
  name: string
  description: string
  content: Record<string, unknown>
  binding: Omit<AgentBinding, 'id' | 'agent_revision_id' | 'params_hash' | 'created_at'>
}

const resourceKeyPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/
const fingerprintPattern = /^[0-9a-f]{64}$/
const secretRefPattern = /^(keychain|env|cc-switch):\/\/[^\s]+$/
const executableModelSurfaces = new Set<ModelSurface>(['cc_switch', 'direct_api'])
const modelPresets = {
  kimi_code_cn: {
    name: 'Kimi Code（国内）',
    baseUrl: 'https://api.kimi.com/coding/v1',
    modelIds: ['k3', 'k3-256k', 'kimi-for-coding', 'kimi-for-coding-highspeed'],
    defaultModelId: 'k3',
  },
  kimi_platform_cn: {
    name: 'Kimi 开放平台（国内）',
    baseUrl: 'https://api.moonshot.cn/v1',
    modelIds: [] as string[],
    defaultModelId: 'kimi-k2.5',
  },
} as const

const emptyAgentBinding = {
  model_profile_id: '',
  prompt_version_id: '',
  skill_version_ids: [] as string[],
  tool_allowlist: [] as string[],
  output_schema: {} as Record<string, unknown>,
  params: {} as Record<string, unknown>,
}

function safeOperationError(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    const marker = error.code && /^[A-Z0-9_:-]{1,80}$/.test(error.code)
      ? error.code
      : error.status > 0 ? `HTTP_${error.status}` : 'NETWORK_ERROR'
    return `${fallback}（${marker}）。为避免泄露配置值，服务端错误正文未显示。`
  }
  return `${fallback}。为避免泄露配置值，错误正文未显示。`
}

function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2)
}

function parseObject(value: string, label: string): Record<string, unknown> {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error(`${label}必须是合法 JSON。`)
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error(`${label}必须是 JSON object。`)
  return parsed as Record<string, unknown>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && !Array.isArray(value) && typeof value === 'object'
}

function hasOwn(value: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && fingerprintPattern.test(value)
}

function validateSampleRunResult(value: unknown, revision: AgentRevision, modelProfile?: ModelProfile): AgentSampleRunResult {
  const binding = revision.binding
  if (!binding || !isRecord(value) || !isRecord(value.receipt)) {
    throw new Error('样例回执缺少固定 binding 或不可变 receipt，已拒绝展示。')
  }
  const receipt = value.receipt
  const status = value.status
  const statuses = new Set(['unconfigured', 'succeeded', 'failed', 'unknown'])
  const protocols = new Set(['openai', 'openai_responses', 'openai_chat_completions', 'anthropic_messages', 'cli'])
  const topStrings = ['reason', 'agent_revision_id', 'content_hash', 'params_hash', 'sample_input_hash']
  const receiptStrings = [
    'id', 'receipt_hash', 'request_id', 'request_hash', 'agent_revision_id', 'model_profile_id',
    'prompt_version_id', 'sample_input_hash', 'model_id', 'protocol', 'compiled_prompt_hash',
    'output_schema_hash', 'params_hash', 'created_at',
  ]
  const hashes = [
    value.content_hash, value.params_hash, value.sample_input_hash, receipt.receipt_hash, receipt.request_hash,
    receipt.sample_input_hash, receipt.compiled_prompt_hash, receipt.output_schema_hash, receipt.params_hash,
  ]
  const commonValid = statuses.has(String(status))
    && receipt.status === (status === 'unknown' ? 'failed' : status)
    && typeof value.configuration_valid === 'boolean'
    && typeof value.provider_invoked === 'boolean'
    && receipt.provider_invoked === value.provider_invoked
    && topStrings.every((key) => isNonEmptyString(value[key]))
    && receiptStrings.every((key) => isNonEmptyString(receipt[key]))
    && hashes.every(isSha256)
    && protocols.has(String(receipt.protocol))
    && (receipt.catalog_fingerprint === null || isSha256(receipt.catalog_fingerprint))
    && (receipt.response_id === null || isNonEmptyString(receipt.response_id))
    && (receipt.raw_response_sha256 === null || isSha256(receipt.raw_response_sha256))
    && (receipt.error === null || isRecord(receipt.error))
    && receipt.integrity_verified === true
    && value.agent_revision_id === revision.id
    && receipt.agent_revision_id === revision.id
    && value.content_hash === revision.content_hash
    && receipt.sample_input_hash === value.sample_input_hash
    && value.params_hash === binding.params_hash
    && receipt.params_hash === binding.params_hash
    && receipt.model_profile_id === binding.model_profile_id
    && receipt.prompt_version_id === binding.prompt_version_id
  if (!commonValid) throw new Error('样例回执状态、哈希或固定 binding 不符合 fail-closed 契约，已拒绝展示。')

  const hasOutput = hasOwn(value, 'output')
  if (status === 'succeeded') {
    if (
      value.configuration_valid !== true
      || value.provider_invoked !== true
      || !hasOutput
      || value.output === null
      || receipt.error !== null
      || receipt.catalog_fingerprint === null
      || receipt.response_id === null
      || receipt.raw_response_sha256 === null
      || !modelProfile
      || !['cc_switch', 'direct_api'].includes(modelProfile.surface)
      || modelProfile.status !== 'ready'
      || modelProfile.model_id !== receipt.model_id
      || modelProfile.protocol !== receipt.protocol
      || modelProfile.catalog_fingerprint !== receipt.catalog_fingerprint
    ) throw new Error('成功回执缺少真实调用证据或 output，已拒绝展示。')
  } else if (status === 'unconfigured') {
    if (
      value.provider_invoked !== false
      || hasOutput
      || receipt.response_id !== null
      || receipt.raw_response_sha256 !== null
      || !isRecord(receipt.error)
    ) throw new Error('未配置回执声称调用 provider 或携带 output，已拒绝展示。')
  } else if (status === 'failed') {
    if (hasOutput || !isRecord(receipt.error)) throw new Error('失败回执不得携带 output，且必须提供结构化错误，已拒绝展示。')
    if (value.provider_invoked === false && (receipt.response_id !== null || receipt.raw_response_sha256 !== null)) {
      throw new Error('未调用 provider 的失败回执不得携带响应证据，已拒绝展示。')
    }
  } else if (status === 'unknown') {
    if (
      value.provider_invoked !== true
      || value.automatic_retry_permitted !== false
      || hasOutput
      || !isRecord(receipt.error)
      || receipt.status !== 'failed'
    ) throw new Error('结果未知的调用必须禁止自动重试，并保留真实失败回执。')
  }
  return value as unknown as AgentSampleRunResult
}

function localDownload(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function contentText(content: string | Record<string, unknown>) {
  return typeof content === 'string' ? content : formatJson(content)
}

function shortHash(value?: string | null) {
  return value ? `${value.slice(0, 12)}…${value.slice(-6)}` : '—'
}

function versionKey(row: ContentVersion) {
  return 'prompt_key' in row ? row.prompt_key : row.skill_key
}

function exportContentVersion(kind: VersionKind, row: ContentVersion) {
  const key = versionKey(row)
  if (row.content_format === 'markdown' && typeof row.content === 'string') {
    localDownload(`${key}.r${row.revision_number}.md`, row.content, 'text/markdown;charset=utf-8')
    return
  }
  const payload = {
    schema: `qingzhi.control-plane.${kind}-version/v1`,
    [kind === 'prompt' ? 'prompt_key' : 'skill_key']: key,
    name: row.name,
    content_format: row.content_format,
    content: row.content,
  }
  localDownload(`${key}.r${row.revision_number}.json`, formatJson(payload), 'application/json;charset=utf-8')
}

function exportAgent(row: AgentRevision) {
  const binding = row.binding
  const payload = {
    schema: 'qingzhi.control-plane.agent-revision/v1',
    agent_key: row.agent_key,
    name: row.name,
    description: row.description,
    content: row.content,
    binding: binding ? {
      model_profile_id: binding.model_profile_id,
      prompt_version_id: binding.prompt_version_id,
      skill_version_ids: binding.skill_version_ids,
      tool_allowlist: binding.tool_allowlist,
      output_schema: binding.output_schema,
      params: binding.params,
    } : null,
  }
  localDownload(`${row.agent_key}.r${row.revision_number}.json`, formatJson(payload), 'application/json;charset=utf-8')
}

function exportModel(row: ModelProfile) {
  const payload = {
    schema: 'qingzhi.control-plane.model-profile/v1',
    name: row.name,
    surface: row.surface,
    protocol: row.protocol,
    base_url: row.base_url,
    model_id: row.model_id,
    catalog_fingerprint: row.catalog_fingerprint,
    secret_ref_configured: row.secret_ref_configured,
  }
  localDownload(`${row.name.replace(/[^A-Za-z0-9._-]+/g, '-')}.json`, formatJson(payload), 'application/json;charset=utf-8')
}

function VersionEditor({
  kind,
  seed,
  busy,
  onCancel,
  onCreate,
}: {
  kind: VersionKind
  seed?: ContentVersion | null
  busy: boolean
  onCancel: () => void
  onCreate: (payload: VersionCreatePayload) => Promise<void>
}) {
  const keyName = kind === 'prompt' ? 'Prompt key' : 'Skill key'
  const keyField = kind === 'prompt' ? 'prompt_key' : 'skill_key'
  const [keyValue, setKeyValue] = useState(seed ? versionKey(seed) : '')
  const [name, setName] = useState(seed?.name ?? '')
  const [format, setFormat] = useState<ControlPlaneContentFormat>(seed?.content_format ?? 'json')
  const [content, setContent] = useState(seed ? contentText(seed.content) : '{\n  \n}')
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError(null)
    try {
      const raw = await file.text()
      const markdown = /\.(md|markdown)$/i.test(file.name)
      if (markdown) {
        setFormat('markdown')
        setContent(raw)
        if (!name) setName(file.name.replace(/\.(md|markdown)$/i, ''))
        setPreview(raw)
        return
      }
      const parsed = JSON.parse(raw) as unknown
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('JSON 顶层必须是 object。')
      const object = parsed as Record<string, unknown>
      const importedContent = 'content' in object ? object.content : object
      const importedFormat = object.content_format
      if (typeof object[keyField] === 'string') setKeyValue(object[keyField] as string)
      if (typeof object.name === 'string') setName(object.name)
      if (importedFormat === 'json' || importedFormat === 'markdown' || importedFormat === 'text') setFormat(importedFormat)
      else setFormat('json')
      setContent(typeof importedContent === 'string' ? importedContent : formatJson(importedContent))
      setPreview(formatJson({ [keyField]: object[keyField] ?? keyValue, name: object.name ?? name, content_format: importedFormat ?? 'json', content: importedContent }))
    } catch (reason) {
      setPreview(null)
      setError(reason instanceof Error ? reason.message : '无法解析导入文件。')
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!resourceKeyPattern.test(keyValue)) { setError(`${keyName} 只能使用字母、数字、点、下划线、冒号和短横线。`); return }
    try {
      const parsedContent = format === 'json' ? parseObject(content, '内容') : content
      await onCreate({
        expected_version: 0,
        [keyField]: keyValue.trim(),
        name: name.trim(),
        content_format: format,
        content: parsedContent,
      })
    } catch (reason) {
      if (!(reason instanceof ApiError)) setError(reason instanceof Error ? reason.message : '无法创建 revision。')
    }
  }

  return <form className="panel form-panel cp-editor" onSubmit={submit} aria-label={`${kind === 'prompt' ? 'Prompt' : 'Skill'} revision 编辑器`}>
    <div className="cp-editor-heading">
      <div><b>{seed ? `基于 r${seed.revision_number} 创建新 revision` : '创建草稿 revision'}</b><p>保存会 POST 新记录；不存在原地覆盖或 PATCH。</p></div>
      {seed?.status === 'published' ? <StatusBadge status="published" label="来源已发布 · 只读" /> : null}
    </div>
    <div className="form-grid">
      <div className="field-group"><label htmlFor={`${kind}-key`}>{keyName}</label><input id={`${kind}-key`} className="field mono" required maxLength={120} value={keyValue} onChange={(event) => setKeyValue(event.target.value)} /></div>
      <div className="field-group"><label htmlFor={`${kind}-name`}>名称</label><input id={`${kind}-name`} className="field" required maxLength={160} value={name} onChange={(event) => setName(event.target.value)} /></div>
      <div className="field-group"><label htmlFor={`${kind}-format`}>内容格式</label><select id={`${kind}-format`} className="field" value={format} onChange={(event) => setFormat(event.target.value as ControlPlaneContentFormat)}><option value="json">JSON</option><option value="markdown">Markdown</option><option value="text">Text</option></select></div>
      <div className="field-group"><label htmlFor={`${kind}-import`}>本地导入</label><label className="btn btn-line cp-file-button" htmlFor={`${kind}-import`}><FileUp size={14} />选择 JSON / Markdown</label><input className="cp-file-input" id={`${kind}-import`} type="file" accept=".json,.md,.markdown,application/json,text/markdown" onChange={(event) => void importFile(event)} /><div className="field-help">浏览器本地解析并预览；只有点击创建后才请求 QINGZHI 后端。</div></div>
      <div className="field-group full"><label htmlFor={`${kind}-content`}>内容</label><textarea id={`${kind}-content`} className="field mono cp-code-field" required value={content} onChange={(event) => { setContent(event.target.value); setPreview(null) }} /></div>
    </div>
    {preview !== null ? <div className="cp-import-preview" aria-label="导入预览"><b>导入预览 · 尚未发送</b><pre>{preview}</pre></div> : null}
    {error ? <InlineNotice tone="danger" title="无法创建 revision">{error}</InlineNotice> : null}
    <div className="form-actions"><button type="button" className="btn btn-line" onClick={onCancel}>取消</button><PrimaryButton busy={busy} type="submit"><Plus size={14} />创建草稿 revision</PrimaryButton></div>
  </form>
}

function VersionList({
  kind,
  rows,
  busyAction,
  onSeed,
  onPublish,
  onRollback,
}: {
  kind: VersionKind
  rows: ContentVersion[]
  busyAction: string | null
  onSeed: (row: ContentVersion) => void
  onPublish: (row: ContentVersion) => void
  onRollback: (row: ContentVersion) => void
}) {
  if (!rows.length) return <EmptyState title={`还没有 ${kind === 'prompt' ? 'PromptVersion' : 'SkillVersion'}`} description="创建第一个草稿 revision；发布后内容将永久只读。" />
  return <div className="cp-version-list" aria-label={`${kind === 'prompt' ? 'Prompt' : 'Skill'} versions`}>
    {rows.map((row) => <article className="cp-version-card" key={row.id}>
      <header><div><span className="cp-key mono">{versionKey(row)}</span><h3>{row.name}</h3></div><StatusBadge status={row.status} label={row.status === 'published' ? 'published · 只读' : 'draft'} /></header>
      <div className="cp-meta-row"><span>revision r{row.revision_number}</span><span>record v{row.version}</span><span>{row.content_format}</span><span className="mono" title={row.content_hash}>{shortHash(row.content_hash)}</span><RelativeTime value={row.updated_at ?? row.created_at} /></div>
      <details><summary>检查内容</summary><pre>{contentText(row.content)}</pre></details>
      <div className="command-bar">
        <button className="btn btn-line" onClick={() => exportContentVersion(kind, row)}><Download size={14} />本地导出</button>
        <button className="btn btn-line" onClick={() => onSeed(row)}><FileJson2 size={14} />基于此新建 revision</button>
        {row.status === 'draft' ? <button className="btn btn-solid" disabled={busyAction === row.id} onClick={() => onPublish(row)}><Send size={14} />发布</button> : <button className="btn btn-line" disabled={busyAction === row.id} onClick={() => onRollback(row)}><RotateCcw size={14} />回滚为新发布 revision</button>}
      </div>
    </article>)}
  </div>
}

function AgentEditor({
  seed,
  data,
  busy,
  onCancel,
  onCreate,
}: {
  seed?: AgentRevision | null
  data: ControlPlaneData
  busy: boolean
  onCancel: () => void
  onCreate: (payload: AgentCreatePayload) => Promise<void>
}) {
  const binding = seed?.binding
  const [agentKey, setAgentKey] = useState(seed?.agent_key ?? '')
  const [name, setName] = useState(seed?.name ?? '')
  const [description, setDescription] = useState(seed?.description ?? '')
  const [content, setContent] = useState(formatJson(seed?.content ?? {}))
  const [modelProfileId, setModelProfileId] = useState(binding?.model_profile_id ?? '')
  const [promptVersionId, setPromptVersionId] = useState(binding?.prompt_version_id ?? '')
  const [skillVersionIds, setSkillVersionIds] = useState(binding?.skill_version_ids ?? [])
  const [toolAllowlist, setToolAllowlist] = useState((binding?.tool_allowlist ?? []).join('\n'))
  const [outputSchema, setOutputSchema] = useState(formatJson(binding?.output_schema ?? {}))
  const [params, setParams] = useState(formatJson(binding?.params ?? {}))
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function hydrateImported(object: Record<string, unknown>) {
    const importedBinding = object.binding
    if (!importedBinding || Array.isArray(importedBinding) || typeof importedBinding !== 'object') throw new Error('Agent JSON 必须包含 binding object。')
    const nextBinding = importedBinding as Record<string, unknown>
    if (typeof object.agent_key === 'string') setAgentKey(object.agent_key)
    if (typeof object.name === 'string') setName(object.name)
    if (typeof object.description === 'string') setDescription(object.description)
    setContent(formatJson(object.content ?? {}))
    setModelProfileId(typeof nextBinding.model_profile_id === 'string' ? nextBinding.model_profile_id : '')
    setPromptVersionId(typeof nextBinding.prompt_version_id === 'string' ? nextBinding.prompt_version_id : '')
    setSkillVersionIds(Array.isArray(nextBinding.skill_version_ids) ? nextBinding.skill_version_ids.filter((item): item is string => typeof item === 'string') : [])
    setToolAllowlist(Array.isArray(nextBinding.tool_allowlist) ? nextBinding.tool_allowlist.filter((item): item is string => typeof item === 'string').join('\n') : '')
    setOutputSchema(formatJson(nextBinding.output_schema ?? {}))
    setParams(formatJson(nextBinding.params ?? {}))
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError(null)
    try {
      const raw = await file.text()
      const object = parseObject(raw, 'Agent 导入文件')
      hydrateImported(object)
      setPreview(formatJson(object))
    } catch (reason) {
      setPreview(null)
      setError(reason instanceof Error ? reason.message : '无法解析 Agent 导入文件。')
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!resourceKeyPattern.test(agentKey)) { setError('Agent key 格式不合法。'); return }
    if (!modelProfileId || !promptVersionId) { setError('必须固定绑定 ModelProfile 与 PromptVersion。'); return }
    try {
      const payload: AgentCreatePayload = {
        expected_version: 0,
        agent_key: agentKey.trim(),
        name: name.trim(),
        description: description.trim(),
        content: parseObject(content, 'Agent content'),
        binding: {
          ...emptyAgentBinding,
          model_profile_id: modelProfileId,
          prompt_version_id: promptVersionId,
          skill_version_ids: [...new Set(skillVersionIds)],
          tool_allowlist: [...new Set(toolAllowlist.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean))],
          output_schema: parseObject(outputSchema, 'output_schema'),
          params: parseObject(params, 'params'),
        },
      }
      await onCreate(payload)
    } catch (reason) {
      if (!(reason instanceof ApiError)) setError(reason instanceof Error ? reason.message : '无法创建 Agent revision。')
    }
  }

  const publishedPrompts = data.prompts.filter((item) => item.status === 'published')
  const publishedSkills = data.skills.filter((item) => item.status === 'published')
  return <form className="panel form-panel cp-editor" onSubmit={submit} aria-label="Agent revision 编辑器">
    <div className="cp-editor-heading"><div><b>{seed ? `基于 ${seed.agent_key} r${seed.revision_number} 新建` : '创建 AgentRevision 草稿'}</b><p>AgentBinding 会与该 revision 一同固定；任何修改都创建新 revision。</p></div>{seed?.status === 'published' ? <StatusBadge status="published" label="来源已发布 · 只读" /> : null}</div>
    <div className="form-grid">
      <div className="field-group"><label htmlFor="agent-key">Agent key</label><input id="agent-key" className="field mono" required value={agentKey} onChange={(event) => setAgentKey(event.target.value)} /></div>
      <div className="field-group"><label htmlFor="agent-name">名称</label><input id="agent-name" className="field" required value={name} onChange={(event) => setName(event.target.value)} /></div>
      <div className="field-group full"><label htmlFor="agent-description">描述</label><textarea id="agent-description" className="field" maxLength={4000} value={description} onChange={(event) => setDescription(event.target.value)} /></div>
      <div className="field-group"><label htmlFor="agent-model">ModelProfile</label><select id="agent-model" className="field" required value={modelProfileId} onChange={(event) => setModelProfileId(event.target.value)}><option value="">请选择</option>{data.models.map((model) => <option key={model.id} value={model.id} disabled={model.status === 'disabled'}>{model.name} · {model.status}</option>)}</select></div>
      <div className="field-group"><label htmlFor="agent-prompt">PromptVersion（published）</label><select id="agent-prompt" className="field" required value={promptVersionId} onChange={(event) => setPromptVersionId(event.target.value)}><option value="">请选择</option>{publishedPrompts.map((prompt) => <option key={prompt.id} value={prompt.id}>{prompt.prompt_key} · r{prompt.revision_number}</option>)}</select></div>
      <div className="field-group full"><label htmlFor="agent-skills">SkillVersion（published，可多选）</label><select id="agent-skills" className="field cp-multi-select" multiple value={skillVersionIds} onChange={(event) => setSkillVersionIds(Array.from(event.target.selectedOptions, (option) => option.value))}>{publishedSkills.map((skill) => <option key={skill.id} value={skill.id}>{skill.skill_key} · r{skill.revision_number}</option>)}</select></div>
      <div className="field-group full"><label htmlFor="agent-content">Agent content · JSON object</label><textarea id="agent-content" className="field mono cp-code-field" required value={content} onChange={(event) => { setContent(event.target.value); setPreview(null) }} /></div>
      <div className="field-group"><label htmlFor="agent-tools">tool_allowlist（逐行或逗号）</label><textarea id="agent-tools" className="field mono" value={toolAllowlist} onChange={(event) => setToolAllowlist(event.target.value)} /></div>
      <div className="field-group"><label htmlFor="agent-params">params · JSON object</label><textarea id="agent-params" className="field mono" value={params} onChange={(event) => setParams(event.target.value)} /></div>
      <div className="field-group full"><label htmlFor="agent-schema">output_schema · JSON object</label><textarea id="agent-schema" className="field mono cp-code-field" value={outputSchema} onChange={(event) => setOutputSchema(event.target.value)} /></div>
      <div className="field-group full"><label htmlFor="agent-import">本地导入</label><label className="btn btn-line cp-file-button" htmlFor="agent-import"><FileUp size={14} />选择 Agent JSON</label><input className="cp-file-input" id="agent-import" type="file" accept=".json,application/json" onChange={(event) => void importFile(event)} /><div className="field-help">仅本地解析、预览和填表；不会上传原文件。</div></div>
    </div>
    {preview !== null ? <div className="cp-import-preview" aria-label="Agent 导入预览"><b>导入预览 · 尚未发送</b><pre>{preview}</pre></div> : null}
    {(!data.models.length || !publishedPrompts.length) ? <InlineNotice tone="warning" title="依赖尚未就绪">至少需要一个未禁用 ModelProfile 和一个 published PromptVersion；SkillVersion 可为空。</InlineNotice> : null}
    {error ? <InlineNotice tone="danger" title="无法创建 Agent revision">{error}</InlineNotice> : null}
    <div className="form-actions"><button type="button" className="btn btn-line" onClick={onCancel}>取消</button><PrimaryButton busy={busy} type="submit" disabled={!data.models.length || !publishedPrompts.length}><Plus size={14} />创建 Agent 草稿</PrimaryButton></div>
  </form>
}

function ModelEditor({ busy, onCancel, onCreate }: { busy: boolean; onCancel: () => void; onCreate: (payload: Record<string, unknown>, apiKey: string | null) => Promise<void> }) {
  const [setupMode, setSetupMode] = useState<ModelSetupMode>('kimi_code_cn')
  const [name, setName] = useState('Kimi Code K3')
  const [surface, setSurface] = useState<ModelSurface>('cc_switch')
  const [protocol, setProtocol] = useState<ModelProtocol>('openai')
  const [baseUrl, setBaseUrl] = useState('')
  const [modelId, setModelId] = useState('k3')
  const [fingerprint, setFingerprint] = useState('')
  const [secretRef, setSecretRef] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [interactiveConfirmed, setInteractiveConfirmed] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function changeSetupMode(value: ModelSetupMode) {
    setSetupMode(value)
    setError(null)
    setApiKey('')
    setInteractiveConfirmed(false)
    if (value === 'kimi_code_cn') {
      setName('Kimi Code K3')
      setModelId(modelPresets.kimi_code_cn.defaultModelId)
    } else if (value === 'kimi_platform_cn') {
      setName('Kimi 开放平台')
      setModelId(modelPresets.kimi_platform_cn.defaultModelId)
    } else {
      setName('')
      setModelId('')
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (setupMode !== 'advanced') {
      const preset = modelPresets[setupMode]
      const credential = apiKey.trim()
      if (credential.length < 8) { setError('API Key 不能为空，且至少需要 8 个字符。'); return }
      if (setupMode === 'kimi_code_cn' && !interactiveConfirmed) { setError('请确认 Kimi Code 仅用于本页用户主动触发的交互式调用。'); return }
      setApiKey('')
      await onCreate({
        expected_version: 0,
        name: name.trim(),
        surface: 'direct_api',
        protocol: 'openai_chat_completions',
        base_url: preset.baseUrl,
        model_id: modelId.trim(),
      }, credential)
      return
    }
    const trimmedSecretRef = secretRef.trim()
    if (trimmedSecretRef && !secretRefPattern.test(trimmedSecretRef)) { setError('secret_ref 只接受 keychain://、env:// 或 cc-switch:// 引用。'); return }
    if (fingerprint.trim() && !fingerprintPattern.test(fingerprint.trim())) { setError('catalog_fingerprint 必须是 64 位小写十六进制。'); return }
    setSecretRef('')
    await onCreate({
      expected_version: 0,
      name: name.trim(),
      surface,
      protocol,
      base_url: baseUrl.trim(),
      model_id: modelId.trim(),
      catalog_fingerprint: fingerprint.trim() || null,
      secret_ref: trimmedSecretRef || null,
    }, null)
  }

  return <form className="panel form-panel cp-editor" onSubmit={(event) => void submit(event)} aria-label="ModelProfile 编辑器">
    <div className="cp-editor-heading"><div><b>配置大模型</b><p>选择预设、填写 API Key；服务端保存到本机 Keychain，再读取模型目录并显式确认。</p></div><StatusBadge status="needs_user_setup" label="保存前不调用" /></div>
    <div className="form-grid">
      <div className="field-group full"><label htmlFor="model-setup-mode">接入方式</label><select id="model-setup-mode" className="field" value={setupMode} onChange={(event) => changeSetupMode(event.target.value as ModelSetupMode)}><option value="kimi_code_cn">Kimi Code（国内）</option><option value="kimi_platform_cn">Kimi 开放平台（国内）</option><option value="advanced">高级：现有路由 / CLI 元数据</option></select></div>
      <div className="field-group"><label htmlFor="model-name">名称</label><input id="model-name" className="field" required maxLength={160} value={name} onChange={(event) => setName(event.target.value)} /></div>
      {setupMode === 'kimi_code_cn' ? <div className="field-group"><label htmlFor="model-id">model_id</label><select id="model-id" className="field mono" value={modelId} onChange={(event) => setModelId(event.target.value)}>{modelPresets.kimi_code_cn.modelIds.map((id) => <option value={id} key={id}>{id}</option>)}</select></div> : <div className="field-group"><label htmlFor="model-id">model_id</label><input id="model-id" className="field mono" required maxLength={160} value={modelId} onChange={(event) => setModelId(event.target.value)} /></div>}
      {setupMode !== 'advanced' ? <>
        <div className="field-group full"><label htmlFor="model-api-key">API Key（只写入本机 Keychain）</label><input id="model-api-key" className="field mono" type="password" autoComplete="new-password" maxLength={4096} required value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="粘贴对应平台单独创建的 API Key" /><div className="field-help danger-text">Key 不进入 SQLite、幂等记录、审计、导出或接口响应；提交后输入立即清空。</div></div>
        <div className="field-group full"><InlineNotice tone="info" title="固定连接参数"><span className="mono">OpenAI Chat Completions · {modelPresets[setupMode].baseUrl}</span>{setupMode === 'kimi_code_cn' ? <span> · 官方固定模型清单（不探测未公开的 /models）</span> : <span> · 保存后读取官方 /models</span>}</InlineNotice></div>
        {setupMode === 'kimi_code_cn' ? <fieldset className="field-group full"><legend className="field-label">使用范围确认</legend><label className="choice-card"><input type="checkbox" checked={interactiveConfirmed} onChange={(event) => setInteractiveConfirmed(event.target.checked)} /><span><b>仅用于用户主动点击触发的个人交互</b><span>不交给定时任务、后台批处理或转售服务；保持真实 QINGZHI User-Agent。剧本流水线应使用 Kimi 开放平台。</span></span></label></fieldset> : <div className="field-group full"><InlineNotice tone="info" title="适合产品工作流">开放平台按量计费，可用于剧本节点和产品集成；保存只读取模型目录，不发起生成请求。</InlineNotice></div>}
      </> : <>
        <div className="field-group"><label htmlFor="model-surface">surface</label><select id="model-surface" className="field" value={surface} onChange={(event) => setSurface(event.target.value as ModelSurface)}><option value="cc_switch">cc_switch</option><option value="direct_api">direct_api</option><option value="cli">cli</option></select></div>
        <div className="field-group"><label htmlFor="model-protocol">protocol</label><select id="model-protocol" className="field" value={protocol} onChange={(event) => setProtocol(event.target.value as ModelProtocol)}><option value="openai">openai</option><option value="openai_responses">openai_responses</option><option value="openai_chat_completions">openai_chat_completions</option><option value="anthropic_messages">anthropic_messages</option><option value="cli">cli</option></select></div>
        <div className="field-group full"><label htmlFor="model-base-url">base_url</label><input id="model-base-url" className="field mono" required maxLength={500} value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://api.example.com/v1" /></div>
        <div className="field-group full"><label htmlFor="model-fingerprint">catalog_fingerprint（可选）</label><input id="model-fingerprint" className="field mono" value={fingerprint} onChange={(event) => setFingerprint(event.target.value)} placeholder="64 位小写十六进制；填写后仍需显式确认" /></div>
        <div className="field-group full"><label htmlFor="model-secret-ref">Secret 引用（secret_ref，可选）</label><input id="model-secret-ref" className="field mono" type="password" autoComplete="new-password" maxLength={500} value={secretRef} onChange={(event) => setSecretRef(event.target.value)} placeholder="keychain://qingzhi/provider" /><div className="field-help danger-text">高级模式只接受引用 URI，不接受原始 API Key。</div></div>
      </>}
    </div>
    {error ? <InlineNotice tone="danger" title="本地校验未通过">{error}</InlineNotice> : null}
    <div className="form-actions"><button type="button" className="btn btn-line" onClick={() => { setSecretRef(''); setApiKey(''); onCancel() }}>取消</button><PrimaryButton busy={busy} type="submit"><Plus size={14} />{setupMode === 'advanced' ? '创建 ModelProfile' : '保存凭据并确认路由'}</PrimaryButton></div>
  </form>
}

function ModelCredentialEditor({ row, busy, onCancel, onSave }: { row: ModelProfile; busy: boolean; onCancel: () => void; onSave: (apiKey: string) => Promise<void> }) {
  const [apiKey, setApiKey] = useState('')
  const [interactiveConfirmed, setInteractiveConfirmed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    const credential = apiKey.trim()
    if (credential.length < 8) { setError('API Key 不能为空，且至少需要 8 个字符。'); return }
    if (row.usage_scope === 'personal_interactive' && !interactiveConfirmed) { setError('请确认该 Kimi Code 凭据只用于用户主动触发的个人交互。'); return }
    setApiKey('')
    await onSave(credential)
  }
  return <form className="cp-sample-panel" aria-label={`${row.name} API Key`} onSubmit={(event) => void submit(event)}>
    <div><b>{row.secret_ref_configured ? '更新 API Key' : '配置 API Key'}</b><p>原始值只通过本次 PATCH 写入本机 Keychain，页面、SQLite、审计和导出均不回显。</p></div>
    <label htmlFor={`model-key-${row.id}`}>API Key</label>
    <input id={`model-key-${row.id}`} className="field mono" type="password" autoComplete="new-password" maxLength={4096} required value={apiKey} onChange={(event) => setApiKey(event.target.value)} />
    {row.usage_scope === 'personal_interactive' ? <label className="choice-card"><input type="checkbox" checked={interactiveConfirmed} onChange={(event) => setInteractiveConfirmed(event.target.checked)} /><span><b>仅个人交互式使用</b><span>不会用于剧本后台流水线、定时任务或批处理。</span></span></label> : null}
    {error ? <InlineNotice tone="danger" title="本地校验未通过">{error}</InlineNotice> : null}
    <div className="command-bar"><PrimaryButton busy={busy} type="submit"><KeyRound size={14} />保存并重新确认目录</PrimaryButton><button type="button" className="btn btn-line" onClick={() => { setApiKey(''); onCancel() }}>取消</button></div>
  </form>
}

function SampleRunPanel({ revision, modelProfile, busy, onClose, onRun }: { revision: AgentRevision; modelProfile?: ModelProfile; busy: boolean; onClose: () => void; onRun: (input: Record<string, unknown>) => Promise<AgentSampleRunResult | null> }) {
  const [input, setInput] = useState('{\n  "brief": "office revenge"\n}')
  const [result, setResult] = useState<AgentSampleRunResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const invokesConfirmedModel = Boolean(modelProfile && executableModelSurfaces.has(modelProfile.surface) && modelProfile.status === 'ready')
  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setResult(null)
    try {
      const next = await onRun(parseObject(input, 'sample_input'))
      setResult(next)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '样例校验失败。')
    }
  }
  return <form className="cp-sample-panel" onSubmit={submit} aria-label={`${revision.name} sample-run`}>
    <div><b>样例运行 · 仅由本次点击触发</b><p>打开面板不会发出 sample-run 请求；服务端会再次核对固定 binding、哈希与路由目录。</p></div>
    {invokesConfirmedModel
      ? <InlineNotice tone="warning" title="本次点击将尝试真实调用">绑定的是已确认 ready 的 {modelProfile?.surface} profile。点击运行后才会调用；目录漂移、凭据或契约不一致仍会失败关闭。</InlineNotice>
      : <InlineNotice tone="warning" title="当前不会调用 provider">只有绑定到已确认 ready 的 direct_api / cc_switch profile 才允许真实调用。当前点击仅请求服务端检查条件并签发 unconfigured/failed 回执。</InlineNotice>}
    <label htmlFor={`sample-${revision.id}`}>sample_input · JSON object</label>
    <textarea id={`sample-${revision.id}`} className="field mono" value={input} onChange={(event) => setInput(event.target.value)} />
    {result ? <div className={`cp-sample-result is-${result.status}`} role="status"><div className="cp-sample-result-heading"><b>服务端 sample-run 回执</b><StatusBadge status={result.status} /></div><dl><dt>status</dt><dd className="mono">{result.status}</dd><dt>configuration_valid</dt><dd className="mono">{String(result.configuration_valid)}</dd><dt>provider_invoked</dt><dd className={`mono ${result.provider_invoked ? '' : 'danger-text'}`}>{String(result.provider_invoked)}</dd><dt>reason</dt><dd className="mono">{result.reason}</dd><dt>receipt_id</dt><dd className="mono">{result.receipt.id}</dd><dt>receipt_hash</dt><dd className="mono">{result.receipt.receipt_hash}</dd><dt>integrity_verified</dt><dd className="mono">{String(result.receipt.integrity_verified)}</dd><dt>request_id</dt><dd className="mono">{result.receipt.request_id}</dd><dt>request_hash</dt><dd className="mono">{result.receipt.request_hash}</dd><dt>model_id</dt><dd className="mono">{result.receipt.model_id}</dd><dt>protocol</dt><dd className="mono">{result.receipt.protocol}</dd><dt>catalog_fingerprint</dt><dd className="mono">{result.receipt.catalog_fingerprint ?? '—'}</dd><dt>response_id</dt><dd className="mono">{result.receipt.response_id ?? '—'}</dd><dt>raw_response_sha256</dt><dd className="mono">{result.receipt.raw_response_sha256 ?? '—'}</dd><dt>sample_input_hash</dt><dd className="mono">{result.sample_input_hash}</dd></dl>{result.status === 'succeeded' ? <div className="cp-sample-output"><b>provider output</b><pre>{formatJson(result.output)}</pre></div> : result.status === 'unknown' ? <div className="cp-sample-error"><b>结果未知 · 禁止重试</b><pre>{formatJson(result.receipt.error)}</pre><p>请求已越过 provider 边界，但结果无法确认；请先人工对账，本页不会再次 POST。</p></div> : result.status === 'failed' ? <div className="cp-sample-error"><b>结构化错误</b><pre>{formatJson(result.receipt.error)}</pre><p>运行失败；服务端未返回 output，本页不会补造。</p></div> : <p>provider_invoked=false；不存在 provider output，本页不会补造。</p>}</div> : null}
    {error ? <InlineNotice tone="danger" title="样例校验失败">{error}</InlineNotice> : null}
    <div className="command-bar"><PrimaryButton busy={busy} type="submit"><Play size={14} />{invokesConfirmedModel ? '运行样例（将调用已绑定模型）' : '检查运行条件（不调用 provider）'}</PrimaryButton><button type="button" className="btn btn-line" onClick={onClose}>关闭</button></div>
  </form>
}

function ControlSummary({ data }: { data: ControlPlaneData }) {
  const waiting = data.models.filter((item) => item.status === 'waiting_route_confirmation').length
  return <div className="cp-summary" aria-label="控制面摘要">
    <div><span>AgentRevision</span><b>{data.agents.length}</b></div>
    <div><span>PromptVersion</span><b>{data.prompts.length}</b></div>
    <div><span>SkillVersion</span><b>{data.skills.length}</b></div>
    <div><span>ModelProfile</span><b>{data.models.length}</b></div>
    <div className={waiting ? 'cp-summary-warning' : ''}><span>待确认路由</span><b>{waiting}</b></div>
  </div>
}

export default function ControlPlanePage() {
  const notify = useToast()
  const remote = useRemote<ControlPlaneData>(async () => {
    try {
      const [prompts, skills, agents, models] = await Promise.all([
        api.get<PromptVersion[]>('/prompt-versions'),
        api.get<SkillVersion[]>('/skill-versions'),
        api.get<AgentRevision[]>('/agent-configs'),
        api.get<ModelProfile[]>('/model-profiles'),
      ])
      return { prompts, skills, agents, models }
    } catch (reason) {
      throw new Error(safeOperationError(reason, '无法读取 Agent 控制面'))
    }
  }, [])
  const [tab, setTab] = useState<ControlTab>('agents')
  const [editor, setEditor] = useState<ControlTab | null>(null)
  const [versionSeed, setVersionSeed] = useState<ContentVersion | null>(null)
  const [agentSeed, setAgentSeed] = useState<AgentRevision | null>(null)
  const [sampleRevision, setSampleRevision] = useState<AgentRevision | null>(null)
  const [credentialProfileId, setCredentialProfileId] = useState<string | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [operationError, setOperationError] = useState<string | null>(null)

  const data = remote.data
  const tabCounts = useMemo(() => ({ agents: data?.agents.length ?? 0, prompts: data?.prompts.length ?? 0, skills: data?.skills.length ?? 0, models: data?.models.length ?? 0 }), [data])

  async function mutate(actionKey: string, label: string, operation: () => Promise<unknown>, closeEditor = false) {
    setBusyAction(actionKey)
    setOperationError(null)
    try {
      await operation()
      if (closeEditor) { setEditor(null); setVersionSeed(null); setAgentSeed(null) }
      await remote.reload()
      notify.notify(label)
    } catch (reason) {
      setOperationError(safeOperationError(reason, `${label}失败`))
    } finally {
      setBusyAction(null)
    }
  }

  function openEditor(next: ControlTab, seed?: ContentVersion | AgentRevision | null) {
    setTab(next)
    setEditor(next)
    setOperationError(null)
    if (next === 'prompts' || next === 'skills') setVersionSeed((seed as ContentVersion | null | undefined) ?? null)
    if (next === 'agents') setAgentSeed((seed as AgentRevision | null | undefined) ?? null)
  }

  async function createVersion(kind: VersionKind, payload: VersionCreatePayload) {
    await mutate(`create-${kind}`, `已创建 ${kind === 'prompt' ? 'PromptVersion' : 'SkillVersion'} 草稿`, () => api.post(kind === 'prompt' ? '/prompt-versions' : '/skill-versions', payload, true), true)
  }

  async function storeCredentialAndConfirm(row: ModelProfile, apiKey: string) {
    let next = await api.patch<ModelProfile>(`/model-profiles/${row.id}/credential`, {
      expected_version: row.version,
      api_key: apiKey,
      usage_scope_ack: row.usage_scope === 'personal_interactive' ? 'personal_interactive_only_v1' : null,
    })
    next = await api.post<ModelProfile>(`/model-profiles/${row.id}/refresh-route`, { expected_version: next.version }, true)
    if (!isSha256(next.observed_catalog_fingerprint)) throw new Error('模型目录没有返回可确认的 fingerprint。')
    next = await api.post<ModelProfile>(`/model-profiles/${row.id}/confirm-route`, { expected_version: next.version, catalog_fingerprint: next.observed_catalog_fingerprint }, true)
    if (next.status !== 'ready') throw new Error('模型目录确认后仍未进入 ready。')
    return next
  }

  async function createModelProfile(payload: Record<string, unknown>, apiKey: string | null) {
    setBusyAction('create-model')
    setOperationError(null)
    let created = false
    try {
      const row = await api.post<ModelProfile>('/model-profiles', payload, true)
      created = true
      if (apiKey) await storeCredentialAndConfirm(row, apiKey)
      setEditor(null)
      await remote.reload()
      notify.notify(apiKey ? '模型凭据已保存，目录已确认' : '已创建 ModelProfile')
    } catch (reason) {
      if (created) setEditor(null)
      await remote.reload().catch(() => undefined)
      setOperationError(safeOperationError(reason, created ? 'ModelProfile 已创建，但模型验证未完成' : '创建 ModelProfile 失败'))
    } finally {
      setBusyAction(null)
    }
  }

  async function configureModelCredential(row: ModelProfile, apiKey: string) {
    setBusyAction(`${row.id}-credential`)
    setOperationError(null)
    try {
      await storeCredentialAndConfirm(row, apiKey)
      setCredentialProfileId(null)
      await remote.reload()
      notify.notify('API Key 已更新，模型目录已重新确认')
    } catch (reason) {
      await remote.reload().catch(() => undefined)
      setOperationError(safeOperationError(reason, 'API Key 已提交，但模型验证未完成'))
    } finally {
      setBusyAction(null)
    }
  }

  async function publishVersion(kind: VersionKind, row: ContentVersion) {
    await mutate(row.id, '已发布只读 revision', () => api.post(`/${kind}-versions/${row.id}/publish`, { expected_version: row.version }, true))
  }

  async function rollbackVersion(kind: VersionKind, row: ContentVersion) {
    await mutate(row.id, '已从历史版本创建新发布 revision', () => api.post(`/${kind}-versions/${row.id}/rollback`, { expected_version: row.version, note: 'control-plane UI rollback' }, true))
  }

  async function publishAgent(row: AgentRevision) {
    await mutate(row.id, '已发布只读 AgentRevision', () => api.post(`/agent-configs/${row.id}/publish`, { expected_version: row.version }, true))
  }

  async function rollbackAgent(row: AgentRevision) {
    await mutate(row.id, '已从历史 Agent 创建新发布 revision', () => api.post(`/agent-configs/${row.id}/rollback`, { expected_version: row.version, note: 'control-plane UI rollback' }, true))
  }

  async function runSample(row: AgentRevision, sampleInput: Record<string, unknown>) {
    setBusyAction(`sample-${row.id}`)
    setOperationError(null)
    try {
      const result = await api.post<unknown>(`/agent-configs/${row.id}/sample-run`, { expected_version: row.version, sample_input: sampleInput }, true)
      const modelProfile = data?.models.find((model) => model.id === row.binding?.model_profile_id)
      return validateSampleRunResult(result, row, modelProfile)
    } catch (reason) {
      const message = reason instanceof ApiError ? safeOperationError(reason, '样例校验失败') : reason instanceof Error ? reason.message : '样例校验失败。'
      setOperationError(message)
      throw new Error(message)
    } finally {
      setBusyAction(null)
    }
  }

  async function modelCommand(row: ModelProfile, command: 'refresh-route' | 'confirm-route' | 'disable') {
    const body = command === 'confirm-route'
      ? { expected_version: row.version, catalog_fingerprint: row.observed_catalog_fingerprint }
      : { expected_version: row.version }
    const labels = { 'refresh-route': '目录刷新完成', 'confirm-route': '路由目录已显式确认', disable: 'ModelProfile 已禁用' }
    await mutate(`${row.id}-${command}`, labels[command], () => api.post(`/model-profiles/${row.id}/${command}`, body, true))
  }

  return <>
    <PageHeader
      eyebrow="版本治理 · AGENT CONTROL PLANE"
      title="Agent 控制面"
      description="Prompt、Skill 与 Agent 内容采用 append-only revision；published 永久只读。网站可直接配置 Kimi，sample-run 仅在用户点击且绑定 profile 已确认 ready 时调用。"
      crumbs={<><Link to="/settings">设置与连接器</Link> / <b>Agent 控制面</b></>}
      actions={<button className="btn btn-gold" onClick={() => openEditor(tab)}><Plus size={15} />{tab === 'models' ? '新建 Profile' : '新建 revision'}</button>}
    />
    <InlineNotice tone="warning" title="fail-closed 控制边界"><ShieldCheck size={14} /> 本页不会自动生成内容。只有用户在 sample-run 面板明确点击，且绑定 direct_api / cc_switch profile 经服务端复核为 ready 时才会真实调用。API Key 只经专用 CAS 请求写入 Keychain；其余元数据写入使用幂等键。</InlineNotice>
    {operationError ? <div className="cp-operation-error"><InlineNotice tone="danger" title="控制面操作未完成">{operationError}</InlineNotice></div> : null}
    {remote.loading && !data ? <LoadingState label="正在并行读取 PromptVersion、SkillVersion、AgentRevision、AgentBinding 与 ModelProfile…" /> : remote.error && !data ? <ErrorState message={remote.error} onRetry={remote.reload} /> : data ? <>
      <ControlSummary data={data} />
      <div className="cp-tabs" role="tablist" aria-label="控制面资源">
        {([
          ['agents', 'AgentRevision + Binding'],
          ['prompts', 'PromptVersion'],
          ['skills', 'SkillVersion'],
          ['models', 'ModelProfile'],
        ] as Array<[ControlTab, string]>).map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => { setTab(id); setEditor(null); setOperationError(null) }}>{label}<span>{tabCounts[id]}</span></button>)}
      </div>

      {editor === 'prompts' ? <VersionEditor key={`prompt-${versionSeed?.id ?? 'new'}`} kind="prompt" seed={versionSeed} busy={busyAction === 'create-prompt'} onCancel={() => setEditor(null)} onCreate={(payload) => createVersion('prompt', payload)} /> : null}
      {editor === 'skills' ? <VersionEditor key={`skill-${versionSeed?.id ?? 'new'}`} kind="skill" seed={versionSeed} busy={busyAction === 'create-skill'} onCancel={() => setEditor(null)} onCreate={(payload) => createVersion('skill', payload)} /> : null}
      {editor === 'agents' ? <AgentEditor key={`agent-${agentSeed?.id ?? 'new'}`} seed={agentSeed} data={data} busy={busyAction === 'create-agent'} onCancel={() => setEditor(null)} onCreate={(payload) => mutate('create-agent', '已创建 AgentRevision 草稿', () => api.post('/agent-configs', payload, true), true)} /> : null}
      {editor === 'models' ? <ModelEditor busy={busyAction === 'create-model'} onCancel={() => setEditor(null)} onCreate={createModelProfile} /> : null}

      {tab === 'prompts' ? <><SectionTitle index="P" title="PromptVersion" action={<button className="btn btn-line" onClick={() => openEditor('prompts')}><Plus size={14} />创建草稿</button>} /><VersionList kind="prompt" rows={data.prompts} busyAction={busyAction} onSeed={(row) => openEditor('prompts', row)} onPublish={(row) => void publishVersion('prompt', row)} onRollback={(row) => void rollbackVersion('prompt', row)} /></> : null}
      {tab === 'skills' ? <><SectionTitle index="S" title="SkillVersion" action={<button className="btn btn-line" onClick={() => openEditor('skills')}><Plus size={14} />创建草稿</button>} /><VersionList kind="skill" rows={data.skills} busyAction={busyAction} onSeed={(row) => openEditor('skills', row)} onPublish={(row) => void publishVersion('skill', row)} onRollback={(row) => void rollbackVersion('skill', row)} /></> : null}
      {tab === 'agents' ? <>
        <SectionTitle index="A" title="AgentRevision + 固定 AgentBinding" action={<button className="btn btn-line" onClick={() => openEditor('agents')}><Plus size={14} />创建草稿</button>} />
        {!data.agents.length ? <EmptyState title="还没有 AgentRevision" description="先准备 ModelProfile 与 published PromptVersion，再创建带固定 AgentBinding 的草稿。" /> : <div className="cp-version-list" aria-label="Agent revisions">{data.agents.map((row) => <article className="cp-version-card cp-agent-card" key={row.id}>
          <header><div><span className="cp-key mono">{row.agent_key}</span><h3>{row.name}</h3><p>{row.description}</p></div><StatusBadge status={row.status} label={row.status === 'published' ? 'published · 只读' : 'draft'} /></header>
          <div className="cp-meta-row"><span>revision r{row.revision_number}</span><span>record v{row.version}</span><span className="mono" title={row.content_hash}>content {shortHash(row.content_hash)}</span><RelativeTime value={row.updated_at ?? row.created_at} /></div>
          {row.binding ? <dl className="cp-binding"><dt>ModelProfile</dt><dd className="mono">{row.binding.model_profile_id}</dd><dt>PromptVersion</dt><dd className="mono">{row.binding.prompt_version_id}</dd><dt>SkillVersion</dt><dd className="mono">{row.binding.skill_version_ids.join(', ') || '无'}</dd><dt>Tool allowlist</dt><dd className="mono">{row.binding.tool_allowlist.join(', ') || '无'}</dd><dt>params_hash</dt><dd className="mono">{row.binding.params_hash}</dd></dl> : <InlineNotice tone="danger" title="AgentBinding 缺失">此 revision 不满足发布或 sample-run 条件。</InlineNotice>}
          <details><summary>检查 content / output_schema / params</summary><pre>{formatJson({ content: row.content, output_schema: row.binding?.output_schema, params: row.binding?.params })}</pre></details>
          <div className="command-bar"><button className="btn btn-line" onClick={() => exportAgent(row)}><Download size={14} />本地导出 JSON</button><button className="btn btn-line" onClick={() => openEditor('agents', row)}><FileJson2 size={14} />基于此新建 revision</button><button className="btn btn-line" disabled={!row.binding || row.status !== 'published'} title={row.status === 'published' ? undefined : '必须先发布 AgentRevision'} onClick={() => { setSampleRevision(row); setOperationError(null) }}><Play size={14} />sample-run</button>{row.status === 'draft' ? <button className="btn btn-solid" disabled={!row.binding || busyAction === row.id} onClick={() => void publishAgent(row)}><Send size={14} />发布</button> : <button className="btn btn-line" disabled={!row.binding || busyAction === row.id} onClick={() => void rollbackAgent(row)}><RotateCcw size={14} />回滚为新发布 revision</button>}</div>
          {sampleRevision?.id === row.id ? <SampleRunPanel revision={row} modelProfile={data.models.find((model) => model.id === row.binding?.model_profile_id)} busy={busyAction === `sample-${row.id}`} onClose={() => setSampleRevision(null)} onRun={(input) => runSample(row, input)} /> : null}
        </article>)}</div>}
      </> : null}
      {tab === 'models' ? <>
        <SectionTitle index="M" title="ModelProfile 路由控制" action={<button className="btn btn-line" onClick={() => openEditor('models')}><Plus size={14} />新建 Profile</button>} />
        {!data.models.length ? <EmptyState title="还没有 ModelProfile" description="可直接配置 Kimi Code / Kimi 开放平台，或在高级模式登记现有 CC Switch 路由。" /> : <div className="cp-model-grid" aria-label="Model profiles">{data.models.map((row) => {
          const catalogChanged = Boolean(row.observed_catalog_fingerprint && row.observed_catalog_fingerprint !== row.catalog_fingerprint)
          const confirmable = Boolean(row.observed_catalog_fingerprint && (row.status === 'waiting_route_confirmation' || row.status === 'disabled'))
          return <article className={`cp-model-card ${row.status === 'waiting_route_confirmation' ? 'route-waiting' : ''}`} key={row.id}>
            <header><div><h3>{row.name}</h3><span className="mono">{row.model_id}</span></div><StatusBadge status={row.status} /></header>
            <dl><dt>surface</dt><dd className="mono">{row.surface}</dd><dt>preset</dt><dd className="mono">{row.provider_preset ?? 'custom'}</dd><dt>usage_scope</dt><dd className="mono">{row.usage_scope ?? 'route_metadata'}</dd><dt>protocol</dt><dd className="mono">{row.protocol}</dd><dt>base_url</dt><dd className="mono">{row.base_url}</dd><dt>model_id</dt><dd className="mono">{row.model_id}</dd><dt>catalog_fingerprint</dt><dd className="mono cp-fingerprint">{row.catalog_fingerprint ?? '未确认'}</dd><dt>observed_catalog_fingerprint</dt><dd className="mono cp-fingerprint">{row.observed_catalog_fingerprint ?? '未发现'}</dd><dt>secret_ref</dt><dd><LockKeyhole size={13} />{row.secret_ref_configured ? 'configured=true（不回显）' : '未配置'}</dd><dt>record</dt><dd>v{row.version} · <RelativeTime value={row.route_checked_at} /></dd></dl>
            {row.usage_scope === 'personal_interactive' ? <InlineNotice tone="info" title="Kimi Code 使用边界">仅用于用户主动触发的个人交互；剧本流水线、后台任务和产品集成请另建 Kimi 开放平台 Profile。</InlineNotice> : null}
            {row.status === 'needs_user_setup' ? <InlineNotice tone="warning" title="needs_user_setup">凭据、模型目录或路由尚未完成确认；不能声称 route ready。</InlineNotice> : null}
            {row.status === 'waiting_route_confirmation' ? <InlineNotice tone="danger" title="waiting_route_confirmation">{catalogChanged ? '发现目录指纹已变化；刷新不会自动接受，必须人工确认新指纹。' : '初始目录指纹尚未确认；必须显式接受后才会 ready。'}</InlineNotice> : null}
            <div className="command-bar"><button className="btn btn-line" onClick={() => exportModel(row)}><Download size={14} />本地导出</button>{row.surface === 'direct_api' ? <button className="btn btn-line" disabled={busyAction === `${row.id}-credential`} onClick={() => { setCredentialProfileId(row.id); setOperationError(null) }}><KeyRound size={14} />{row.secret_ref_configured ? '更新 API Key' : '配置 API Key'}</button> : null}<button className="btn btn-line" disabled={!executableModelSurfaces.has(row.surface) || row.status === 'disabled' || busyAction === `${row.id}-refresh-route`} onClick={() => void modelCommand(row, 'refresh-route')}><RefreshCw size={14} />刷新目录</button>{confirmable ? <button className="btn btn-solid" disabled={busyAction === `${row.id}-confirm-route`} onClick={() => void modelCommand(row, 'confirm-route')}><ShieldCheck size={14} />{catalogChanged ? '确认目录变化' : '确认路由'}</button> : null}{row.status !== 'disabled' ? <button className="btn btn-line danger-text" disabled={busyAction === `${row.id}-disable`} onClick={() => void modelCommand(row, 'disable')}>禁用</button> : null}</div>
            {credentialProfileId === row.id ? <ModelCredentialEditor row={row} busy={busyAction === `${row.id}-credential`} onCancel={() => setCredentialProfileId(null)} onSave={(nextKey) => configureModelCredential(row, nextKey)} /> : null}
          </article>
        })}</div>}
      </> : null}
    </> : null}
  </>
}
