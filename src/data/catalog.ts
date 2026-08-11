import type { ApprovalMode, Industry, WorkflowNode } from '../types'

export const industryMeta: Record<string, { label: string; short: string; color: string; glyph: string; eyebrow: string }> = {
  content: { label: '内容生产部', short: '内容', color: '#16233B', glyph: '文', eyebrow: 'CONTENT STUDIO' },
  marketing: { label: '营销部', short: '营销', color: '#C19A3D', glyph: '增', eyebrow: 'GROWTH TOOLKIT' },
  medical: { label: '医疗器械产业部', short: '医疗器械', color: '#2E6E8E', glyph: '械', eyebrow: 'MEDTECH' },
  drama: { label: 'AI短剧产业部', short: 'AI短剧', color: '#8E2E5E', glyph: '剧', eyebrow: 'AI DRAMA' },
  consulting: { label: 'AI咨询产业部', short: 'AI咨询', color: '#2E5E4A', glyph: '谋', eyebrow: 'CONSULTING' },
  taoism: { label: '传统文化产业部', short: '传统文化', color: '#6B5B3E', glyph: '道', eyebrow: 'CULTURE' },
  avatar: { label: '数字人摄影棚', short: '数字人', color: '#4A4E8E', glyph: '影', eyebrow: 'DIGITAL HUMAN' },
  culture_legal: { label: '文化法务部', short: '文化法务', color: '#7A3B2E', glyph: '法', eyebrow: 'CULTURE & LEGAL' },
}

export const approvalModes: Array<{ id: ApprovalMode; name: string; description: string; unavailableFor?: Industry[] }> = [
  { id: 'key', name: '关键审批', description: '在选题、初稿、视觉与外发前停下，默认推荐。' },
  { id: 'managed', name: '完全托管', description: '连续生成到交付包，行业质检和最终签发仍强制执行。' },
  { id: 'automatic', name: '全自动', description: '仅在最终外发前终审；医疗高风险、咨询签发、传统文化敏感任务与文化法务签发任务禁用。', unavailableFor: ['medical', 'consulting', 'taoism', 'culture_legal'] },
  { id: 'every_stage', name: '逐站审批', description: '每个启用节点均需人工通过，控制最细。' },
]

export interface RoleSeed {
  code: string
  name: string
  glyph: string
  group: string
  description: string
  nodeType?: 'serial' | 'parallel' | 'optional' | 'human' | 'gate'
}

export interface DepartmentSeed {
  industry: Industry
  title: string
  headline: string
  description: string
  note: string
  roles: RoleSeed[]
  flow: WorkflowNode[]
}

const contentRoles: RoleSeed[] = [
  ['CT-01', '趋势官', '趋', '热点雷达部 · 工位 1', '扫描已选渠道，筛出适合当日发布的候选选题。'],
  ['CT-02', '情报员', '情', '情报检索部 · 工位 2', '联网检索并核实事实、数据和可引用来源。'],
  ['CT-03', '拆解师', '拆', '爆款研究部 · 工位 3', '拆解标题、钩子、结构节奏与转化路径。'],
  ['CT-04', '撰稿人', '撰', '文案创作部 · 工位 4', '基于情报和结构化输入生成平台适配初稿。'],
  ['CT-05', '文风师', '风', '风格工坊 · 工位 5', '按品牌调性和行业语感改稿并生成新版本。'],
  ['CT-06', '多媒体师', '媒', '视觉工厂 · 工位 6', '准备带授权与来源记录的视觉素材。'],
  ['CT-07', '封面师', '封', '封面设计部 · 工位 7', '生成封面和排版方案，并保留素材版本。'],
  ['CT-08', '演绎师', '绎', '互动演绎部 · 工位 8', '按需转互动稿或数字人口播任务。', 'optional'],
  ['CT-09', '分发官', '发', '发行调度部 · 工位 9', '生成多平台发布包；真实外发必须再次确认。'],
  ['CT-10', '复盘官', '复', '数据复盘部 · 工位 10', '按 T+1/3/7 汇总数据、风险和下一步行动。'],
].map(([code, name, glyph, group, description, nodeType]) => ({ code, name, glyph, group, description, nodeType } as RoleSeed))

const role = (code: string, name: string, glyph: string, group: string, description: string, nodeType?: RoleSeed['nodeType']): RoleSeed => ({ code, name, glyph, group, description, nodeType })

