export type Industry = 'content' | 'marketing' | 'medical' | 'drama' | 'consulting' | 'taoism' | 'avatar' | 'culture_legal'
export type ApprovalMode = 'key' | 'managed' | 'automatic' | 'every_stage'
export type JobStatus = 'queued' | 'running' | 'awaiting_review' | 'waiting_children' | 'gate_blocked' | 'paused' | 'done' | 'failed' | 'cancelled'
export type StageStatus = 'queued' | 'running' | 'awaiting_review' | 'done' | 'failed' | 'interrupted' | 'rejected' | 'stale' | 'skipped'
export type GenerationStatus = 'prepared' | 'running' | 'succeeded' | 'failed' | 'unknown' | 'cancelled'

export interface ApiMeta {
  request_id?: string
  count?: number
  [key: string]: unknown
}

export interface ApiEnvelope<T> {
  data: T
  meta?: ApiMeta
}

export interface AgentDefinition {
  id: string
  name: string
  title?: string
  department: string
  industry: Industry | string
  code?: string
  glyph?: string
  summary?: string
  description?: string
  prompt_version?: string
  policy_version?: string
  model_policy?: string | Record<string, unknown>
  skills?: string[]
  capabilities?: string[]
  tools?: string[]
  knowledge_packs?: string[]
  knowledge_pack_ids?: string[]
  role_summary?: string
  enabled?: boolean
  risk_policy?: string | Record<string, unknown>
  run_count?: number
}

export interface WorkflowNode {
  id: string
  name: string
  agent_id?: string
  glyph?: string
  type?: 'serial' | 'parallel' | 'optional' | 'human' | 'gate'
  kind?: 'agent' | 'approval' | 'compliance' | 'expert_review' | string
  depends_on?: string[]
  required?: boolean
  optional?: boolean
  mandatory_review?: boolean
}

export interface WorkflowDefinition {
  id: string
  name: string
  industry: Industry | string
  version?: string
  definition_version?: string
  description?: string
  enabled?: boolean
  nodes: WorkflowNode[]
  edges?: Array<Record<string, unknown>>
  approval_policy?: Record<string, unknown>
}

export interface StageRun {
  id: string
  node_id?: string
  node_key?: string
  name: string
  glyph?: string
  agent_id?: string
  status: StageStatus
  version?: number
  started_at?: string | null
  completed_at?: string | null
  finished_at?: string | null
  kind?: string
  error?: string | null
  retry_count?: number
  artifact_id?: string | null
  cost_cents?: number
}

export interface SourceRef {
  id?: string
  url?: string
  file_name?: string
  title: string
  fetched_at?: string
  excerpt?: string
  scope?: string | string[]
  valid_until?: string | null
}

export interface Artifact {
  id: string
  job_id?: string
  stage_run_id?: string
  name?: string
  kind?: string
  artifact_type?: string
  summary?: string
  payload?: Record<string, unknown> | string
  version?: number
  current_version?: number
  checksum?: string
  source_refs?: SourceRef[]
  assumptions?: string[]
  open_questions?: string[]
  risk_flags?: GateFinding[]
  prompt_version?: string
  policy_version?: string
  model_run_id?: string
  stale?: boolean
  original_filename?: string
  mime_type?: string
  size_bytes?: number
  authorization_scope?: string
  status?: string
  created_at?: string
}

export interface GateFinding {
  id?: string
  category: string
  level?: 'high' | 'medium' | 'low' | string
  risk_level?: 'high' | 'medium' | 'low' | string
  message?: string
  text?: string
  evidence?: string
  suggestion?: string
  recommended_action?: string
  matched_text?: string
  location?: string
  basis?: string
  overridable?: boolean
}

export interface QualityGate {
  id: string
  artifact_id?: string
  status: 'passed' | 'blocked' | 'pending' | string
  policy_version?: string
  industry?: string
  findings: GateFinding[]
  attestation_id?: string | null
  attestation_valid?: boolean
  signed_by?: string | null
  attestation_expires_at?: string | null
  override_allowed?: boolean
  risk_level?: string
  evaluated_at?: string
}

export interface GateAttestation {
  id: string
  gate_id: string
  artifact_id: string
  artifact_checksum?: string
  policy_version?: string
  signed_by?: string | null
  issued_at?: string
  expires_at?: string
  valid: boolean
}

