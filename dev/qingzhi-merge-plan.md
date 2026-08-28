# 擎智前端 × 流水线架构 × dsh-agent-teams × DeepSeek Harness

对照：

- 产品壳：https://github.com/RichmanDP/qingzhi-design-frontend （React 18 + Vite 6，仅前端，MIT）
- 架构：[agent-pipeline-architecture.md](./agent-pipeline-architecture.md)（一句话出剧本 MVP）
- 队长插件：https://github.com/NanmiCoder/dsh-agent-teams （MIT，DSH 插件）
- 工人运行时：https://github.com/deepseek-ai/DeepSeek-Harness （MIT，developer preview）

公开 GitHub 上没有擎智后端。合并对象是：这个 React 壳 + 尚未开源的 API + LangGraph 工位图 +（二期）DSH 适配器。

不要和 agentscope-ai/agentteams 混为一谈。那是另一套 K8s + Matrix 的 Agent OS。本文的 AgentTeams 一律指 dsh-agent-teams。

## 0. 一句话结论

壳用擎智，图用 LangGraph，队长机制抄 dsh-agent-teams，DSH 只当可插拔工人/队长运行时，不当产品。

- 不要另起第二套 React，也不要把 dsh web :3080 当成办公室。
- 短剧 6 站是固定 SOP（对应插件里的 taskPlanning: seed），禁止让队长现拆 DAG。
- DeepSeek Harness 可以融合，但 MVP 不必挂。真正需要它的是：二期会分叉的队长站，以及需要 bash/fs 的编码站。挂的方式是 API 里的 headless 适配器，不是前端嵌一套 Harness。
- Gate 1 产品名仍叫「锁剧本」；内部拆成 6 个 WorkflowNode / StageRun。不要把 6 站塞回一次 drama.gate1.candidate-pack。

## 1. 四份东西各干什么

- 产品壳：qingzhi-design-frontend。不跑编排、不存密钥、不装 DSH 插件。
- 编排：LangGraph + Postgres checkpointer + interrupt()。不让模型即兴路由；不把 DSH 当 DAG 引擎。
- 工位工人：OpenAI Agents / Claude Agent SDK；二期可选 DSH subagent。工人看不到别站聊天。
- 队长运行时：二期用 DSH headless + dsh-agent-teams。MVP 短剧室不用队长。
- 机制（抄，不嵌）：seed 模板、Approve & Run、attempt 作废、独立审查、失败不解锁下游、活动面板。不抄成员邮箱当交接，不抄「一队长一团队」的租户模型。

DSH 自己的定位是 coding harness：模型、工具、Skill、session、sandbox、loop 全是插件。这和架构「不要把 coding harness 当 DAG 引擎」不冲突：当工人可以，当编排器不行。它还在 developer preview，官方写明会有破坏性变更，所以不能当产品主路径的单一运行时。

## 2. 擎智审查

这个仓库已经是架构要自建的产品壳。

已经对齐、必须保住：Job / StageRun / Artifact / QualityGate / Review / AuditEvent；AgentRevision + AgentBinding（model + prompt + skill_ids + output_schema）；Idempotency-Key、expected_run_revision；Job SSE + Last-Event-ID；Mock 不能升级成实跑；unknown 禁止自动重试；发布 platform_api_called: false；prepare → 显式 execute → materialize → 人审。

必须改的冲突：现前端 Gate 1 由单一 Agent drama.gate1.candidate-pack 一次物化六份文档。架构是选题 → 文化 → 编剧 → 编辑 → 去AI味 → 评分。Gate 1 作为产品门保留，内部拆成 6 个 StageRun。

页面写死 GATE1 剧本锁 / GATE2 资产 / GATE3 成片。MVP 只出剧本。GATE2/3 继续展示未批准，不删，不阻塞锁稿。

冻结试制是 US / en-US / 3×60s / 9:16。MVP 是一句话 + 目标地区。DramaRunSpec 当目标卡。选题官检索灵感库最多 8 条，Codex 深拆二期。默认只启用 drama。