export const departments: Record<string, DepartmentSeed> = {
  content: {
    industry: 'content', title: '内容生产部', headline: '10 工位流水线，一键出多平台成品。',
    description: '从热点到复盘完整接力，中间设置独立合规门禁；每个节点交付结构化、可追溯、可版本化的产物。',
    note: '10 工位状态与日志均来自 StageRun，不再维护页面演示状态。', roles: contentRoles,
    flow: contentRoles.map((item, index) => ({ id: item.code, name: item.name, glyph: item.glyph, type: item.nodeType ?? 'serial', depends_on: index ? [contentRoles[index - 1].code] : [] })),
  },
  medical: {
    industry: 'medical', title: '医疗器械产业部', headline: '注册、临床、体系、准入，全链合规兜底。',
    description: '法规、注册、适用范围和比较性结论必须可追溯；高风险内容只能更正依据和内容后重新质检。',
    note: '统一为 13 岗、4 组；高风险 Gate 在服务端和交付出口均不可 override。',
    roles: [
      role('RA-01', '注册专员', '注', '注册法规组', '规划二/三类注册路径、注册资料与核查工作。'),
      role('RA-02', '法规研究员', '规', '注册法规组', '追踪 NMPA 新规、指导原则和审评动态。'),
      role('RA-03', '临床评价专员', '临', '注册法规组', '设计临床评价路径、同品种比对与试验方案。'),
      role('RA-04', '体系工程师', '系', '注册法规组', '维护 ISO 13485/GMP 体系与迎检准备。'),
      role('QM-01', 'QA 工程师', '质', '质量与生产组', '负责质量控制、偏差/CAPA 与供应商审核。'),
      role('QM-02', '验证工程师', '验', '质量与生产组', '负责工艺、清洁、软件及灭菌验证。'),
      role('QM-03', '风险管理专员', '险', '质量与生产组', '维护 ISO 14971 风险文档与上市后监测。'),
      role('MA-01', '市场准入专员', '入', '市场与准入组', '梳理挂网、入院与渠道准入策略。'),
      role('MA-02', '招投标专员', '标', '市场与准入组', '监测招标、编制标书并管理资质。'),
      role('MA-03', '医保物价专员', '保', '市场与准入组', '对接医保目录、收费编码和支付政策。'),
      role('MS-01', '学术专员', '学', '学术与推广组', '在有效依据范围内整理学术资料和产品卖点。'),
      role('MS-02', '临床推广专员', '推', '学术与推广组', '准备合规科室会材料与使用培训。'),
      role('MS-03', 'KOL 运营专员', 'K', '学术与推广组', '管理合规专家合作和学术内容共创。'),
    ],
    flow: [
      { id: 'med-intake', name: '资料受理', glyph: '受', type: 'human' },
      { id: 'med-regulatory', name: '法规检索', glyph: '规', type: 'serial', depends_on: ['med-intake'] },
      { id: 'med-evidence', name: '证据核验', glyph: '证', type: 'parallel', depends_on: ['med-intake'] },
      { id: 'med-draft', name: '专业草案', glyph: '案', type: 'serial', depends_on: ['med-regulatory', 'med-evidence'] },
      { id: 'med-gate', name: '医疗门禁', glyph: '检', type: 'gate', depends_on: ['med-draft'] },
      { id: 'med-sign', name: '专家签发', glyph: '签', type: 'human', depends_on: ['med-gate'] },
      { id: 'med-delivery', name: '受控交付', glyph: '交', type: 'serial', depends_on: ['med-sign'] },
    ],
  },
  drama: {
    industry: 'drama', title: 'AI短剧产业部', headline: '从选题到发行的短剧生产线。',
    description: '题材、剧本、分镜、画面、配音、剪辑和投流形成可恢复 DAG；版权与导向红线独立过检。',
    note: '服化道设计师在分镜后并行，平台运营在发行阶段并行，12 岗均进入工作流。',
    roles: [
      role('DR-01', '题材策划', '题', '策划组', '筛选题材、受众、平台和商业化方向。'),
      role('DR-02', '剧本编剧', '编', '策划组', '产出分集大纲、剧本与钩子节奏。'),
      role('DR-03', '分镜师', '镜', '策划组', '拆解镜头、景别、动作、对白与时长。'),
      role('DR-04', '人设设计师', '人', '策划组', '冻结角色档案、关系与视觉一致性。', 'parallel'),
      role('DR-05', '画面生成师', '画', '制作组', '按分镜和角色资产生成可追溯画面。'),
      role('DR-06', 'AI 配音师', '声', '制作组', '管理角色音色授权、对白和情绪。', 'parallel'),
      role('DR-07', '剪辑师', '剪', '制作组', '合成画面、声音、字幕和节奏。'),
      role('DR-08', '服化道设计师', '服', '制作组', '在分镜后并行冻结服装、造型和道具。', 'parallel'),
      role('DR-09', '投流优化师', '投', '发行组', '设计可测量的素材与投放实验。'),
      role('DR-10', '平台运营', '运', '发行组', '生成平台适配的标题、封面和运营计划。', 'parallel'),
      role('DR-11', '版权合规专员', '权', '发行组', '核验版权、肖像授权和内容导向。', 'gate'),
      role('DR-12', '数据分析师', '数', '发行组', '复盘留存、完播、转化和成本。'),
    ],
    flow: [
      { id: 'dr-topic', name: '题材策划', glyph: '题', type: 'serial' },
      { id: 'dr-script', name: '剧本编写', glyph: '编', type: 'serial', depends_on: ['dr-topic'] },
      { id: 'dr-storyboard', name: '分镜', glyph: '镜', type: 'serial', depends_on: ['dr-script'] },
      { id: 'dr-character', name: '人设/服化道', glyph: '设', type: 'parallel', depends_on: ['dr-storyboard'] },
      { id: 'dr-visual', name: '画面生成', glyph: '画', type: 'serial', depends_on: ['dr-storyboard', 'dr-character'] },
      { id: 'dr-voice', name: 'AI 配音', glyph: '声', type: 'parallel', depends_on: ['dr-script'] },
      { id: 'dr-edit', name: '剪辑合成', glyph: '剪', type: 'serial', depends_on: ['dr-visual', 'dr-voice'] },
      { id: 'dr-gate', name: '版权/导向质检', glyph: '检', type: 'gate', depends_on: ['dr-edit'] },
      { id: 'dr-release', name: '投流/平台运营', glyph: '发', type: 'parallel', depends_on: ['dr-gate'] },
      { id: 'dr-review', name: '数据复盘', glyph: '数', type: 'serial', depends_on: ['dr-release'] },
    ],
  },
  consulting: {
    industry: 'consulting', title: 'AI咨询产业部', headline: '出方案，更陪落地。',
    description: '行业研究、商业分析、方案设计和落地陪跑形成证据驱动的咨询交付；高风险建议必须人工签发。',
    note: '咨询不承诺经营结果；单位经济性和事实性结论均保留来源与假设。',
    roles: [
      role('CS-01', '战略顾问', '略', '战略组', '设计定位、增长路径、竞争战略与商业模式。'),
      role('CS-02', '行业研究员', '研', '战略组', '核实行业规模、格局、趋势与政策。'),
      role('CS-03', '商业分析师', '析', '战略组', '完成财务建模、单位经济和敏感性分析。'),
      role('CS-04', '运营顾问', '营', '运营组', '把战略落成增长、用户和活动运营动作。'),
      role('CS-05', '流程优化顾问', '程', '运营组', '识别流程卡点与浪费并设计提效方案。'),
      role('CS-06', '组织发展顾问', '组', '运营组', '设计组织、岗位、绩效和激励。'),
      role('CS-07', '数字化转型顾问', '数', '数字组', '评估成熟度并制定转型路线图。'),
      role('CS-08', 'AI 落地架构师', 'AI', '数字组', '识别场景并设计 Agent 与人机协作。'),
      role('CS-09', '数据治理顾问', '治', '数字组', '盘点数据资产与质量安全体系。'),
      role('CS-10', '落地陪跑教练', '陪', '数字组', '持续复盘、答疑和纠偏。'),
    ],
    flow: ['需求诊断', '行业研究', '商业分析', '方案设计', '风险反证', '专家签发', '落地路线', '陪跑复盘'].map((name, index) => ({ id: `cs-${index + 1}`, name, glyph: name[0], type: index === 5 ? 'human' : 'serial', depends_on: index ? [`cs-${index}`] : [] })),
  },
  taoism: {
    industry: 'taoism', title: '传统文化产业部', headline: '以文化研究与内容创作立身。',
    description: '以典籍、民俗、建筑与历法的文化研究为边界，不提供算命、改运、驱邪或健康/财务结果承诺。',
    note: '敏感表述命中后必须改写为可核实的文化知识，不以免责声明代替修正。',
    roles: [
      role('TA-01', '易学研究员', '易', '文化研究组', '研究《周易》的文化内涵和哲学思想。'),
      role('TA-02', '道教典籍研究员', '籍', '文化研究组', '对经典进行通俗、现代的文化阐释。'),
      role('TA-03', '堪舆文化顾问', '舆', '文化研究组', '从建筑与环境美学讲解堪舆文化。'),
      role('TA-04', '传统历法顾问', '历', '文化研究组', '讲解节气、干支历法和民俗由来。'),
      role('TA-05', '文化内容撰稿', '撰', '内容创作组', '把研究写成有网感但不玄乎的内容。'),
      role('TA-06', '文创策划', '创', '内容创作组', '策划国风文创、节气礼盒和符号 IP。'),
      role('TA-07', 'IP 人设运营', 'IP', '内容创作组', '运营文化类 IP 与内容矩阵。'),
      role('TA-08', '课程讲师', '讲', '内容创作组', '把研究成果组织为知识课程与专栏。'),
      role('TA-09', '内容合规专员', '规', '服务合规组', '核查迷信渲染、承诺和诱导性付费。', 'gate'),
      role('TA-10', '用户服务顾问', '服', '服务合规组', '做边界说明和正向文化兴趣引导。'),
    ],
    flow: ['需求边界', '典籍/民俗检索', '来源核验', '文化解读', '内容创作', '敏感表述质检', '人工复核', '文化交付'].map((name, index) => ({ id: `ta-${index + 1}`, name, glyph: name[0], type: index === 5 ? 'gate' : index === 6 ? 'human' : 'serial', depends_on: index ? [`ta-${index}`] : [] })),
  },
  avatar: {
    industry: 'avatar', title: '数字人摄影棚', headline: '授权完成后，文案才能转成数字人口播。',
    description: '形象、声音、视频与动作驱动均绑定授权主体、用途、有效期和撤销记录；未授权时服务端拒绝生成。',
    note: '本地候选版保存授权、脚本与任务链；真实视频供应商连接器默认关闭。',
    roles: [
      role('AV-01', '形象设计师', '形', '摄影棚', '管理照片、形象方案与授权范围。'),
      role('AV-02', '声音克隆师', '声', '摄影棚', '管理声音样本、用途和有效期。'),
      role('AV-03', '口播视频制作师', '播', '摄影棚', '把验收稿组织为可生成的视频任务。'),
      role('AV-04', '动作驱动师', '驱', '摄影棚', '管理口型、手势、表情和动作参数。'),
      role('AV-05', '直播分身运营师', '直', '摄影棚', '管理直播分身的合规标识与人工接管。'),
    ],
    flow: ['授权核验', '形象准备', '声音准备', '口播稿验收', '动作驱动', '视频生成', '结果预览', '交付确认'].map((name, index) => ({ id: `av-${index + 1}`, name, glyph: name[0], type: index === 0 || index === 7 ? 'human' : 'serial', depends_on: index ? [`av-${index}`] : [] })),
  },
  culture_legal: {
    industry: 'culture_legal', title: '文化法务部', headline: '先懂当地人，再让内容安全落地。',
    description: '调研欧洲、美国、日本等目标区域的世代偏好、流行趋势与文化特点，为剧本、歌曲等内容提供创作输入；同时扫描当地法规、平台规则与内容红线，高风险命中不可 override，必须由法务专家签发。',
    note: '区域偏好、流行信号与合规结论必须保留来源与有效期；跨境红线命中后只能修改并重新质检，法务签发与最终交付绑定。',
    roles: [
      role('CL-01', '区域文化研究员', '研', '文化调研组', '按国家/区域梳理文化生态、价值观、节庆与内容消费习惯。'),
      role('CL-02', '世代偏好分析师', '代', '文化调研组', '按 Z 世代、千禧、X 世代等年龄段拆分内容偏好与触媒习惯。'),
      role('CL-03', '流行趋势观察员', '势', '文化调研组', '追踪目标区域当下流行题材、音乐、梗与平台热点，并记录信号来源。'),
      role('CL-04', '内容偏好画像师', '像', '文化调研组', '综合世代与趋势，输出目标用户喜欢的内容类型、题材与形式画像。'),
      role('CL-05', '文化特点译写师', '译', '文化调研组', '把文化特点翻译成剧本、歌曲等创作要点与本地化改编建议。'),
      role('CL-06', '目标市场合规研究员', '规', '法务合规组', '梳理目标市场的内容法规、广告法、分级与平台审核规则。'),
      role('CL-07', '内容安全法务专员', '安', '法务合规组', '识别仇恨歧视、未成年人保护、宗教禁忌等区域内容红线。', 'gate'),
      role('CL-08', '版权与授权法务', '权', '法务合规组', '核验素材、音乐、字体与二创在目标区域的版权与授权链条。'),
      role('CL-09', '区域发行法务顾问', '行', '法务合规组', '评估发行渠道、营销话术与抽奖促销在当地的合规要求。'),
      role('CL-10', '跨境内容监制', '签', '法务合规组', '汇总调研与法务结论，对跨境内容进行签发把关。', 'human'),
    ],
    flow: [
      { id: 'region_research', name: '区域文化生态调研', glyph: '研', type: 'serial' },
      { id: 'generation_profile', name: '世代偏好画像', glyph: '代', type: 'parallel', depends_on: ['region_research'] },
      { id: 'trend_scan', name: '流行趋势扫描', glyph: '势', type: 'parallel', depends_on: ['region_research'] },
      { id: 'content_preference', name: '内容偏好与文化特点综合', glyph: '像', type: 'serial', depends_on: ['generation_profile', 'trend_scan'] },
      { id: 'legal_scan', name: '目标市场法规扫描', glyph: '规', type: 'serial', depends_on: ['content_preference'] },
      { id: 'localization', name: '本地化创作要点译写', glyph: '译', type: 'optional', depends_on: ['content_preference'] },
      { id: 'compliance', name: '跨境内容安全法务质检', glyph: '检', type: 'gate', depends_on: ['legal_scan', 'localization'] },
      { id: 'legal_sign', name: '法务专家签发', glyph: '签', type: 'human', depends_on: ['compliance'] },
    ],
  },
}