export interface Review {
  id: string
  stage_run_id?: string
  status: string
  kind?: string
  required_role?: string
  version?: number
  comment?: string
}

export interface AuditEvent {
  id: string
  action: string
  actor?: string
  actor_id?: string | null
  summary?: string
  created_at: string
  sequence?: number
  resource_type?: string
  resource_id?: string
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
}

export interface Job {
  id: string
  display_id?: string | number
  tenant_id?: string
  title: string
  brief: string | Record<string, unknown>
  industry: Industry | string
  workflow_id: string
  workflow_name?: string
  approval_mode: ApprovalMode | string
  status: JobStatus
  priority?: string
  platforms?: string[]
  acceptance_criteria?: string[]
  budget_cents?: number
  reserved_cents?: number
  source?: string
  source_ref?: Record<string, unknown>
  parent_job_id?: string | null
  dispatch_key?: string | null
  run_revision?: number
  route_reason?: string
  reason?: string
  error?: Record<string, unknown> | null
  current_stage?: string
  version: number
  stage_runs?: StageRun[]
  artifacts?: Artifact[]
  reviews?: Review[]
  latest_gate?: QualityGate | null
  gates?: QualityGate[]
  gate_attestations?: GateAttestation[]
  audit_events?: AuditEvent[]
  created_at: string
  updated_at: string
}

export interface GenerationAttempt {
  id: string
  generation_run_id: string
  attempt_number: number
  provider: string
  mode: string
  request_hash?: string
  idempotency_key?: string
  status: GenerationStatus
  cost_minor?: number
  currency?: string
  remote_lineage?: Record<string, unknown>
  local_lineage?: Record<string, unknown>
  error?: Record<string, unknown> | null
  started_at?: string
  finished_at?: string | null
  reconciled_at?: string | null
  created_at?: string
  updated_at?: string
}

export interface GenerationRun {
  id: string
  job_id: string
  stage_run_id?: string | null
  provider: string
  mode: string
  request_hash?: string
  idempotency_key?: string
  status: GenerationStatus
  run_revision: number
  cost_minor?: number
  currency?: string
  remote_lineage?: Record<string, unknown>
  local_lineage?: Record<string, unknown>
  error?: Record<string, unknown> | null
  prepared_at?: string
  started_at?: string | null
  finished_at?: string | null
  reconciled_at?: string | null
  created_at?: string
  updated_at?: string
  attempts?: GenerationAttempt[]
}

export interface DramaProject {
  id: string
  tenant_id?: string
  created_by?: string
  title: string
  description: string
  status: 'active' | 'archived' | string
  version?: number
  created_at?: string
  updated_at?: string
}

export interface DramaRunSpec {
  market: 'US' | string
  language: 'en-US' | string
  platforms: string[]
  episode_count: number
  target_duration_seconds: number
  duration_tolerance_seconds: number
  aspect_ratio: '9:16' | string
  resolution: '480p' | string
  editing_mode: 'manual' | string
  publishing_mode: 'manual' | string
  budget_cents: number
}

export interface DramaEpisode {
  id: string
  drama_run_id: string
  episode_index: number
  logical_key: 'E01' | 'E02' | 'E03' | string
  dispatch_key: string
  child_job_id?: string | null
  created_at?: string
  updated_at?: string
}

export interface DramaGateBinding {
  id: string
  gate_id: string
  binding_type: 'document' | 'artifact' | string
  requirement_key: string
  document_version_id?: string | null
  document_content_hash?: string | null
  artifact_id?: string | null
  artifact_checksum?: string | null
  provenance: Record<string, unknown>
  stale: boolean
  created_at?: string
}

export interface DramaGate {
  id: string
  drama_run_id: string
  gate_number: number
  gate_revision: number
  status: 'approved' | 'stale' | string
  run_revision: number
  approved_by: string
  approved_by_role: string
  approved_at: string
  decision_hash: string
  stale_at?: string | null
  stale_reason?: string | null
  created_at?: string
  bindings: DramaGateBinding[]
}