JobStatus 前端权威：queued|running|awaiting_review|waiting_children|gate_blocked|paused|done|failed|cancelled。架构 waiting_gate 映射到 awaiting_review 或 gate_blocked；waiting_dep 映射到 waiting_children。不要再发明一套给前端。

结构债：DramaWorkspacePage.tsx 过大，按面板拆，路由仍是 /drama；短剧 NewTask 走 DramaRunSpec 不走国内内容矩阵格子。

## 3. 从 dsh-agent-teams 抄什么

插件怎么跑：当前 DSH 会话变成队长 → 拉可续聊子 Agent → 任务带依赖 → 共享调度器按 running/idle/ready 原子领取 → attempt_id 作废迟到写入 → 归档 workspace/.agent-teams/。

两种规划：
- taskPlanning: seed = YAML 写死成员 + 任务依赖。这就是短剧 SOP。
- taskPlanning: captain = 只给阵容和门禁，队长按目标现画 DAG。这是二期三资产并行。

执行前先 staged：不 spawn、不领任务，人点 Approve & Run 才开工。质量 kind：requirements → implementation → verification → review → integration。review 只有 verdict=pass 才能 completed。needs_revision 自动建不依赖 failed review 的 repair + 下一轮独立 review。超轮次 escalated 给人。

必抄到擎智对象：
- seed profile → WorkflowDefinition，6 个 agent_key：drama.topic / drama.culture / drama.script / drama.script-editor / drama.script-deslop / drama.script-score
- staged → Approve & Run → GATE-选题（选 DIR）和 NewTask 确认
- pending → claimed → in_progress → completed|failed|cancelled → StageRun.status；claimed 不能直接 completed
- attempt_id 转派先作废 → expected_run_revision / CAS
- failed 永不解锁下游 → schema 失败同站重试；评分 revise 只回编辑
- 审查者不能给自己的实现标 pass → 评分官独立 context；去AI味和评分禁止并成一个 AgentRevision
- repair 不依赖 failed review，终态只读，下一轮新建 → 回炉新建 StageRun 版本
- maxReviewRounds → 评分最多回编辑两轮，第三轮 hold 进 GATE-锁稿
- halt 必须显式 resume(reason) → Job paused
- coverage matrix → 出站目标对齐
- spawn 快照 provider/model → AgentBinding 开跑钉死
- 活动面板成员树 + DAG + 运行中标模型 → 拆 DramaWorkspacePage，直播走 Job SSE，不要 1s 轮询磁盘
- 归档 → DocumentLedger + AuditEvent

明确不抄：
- 成员邮箱当交接（架构禁止 messages[]）
- 队长现拆短剧 6 站
- 一队长一团队 / 文件级状态 / 单进程锁（产品是多租户工单，状态在 Postgres）
- 成员默认拥有完整 bash/fs
- 把几个 Agent 都说 OK 当完成
- DSH 活动浮层、小鲸鱼当办公室 UI

## 4. DeepSeek Harness 怎么融合（三档，默认 L0）

L0 MVP（默认，不跑 DSH）：LangGraph 6 节点 + 两处 interrupt。工人用 OpenAI Agents / Claude Agent SDK 加载 AI_Movie_Skills 的 SKILL.md。擎智前端只打 /api/v1。理由：DSH 仍是 developer preview；文件态、一队长一团队、成员带 bash，都和工单/租户/SSE 不合。短剧 SOP 用 seed 图就够。

L1 工位运行时适配器（P4，或编码站先做）：AgentBinding 增加 runtime = openai-agents | claude-agent-sdk | dsh-subagent。API 侧 DshRuntimeAdapter 为该站开 headless 会话（dsh --profile headless），注入本站 SOP + 目标卡 + 交接包，禁止注入别站 transcript。产物仍写对象存储。DSH 官方可选 bundle：dsh-subagent-codex / dsh-subagent-claude-code，只给编码站，不要给选题官/编剧。

L2 队长站（二期，角色/场景/道具并行）：某站 kind=captain 时，API 拉起 headless DSH，装 @nanmicoder/dsh-agent-teams。映射：team.json 任务 ↔ StageRun；Approve & Run ↔ QualityGate；attempt_id ↔ expected_run_revision。前端仍渲染擎智的队长活动面板，不 iframe :3080。Job 的 cursor 必须在我们 DB：插件写明队长离线不能冷恢复成员。