export const marketingTools = [
  { id: 'daily-trends', glyph: '热', name: '今日必发', description: '扫描指定渠道，给出带来源的三个当日选题候选。', cost: '成本按实际记录' },
  { id: 'private-calendar', glyph: '历', name: '私域日历', description: '生成整月朋友圈与社群排期，并进入审批草稿。', cost: '不预设点价' },
  { id: 'competitor-watch', glyph: '盯', name: '竞品盯梢', description: '按计划汇总竞品公开动作、证据和差异化建议。', cost: '不预设点价' },
  { id: 'account-launch', glyph: '起', name: '起号军师', description: '生成 30 天定位、人设、内容和复盘任务。', cost: '不承诺涨粉结果' },
  { id: 'lead-radar', glyph: '线', name: '线索雷达', description: '从已授权来源提取线索，保留来源和处理状态。', cost: '需连接器' },
  { id: 'product-creative', glyph: '图', name: '产品图文案', description: '把授权素材转成图文brief和文案任务。', cost: '成本按实际记录' },
  { id: 'spoken-matrix', glyph: '播', name: '口播矩阵', description: '将验收稿改编成多个平台的口播脚本。', cost: '可联动数字人' },
  { id: 'video-remix', glyph: '剪', name: '视频混剪', description: '将有版权记录的素材组织成混剪任务。', cost: '需视频连接器' },
]

export const jobStatusLabel: Record<string, string> = {
  queued: '排队中', running: '进行中', awaiting_review: '待审批', waiting_children: '等待子任务', gate_blocked: '质检拦截', paused: '已暂停', done: '已完成', failed: '失败', cancelled: '已取消',
}

export const stageStatusLabel: Record<string, string> = {
  queued: '排队中', running: '进行中', awaiting_review: '待审批', done: '已完成', failed: '失败', interrupted: '已中断', rejected: '已退回', stale: '待重算', skipped: '已跳过',
}