export interface DramaDocumentVersion {
  id: string
  drama_run_id: string
  doc_type: string
  logical_key: string
  revision_number: number
  content_format: 'json' | 'markdown' | 'text' | string
  content: unknown
  content_hash: string
  source_refs: Array<Record<string, unknown>>
  evidence_refs: Array<Record<string, unknown>>
  artifact_id?: string | null
  artifact_checksum?: string | null
  created_by?: string
  run_revision: number
  created_at?: string
}

export interface DramaGate1ModelReceiptSummary {
  id: string
  status: 'succeeded' | 'failed' | 'unconfigured' | string
  provider_invoked: boolean
  receipt_hash: string
  response_id?: string | null
  raw_response_sha256?: string | null
  model_id: string
  protocol: string
  integrity_verified: boolean
}

export interface DramaGate1ReadinessItem {
  requirement_key: string
  doc_type: string
  logical_key: string
  document_version_id?: string | null
  document_content_hash?: string | null
  run_revision?: number | null
  present: boolean
  latest: boolean
  contract: { valid: boolean; error?: string | null }
  source: {
    valid: boolean
    kind?: string | null
    [key: string]: unknown
  }
  model_receipt?: DramaGate1ModelReceiptSummary | null
}

export interface DramaGate1ReadinessBlocker {
  code: string
  message: string
  requirement_key?: string
  details?: Record<string, unknown>
}

export interface DramaGate1StageSummary {
  latest_invocation?: {
    id: string
    status: string
    version: number
    run_revision: number
    stage_key?: string
    output_schema_hash?: string
  } | null
  provider_receipt?: {
    invocation_receipt_id: string
    model_invocation_receipt_id: string
    status: 'succeeded' | 'failed' | 'unconfigured' | string
    provider_invoked: boolean
    receipt_hash: string
    response_id?: string | null
    raw_response_sha256?: string | null
    integrity_verified: boolean
  } | null
  latest_materialization?: {
    id: string
    input_run_revision: number
    result_run_revision: number
    manifest_hash?: string
    materialization_hash?: string
    integrity_verified: boolean
  } | null
}

export interface DramaGate1Readiness {
  schema_version: string
  drama_run_id: string
  run_revision: number
  run_status: string
  run_spec_hash: string
  required_agent_contract: {
    stage_key: string
    candidate_pack_schema_version: string
    required_skill_keys: string[]
    document_requirement_keys: string[]
    provider_receipt_required: boolean
    human_originality_review_required: boolean
  }
  output_schema_hash?: string | null
  stage?: DramaGate1StageSummary
  items: DramaGate1ReadinessItem[]
  cross_checks: Record<string, { passed: boolean; details: Record<string, unknown> }>
  blockers: DramaGate1ReadinessBlocker[]
  can_human_approve: boolean
  readiness_hash: string
}

export interface DramaRun {
  id: string
  project_id: string
  parent_job_id: string
  created_by?: string
  run_number: number
  spec: DramaRunSpec
  spec_hash: string
  status: string
  run_revision: number
  created_at?: string
  updated_at?: string
  episodes?: DramaEpisode[]
  gates?: DramaGate[]
}

export type DramaPublishingPlatform = 'TikTok' | 'YouTube Shorts'

export type DramaEpisodeId = 'E01' | 'E02' | 'E03'

export interface DramaFinalMasterHashes {
  E01: string
  E02: string
  E03: string
}

export interface PublishingReceipt {
  id: string
  drama_run_id: string
  episode_id: DramaEpisodeId
  platform: DramaPublishingPlatform
  receipt_revision: number
  run_revision: number
  gate_3_id: string
  gate_3_decision_hash: string
  final_master_hash: string
  verification_status: 'manual_unverified'
  published_at: string
  external_post_id: string
  public_url: string
  evidence_artifact_id: string
  evidence_artifact_version: number
  evidence_artifact_checksum: string
  notes: string
  receipt_hash: string
  created_by?: string
  created_at?: string
  platform_api_called: false
}

export interface ObservedPerformanceMetrics {
  views: number
  likes: number
  comments: number
  shares: number
  saves: number
  completed_views: number
  watch_time_seconds: number
  followers_gained: number
}

