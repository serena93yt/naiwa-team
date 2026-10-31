// ===== TikBoost AI · 全站文案与模拟数据（全新撰写） =====

export const PRODUCT = {
  name: 'TikBoost AI',
  tagline: '东南亚五国 TikTok 运营智能体',
  subtitle:
    '面向印尼、泰国、越南、菲律宾、马来西亚中小卖家，一键生成多语种子草文案，并自动预检平台合规，避开限流封号雷区。',
  cta: '把“本地化难 / 重复产出高 / 踩雷封号”三道关卡，交给一个智能体。',
}

export const PAIN_POINTS = [
  {
    title: '本地化难',
    desc: '小语种脚本、俚语表达、宗教与文化禁忌难以把握，一条视频反复改仍踩雷。',
  },
  {
    title: '重复产出高',
    desc: '日更 / 周更压力大，人工写稿效率低、账号间风格难统一，团队被内容产能拖住。',
  },
  {
    title: '踩雷封号',
    desc: '平台规则多变，违禁词、夸大宣传、类目限制一碰就触发限流甚至封号，损失不可逆。',
  },
]

export const COUNTRIES = [
  { code: 'ID', name: '印度尼西亚', lang: '印尼语', note: '穆斯林市场，忌酒精/猪肉暗示' },
  { code: 'TH', name: '泰国', lang: '泰语', note: '皇室与宗教敏感，语气需礼貌' },
  { code: 'VN', name: '越南', lang: '越南语', note: '价格与功效宣称审查较严' },
  { code: 'PH', name: '菲律宾', lang: '英语', note: '英语为主，娱乐化表达接受度高' },
  { code: 'MY', name: '马来西亚', lang: '英语 / 马来语', note: '多元族群，避免种族宗教指向' },
]

export const WORKFLOWS = [
  {
    key: 'generate',
    title: '工作流一 · 种草内容生成',
    desc: '输入商品、类目与目标国，生成适配当地语言与平台调性的标题、口播脚本与话题标签。',
    points: ['多语言脚本', '本地化俚语', '平台调性适配'],
  },
  {
    key: 'compliance',
    title: '工作流二 · 合规预检',
    desc: '粘贴待发文案，自动扫描违禁词、夸大宣传与类目限制，给出风险等级与修改建议。',
    points: ['违禁词扫描', '风险分级', '修改建议'],
  },
]

// 量化指标（原型模拟口径，用于演示评测维度）
export const METRICS = [
  { label: '平均生成耗时', value: 2.4, unit: '秒 / 条', pct: 88 },
  { label: '合规命中率', value: 96.5, unit: '%', pct: 96 },
  { label: '五国覆盖率', value: 100, unit: '%', pct: 100 },
  { label: '支持语言数', value: 6, unit: '种', pct: 75 },
  { label: '规则库条目', value: 1240, unit: '条', pct: 62 },
  { label: '累计测试用例', value: 380, unit: '个', pct: 70 },
]

// 商业模式画布
export const BUSINESS = {
  customers: '东南亚五国 DTC / 白牌中小卖家、MCN 与代运营团队',
  value: '把“选题—本地化生成—合规预检—分发微测”做成闭环，降低封号与试错成本',
  revenue: [
    { name: '基础订阅', desc: '按账号数月付，覆盖生成与预检额度' },
    { name: '按量抽佣', desc: '带货成交 GMV 分成（飞轮闭环）' },
    { name: '增值服务', desc: '多账号矩阵管理、品牌词库、人工复核' },
  ],
  cost: '多语言模型推理、规则库维护、合规更新人力',
  channel: 'TikTok 创作者社群、跨境服务商、SaaS 应用市场',
  advantage: '规则引擎保底 + LLM 增强，先稳后智，现场零依赖可演示',
}

// 团队分工（A/B/C/D）
export const TEAM = [
  {
    role: 'A · 产品设计',
    name: '产品 / 交互',
    deliver: '信息架构、两工作流原型、Demo 交互与视觉规范',
  },
  {
    role: 'B · 代码实现',
    name: '前端 / 工程',
    deliver: 'Web 原型、生成与预检逻辑、模拟/真实开关、构建上线',
  },
  {
    role: 'C · 内容运营',
    name: '内容 / 本地化',
    deliver: '五国文案模板、违禁词与规则库、话术样本',
  },
  {
    role: 'D · 路演答辩',
    name: '叙事 / 商业',
    deliver: '路演材料、量化指标口径、商业模式与答辩口径',
  },
]

// 选题演化时间线（呼应项目档案）
export const TIMELINE = [
  { when: '阶段 1', what: '五个研究方向探索（早期 B2B 选题）', tag: '已弃用' },
  { when: '阶段 2', what: '收敛为「外贸 AI 智能体」询盘背调 + 报价', tag: '已弃用' },
  { when: '阶段 3', what: '三个方向对比与选型，锁定 TikTok 东南亚', tag: '选型' },
  { when: '阶段 4', what: 'TK 运营智能体参赛方案（原版）', tag: '主线' },
  { when: '阶段 5', what: 'TK 方案 (2) 更新版：新增「飞轮」分发 + 微测', tag: '当前' },
]