不要做的融合：用 DSH Web UI 替换 Dashboard / DramaWorkspace / ControlPlane；把 6 站编剧室跑成一个 /agent-teams 会话；在 MIT 前端仓提交 DSH 配置、API Key、.agent-teams/；让前端直接调 agent_teams_* 工具。

## 5. 对象与状态映射

- 架构 Job = 擎智 Job + DramaRun = 插件 Team（产品以 Job 为准）
- StationDef = WorkflowNode = profile member + seed task
- StationRun = StageRun = Task + attempt
- 目标卡 = Job.brief + DramaRunSpec
- 交接包 = Artifact.summary + URI（不用 mailbox）
- Skill 钉版本 = SkillVersion → AgentBinding
- interrupt 拍板 = Review + gates approve = Approve & Run / halt+resume
- 灵感库 = 新只读 API，选题官最多 8 条

状态对照（写进 types.ts 注释，前端枚举不动）：
- queued → queued
- running → running
- waiting_gate → awaiting_review 或 gate_blocked
- waiting_dep → waiting_children
- paused → paused
- delivered → done
- failed → failed
- cancelled → cancelled

## 6. 开发计划

P0 契约冻结（约 3 天）：OpenAPI 增量 6 站 schema；状态对照写进 types.ts；DramaRunSpec 增加 locale、localization_axis、可选 inspiration_ids；AgentBinding 预留 runtime，默认 openai-agents，P0 不接 DSH；StageRun 补 attempt_id 或文档写明与 expected_run_revision 等价。验收 pnpm test && pnpm run lint 仍绿。

P1 后端主路径（约 10–14 天）：LangGraph 6 节点 + 两处 interrupt；每节点 CAS → 加载快照 → 只喂目标卡+交接包 → schema 校验 → DocumentVersion + receipt；选题官接 western-microdrama-500.json 最多 8 条；评分 revise 只回编辑最多两轮，回炉新建 StageRun；停用 gate_1_draft_pack 一次物化。验收：同一句简报连开 3 单都停在锁稿；编剧上下文看不到灵感库全文和评分推理。

P2 前端（约 7–10 天）：拆 DramaWorkspacePage 为 Spec / StationCursor / Handoff / Gate1LockForm / DocumentLedger / ReleaseEvidence。工单位点绑 stage_runs，运行中标模型短名。选题 interrupt 三张 DIR 卡 + 钩子三字段，交互对标 Approve & Run。去AI味：命中清单 + before/after。评分只读。industry=drama 的 NewTask 改用短剧目标卡。控制面预置 6 个 published AgentRevision。数据走 Job SSE。没有后端时诚实 EmptyState。

P3 MVP 收口（约 5 天）：默认只启用 drama；GATE2/3、LibTV、发布证据默认折叠；评分硬门槛含可解释的 AI 味模式命中；映射表补进架构文档。

P4 二期（这时融合 DSH 才有必要）：DshRuntimeAdapter（headless，隔离 workspace，密钥不进前端仓）；编码站可挂 dsh-subagent-codex / claude-code；kind=captain 站装 dsh-agent-teams 做三资产并行；导演/拆镜/GATE2/3 真实媒体。

P1 期间若要给 DSH 预留风险，只做半天 spike：headless 跑通一次 agent_teams_create 并把 team.json 投影成假 StageRun。不进主路径，失败就停。

## 7. 明确不做

- 不把 LangGraph 写进 Vite，也不把 DSH 写进 Vite
- 不把 500 条灵感 logline dump 进任何 StageRun
- 不把评分官和去AI味并成一个 AgentRevision
- 不用页面 mandatoryGates 常量冒充服务端已批准
- 不在这个 MIT 前端仓库提交密钥、SQLite、.agent-teams/、DSH profile
- 不让 mailbox / 队长读完再意译成为站间传输层
- 不把 developer preview 的 DSH 当成租户级编排器