export interface PerformanceSnapshot {
  id: string
  drama_run_id: string
  episode_id: DramaEpisodeId
  platform: DramaPublishingPlatform
  snapshot_revision: number
  run_revision: number
  publishing_receipt_id: string
  publishing_receipt_hash: string
  measurement_window_start: string
  measurement_window_end: string
  captured_at: string
  observation_status: 'observed'
  verification_status: 'manual_unverified'
  source_kind: 'csv_artifact' | 'json_artifact'
  source_artifact_id: string
  source_artifact_version: number
  source_artifact_checksum: string
  metrics: ObservedPerformanceMetrics
  metrics_hash: string
  snapshot_hash: string
  created_by?: string
  created_at?: string
  platform_api_called: false
  metrics_externally_verified: false
}

export interface CCSwitchModel {
  id: string
  [key: string]: unknown
}

export interface CCSwitchDiscovery {
  status: 'ready' | 'needs_user_setup' | 'unhealthy' | 'stopped' | string
  base_url: string
  health: Record<string, unknown> | null
  models: CCSwitchModel[]
  catalog_fingerprint: string | null
  error_code?: string | null
  message?: string | null
}

export interface ProviderHealthEntry {
  id: string
  kind: string
  status: string
  reason?: string
  web_search_event_count?: number
  source_count?: number
  finished_at?: string
  receipt_sha256?: string
  gate_1_eligible?: boolean
  distinct_work_count?: number
  assessment_reasons?: string[]
  detail?: CCSwitchDiscovery | Record<string, unknown>
}

export interface ProviderHealth {
  providers: ProviderHealthEntry[]
  production_ready: boolean
}

export interface DashboardData {
  agent_count: number
  enabled_agent_count?: number
  industry_count: number
  active_jobs: number
  pending_reviews: number
  blocked_jobs: number
  delivered_this_month: number
  recent_jobs: Job[]
  departments?: Array<{ industry: string; agent_count: number; active_jobs: number }>
  jobs_by_status?: Record<string, number>
  total_jobs?: number
  total_agents?: number
  agents_by_department?: Array<{ department: string; count: number }>
  unread_notifications?: number
  runtime?: { provider?: string; external_connectors?: string; production_ready?: boolean }
}

export interface KnowledgeItem {
  id: string
  title: string
  kind?: string
  content?: string
  source_url?: string
  source_title?: string
  industry?: string
  scope?: string
  quality?: string
  valid_until?: string | null
  status?: string
  enabled?: boolean
  version?: number
  created_at?: string
  updated_at?: string
}

export interface Meeting {
  id: string
  title: string
  brief?: string
  question?: string
  industry: string
  status: string
  member_agent_ids?: string[]
  agent_ids?: string[]
  members?: AgentDefinition[]
  proposals?: Array<{ agent_id?: string; title?: string; summary?: string; evidence?: string[] }>
  decision?: 'GO' | 'NO_GO' | 'NEED_INFO' | string | null
  rationale?: string
  counterarguments?: Array<{ agent_id?: string; title?: string; risk?: string; summary?: string; response?: string }>
  action_items?: Array<Record<string, unknown>>
  version?: number
  action_job_ids?: string[]
  derived_job_ids?: string[]
  created_at?: string
}

export interface Schedule {
  id: string
  name: string
  cron?: string
  cadence?: string
  workflow_id?: string
  industry?: string
  enabled: boolean
  next_run_at?: string | null
  last_run_at?: string | null
  version?: number
  timezone?: string
  job_template?: Record<string, unknown>
}

export interface Notification {
  id: string
  title: string
  message?: string
  body?: string
  kind?: string
  channel?: string
  read?: boolean
  read_at?: string | null
  status?: string
  created_at: string
  job_id?: string
  resource_type?: string | null
  resource_id?: string | null
}

export interface BillingSummary {
  balance_cents?: number
  reserved_cents?: number
  spent_this_month_cents?: number
  model_cost_cents?: number
  tool_cost_cents?: number
  storage_cost_cents?: number
  human_review_cost_cents?: number
  currency?: string
  observed_cost_cents?: number
  charged_cents?: number
  billing_enabled?: boolean
  notice?: string
}

export interface ApiErrorBody {
  code?: string
  message?: string
  details?: unknown
}

export type ControlPlaneVersionStatus = 'draft' | 'published'
export type ControlPlaneContentFormat = 'json' | 'markdown' | 'text'
export type ModelSurface = 'cc_switch' | 'direct_api' | 'cli'
export type ModelProtocol = 'openai' | 'openai_responses' | 'openai_chat_completions' | 'anthropic_messages' | 'cli'
export type ModelProfileStatus = 'needs_user_setup' | 'ready' | 'waiting_route_confirmation' | 'disabled'

export interface VersionedControlPlaneContent {
  id: string
  revision_number: number
  name: string
  content_format: ControlPlaneContentFormat
  content: string | Record<string, unknown>
  content_hash: string
  status: ControlPlaneVersionStatus
  created_by?: string
  published_at?: string | null
  created_at?: string
  updated_at?: string
  version: number
}

export interface PromptVersion extends VersionedControlPlaneContent {
  prompt_key: string
  source_version_id?: string | null
}

export interface SkillVersion extends VersionedControlPlaneContent {
  skill_key: string
  source_version_id?: string | null
}

export interface ModelProfile {
  id: string
  name: string
  surface: ModelSurface
  protocol: ModelProtocol
  base_url: string
  model_id: string
  catalog_fingerprint?: string | null
  observed_catalog_fingerprint?: string | null
  secret_ref_configured: boolean
  provider_preset?: 'kimi_code_cn' | 'kimi_platform_cn' | null
  usage_scope?: 'personal_interactive' | 'product_integration' | null
  status: ModelProfileStatus
  route_checked_at?: string | null
  created_at?: string
  updated_at?: string
  version: number
}

export interface AgentBinding {
  id: string
  agent_revision_id: string
  model_profile_id: string
  prompt_version_id: string
  skill_version_ids: string[]
  tool_allowlist: string[]
  output_schema: Record<string, unknown>
  params: Record<string, unknown>
  params_hash: string
  created_at?: string
}

export interface AgentRevision {
  id: string
  agent_key: string
  revision_number: number
  name: string
  description: string
  content: Record<string, unknown>
  content_hash: string
  status: ControlPlaneVersionStatus
  source_revision_id?: string | null
  published_at?: string | null
  created_at?: string
  updated_at?: string
  version: number
  binding: AgentBinding | null
}

export type AgentSampleRunReceiptStatus = 'unconfigured' | 'succeeded' | 'failed'
export type AgentSampleRunStatus = AgentSampleRunReceiptStatus | 'unknown'

export interface AgentSampleRunReceipt {
  id: string
  status: AgentSampleRunReceiptStatus
  receipt_hash: string
  request_id: string
  request_hash: string
  agent_revision_id: string
  model_profile_id: string
  prompt_version_id: string
  sample_input_hash: string
  model_id: string
  protocol: ModelProtocol
  catalog_fingerprint: string | null
  provider_invoked: boolean
  response_id: string | null
  raw_response_sha256: string | null
  compiled_prompt_hash: string
  output_schema_hash: string
  params_hash: string
  created_at: string
  error: Record<string, unknown> | null
  integrity_verified: true
}

interface AgentSampleRunResultBase {
  status: AgentSampleRunStatus
  configuration_valid: boolean
  provider_invoked: boolean
  reason: string
  agent_revision_id: string
  content_hash: string
  params_hash: string
  sample_input_hash: string
  receipt: AgentSampleRunReceipt
}

export interface AgentSampleRunUnconfiguredResult extends AgentSampleRunResultBase {
  status: 'unconfigured'
  provider_invoked: false
  output?: never
}

export interface AgentSampleRunSucceededResult extends AgentSampleRunResultBase {
  status: 'succeeded'
  configuration_valid: true
  provider_invoked: true
  output: unknown
}

export interface AgentSampleRunFailedResult extends AgentSampleRunResultBase {
  status: 'failed'
  provider_invoked: boolean
  output?: never
}

export interface AgentSampleRunUnknownResult extends AgentSampleRunResultBase {
  status: 'unknown'
  provider_invoked: true
  automatic_retry_permitted: false
  receipt: AgentSampleRunReceipt & { status: 'failed'; provider_invoked: true }
  output?: never
}

export type AgentSampleRunResult =
  | AgentSampleRunUnconfiguredResult
  | AgentSampleRunSucceededResult
  | AgentSampleRunFailedResult
  | AgentSampleRunUnknownResult
