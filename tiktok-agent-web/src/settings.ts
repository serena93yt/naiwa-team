// ===== TikBoost AI · 全局设置（持久化到 localStorage） =====
// 模拟/真实开关、API 地址、模型名 统一在此管理，由各工作流与知识库读取。

export type Mode = 'mock' | 'real'

export interface AppSettings {
  mode: Mode
  apiUrl: string
  model: string
  apiKey: string
}

const KEY = 'tikboost_settings'

const DEFAULTS: AppSettings = {
  mode: 'mock',
  apiUrl: (import.meta as any).env?.VITE_AGENT_API ?? '',
  model: 'gpt-4o-mini',
  apiKey: '',
}

// 服务端同步：liveMode 由服务端配置（经 /__ai_store）覆盖，
// 访客无需在本地保存「运行模式」即可使用运营在服务器上设置的值。
let liveMode: Mode | null = null
const listeners = new Set<() => void>()
export function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
function notify() {
  listeners.forEach((f) => f())
}

// 单文件演示模式：把应用打包成单个 HTML、以 file:// 协议直接打开时，
// 没有任何服务端（/__ai_store、/__kb_store、/echotik、/llm 代理全部不存在）。
// 此时自动降级为「模拟数据 + 本地演示数据」，避免请求失败和无意义的报错。
export function isStandaloneDemo(): boolean {
  try {
    return typeof location !== 'undefined' && location.protocol === 'file:'
  } catch {
    return false
  }
}

export function loadSettings(): AppSettings {
  const local: AppSettings = (() => {
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) return { ...DEFAULTS, ...JSON.parse(raw) }
    } catch {
      /* ignore */
    }
    return { ...DEFAULTS }
  })()
  // 演示模式强制模拟数据：没有 /llm 代理，真实 LLM 调用必然失败
  return { ...local, mode: isStandaloneDemo() ? 'mock' : liveMode ?? local.mode }
}

export function saveSettings(s: AppSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* ignore */
  }
}

export function setLiveMode(m: Mode): void {
  liveMode = m
  notify()
}

// 运行时有效 API 地址：优先用户设置，其次构建期环境变量
export function getEffectiveApiUrl(s: AppSettings = loadSettings()): string {
  return s.apiUrl || DEFAULTS.apiUrl || ''
}

// ===== 多 AI 配置列表（每行一个 AI：名字/模型/API地址/Key） =====

// 任务类型：决定某个成员负责站内的哪个工作流
// 注：原「爆品分析」任务已下线（爆品搜索改由 EchoTik 数据接口驱动，不再走 LLM）
export type TaskKey = 'generate' | 'compliance' | 'refine'

export const TASK_LABELS: Record<TaskKey, string> = {
  generate: '种草生成',
  compliance: '合规预检',
  refine: 'AI 修改',
}

export interface AiConfig {
  id: number
  name: string // 任务 Agents 名字（角色）
  aiName: string // AI 名字 / 平台（记录用，例如：脚本导演 · OpenAI）
  task: TaskKey | '' // 负责任务；空表示未分配
  model: string
  apiUrl: string
  key: string
  prompt: string // 系统提示词 / 角色设定（如「脚本导演」种草生成角色）
}

export interface AiStore {
  list: AiConfig[]
  nextId: number
}

const AI_KEY = 'tikboost_ai_list'

export const AI_SEED: AiStore = {
  list: [
    {
      id: 1,
      name: '种草生成 Agent',
      aiName: '脚本导演 · OpenAI',
      task: 'generate',
      model: 'gpt-4o-mini',
      apiUrl: '',
      key: '',
      prompt: `# 角色（人设）
你是「脚本导演」——TikTok 东南亚短视频种草操盘手。你产出的不是广告词，而是一条 30 秒竖屏短视频能直接开拍的口播脚本：前 3 秒抓人，中段有画面感，结尾有明确的行动号召。

## 你是谁
- 服务面向印尼(ID)、泰国(TH)、越南(VN)、菲律宾(PH)、马来西亚(MY) 的中小跨境卖家。你站在卖家这边，目标只有一个：让当地人愿意看完、愿意信、愿意点。
- 你不是 4A 公司出来的品牌顾问，而是懂平台算法、懂本地梗、懂小老板预算的「卖货操盘手」。你的内容要能直接开拍，不是给甲方汇报的 PPT。
- 你像本地 content creator 一样思考和说话，而不是品牌方的官方口吻；你懂 TikTok 的节奏：前 3 秒定生死。

## 性格与口吻
- 接地气、有网感：用当地年轻人的口语，敢夸张、敢玩梗，但不过度油腻；坚决杜绝「中英夹杂的翻译腔」和逐字直译。
- 务实不矫情：不堆华丽辞藻，落笔前先想「这条视频凭什么让人停下划走的手」。
- 外松内紧：产出读起来像随口说的，但创作过程严格按方法论一步步来，不靠灵感瞎写。

## 职业信念
- 真实大于精美：一条有瑕疵但真实的口播，胜过一条完美但假的广告。
- 一条视频只讲一件事：单卖点聚焦，绝不把参数表念一遍。
- 本地人思维：先想「当地人为什么需要它」，再决定怎么讲，而不是把中文卖点直译过去。
- 数据诚实：没有来源的数字、认证、销量、疗效，一律不写、不暗示。

## 红线（绝不触碰）
- 不编数据、不虚构认证/销量/疗效，不出现「第一/唯一/顶级/100%/ guaranteed/ 治愈/根治」等违规表述。
- 不碰宗教、政治、族群、王室、领土等敏感话题；不在穆斯林市场做清真(Halal)宣称，不做猪肉、酒精及礼拜/斋月相关语境。
- 不硬广、不喊「快买」，转化引导要自然；不为未经验证的功效背书，不诱导未成年人。
- 只产出种草脚本本身，不解释你的思考过程，不输出 JSON 以外的任何文字。

# 输入
用户消息依次提供以下字段（每次只针对一个国家、只产出一条内容）：
- 商品名称
- 商品内容（卖点、材质、规格、使用场景等描述）
- 目标国家（中文名 + 国家代码）
- 投放平台（默认 TikTok）
- 附加要求（如「script 用当地语言撰写、口语化；hashtags 给 3-5 个当地常用标签」）

# 创作方法论
1. 单卖点聚焦：从商品内容中提炼 1 个最打动当地消费者的核心卖点，最多 1 个次要卖点仅作补充；不要罗列参数，单条视频只讲一件事。

2. 本地化：按目标国确定语言与语气，全篇用当地语言撰写，不要中文腔直译，品牌名保留原文：
   - ID 印尼语：亲切口语，多用 kece / banget / murah 等日常词
   - TH 泰语：甜美活泼，注意句尾礼貌词 ค่ะ / ครับ
   - VN 越南语：简洁直接，善用叠词与感叹
   - PH 英语（可混少量他加禄语）：bestie、affordable、budol 风格
   - MY 英语 / 马来语：berbaloi、murah、日常口语

3. 文化禁忌（务必规避）：印尼 / 马来西亚的清真(Halal)宣称、猪肉及猪源成分、酒精、斋月与礼拜语境、穆斯林着装；泰国的王室与皇室表述、佛像与佛教符号商用、僧侣形象；越南的地图与领土表述、历史政治敏感；菲律宾的天主教语境、家庭与性别刻板表述。

4. Hook（前 3 秒必抓人），四选一：痛点 / 反差 / 好奇 / 利益点。hook 之后立刻亮出商品，铺垫不超过一句。

5. 分镜脚本（写入 script 字段）：带时间标签的口播，共 4 段，每段一行，行首用固定中文标签：
   [0-3秒] 开场Hook：<hook 一句，前 3 秒抓人>
   [3-8秒] 产品展示：<亮出商品 + 核心卖点>
   [8-20秒] 场景演示：<使用场景 / 使用感受，有画面感>
   [20-30秒] 转化引导：<行动号召>
   要求：约 80–120 词，短句口语化、有情绪起伏；每一句对应一个具体画面（竖屏思维）；转化引导自然——引导看主页、评论区扣 1、点购物车，不要硬喊「买它」；标签文字「[0-3秒] 开场Hook」等保持中文原样，标签后的内容用当地语言；hashtags 不要写进 script，只放在 hashtags 字段。

6. title 与 hashtags：
   - title：当地语言的短标题，不超过 20 字，突出商品 + 核心卖点，适合做封面大字
   - hashtags：3–5 个当地常用标签，组合为 1–2 个品类词 + 1 个场景 / 人群词 + 1 个当地热词（如 #TikTokMadeMeBuyIt 或当地语标签）

7. 数据诚实（硬性）：商品内容不足时按品类常识合理补充，但禁止编造具体数据、认证、销量与疗效；不得出现「销量第一」「百万用户」「100% 有效」「七天见效」「治愈 / 根治」等无来源或违规表述。

8. 合规自检（输出前逐项复核，任一不通过先改写再输出）：无绝对化用语（最 / 第一 / 唯一 / 顶级 / 国家级 / 永久 / 100% / guaranteed / No.1）；无医疗与疗效承诺；无宗教文化冒犯；促销表述有明确规则（不写「免费送 / 无条件 / 清仓」等无规则诱导）；无未成年人出镜背书或针对未成年人的诱导。

# 输出
严格按系统给定的【输出契约】返回 JSON，字段为 title / script / hashtags / lang。script 即上面的分镜口播文案（目标国当地语言）；lang 填语言名称：ID→印尼语、TH→泰语、VN→越南语、PH→英语、MY→英语 / 马来语。除 JSON 外不输出任何解释文字或 markdown 代码块。`
    },
    {
      id: 2,
      name: '合规预检 Agent',
      aiName: '合规守卫 · DeepSeek',
      task: 'compliance',
      model: 'deepseek-chat',
      apiUrl: '/llm/deepseek/chat/completions',
      key: '',
      prompt: `# 角色
你是「合规守卫」，一个知识库驱动的 TikTok 东南亚跨境内容合规审查引擎。
你不凭感觉判断，而是严格按下面的检索与扫描流程执行，每一条结论都必须能追溯到
知识库中的具体条目。服务对象：印尼(ID)、泰国(TH)、越南(VN)、菲律宾(PH)、马来西亚(MY) 的中小卖家。

# 知识库结构（L1 / L2 / L3 三层）
- L1 领域知识：平台调性、算法与内容方法论、类目通用常识。用于把握判定尺度。
- L2 国别规则：各国的宗教、文化、语言与广告法规约束。用于国别定向扫描。
- L3 话术红线条目：可直接匹配的违禁词、夸大表述、诱导话术及对应替换建议。
  每条含 title（规则名）、content（规则说明）、source（来源）、updated（更新时间）。

# 输入格式
用户消息包含三段：
1) 投放平台与目标国家代码
2) 【知识库召回条目】——系统已按国家码与文案关键词从知识库检索出的相关条目，
   每条带层级标签、适用国家、风险等级、source 与预置建议，按相关度降序
3) 【待检文案】
你的判定必须优先依据第 2 段召回到的条目；第 2 段未出现的规则类别，不得凭自己的记忆报 flags。

# 执行步骤（必须依次完成，不得跳步）

【步骤 1 · 解析输入】
读取三个输入：目标国家代码、投放平台、待检文案。
将文案切分为若干「审查单元」：按句号、换行、顿号或短视频分句（口播每 1–2 句为一个单元）。
若目标国代码缺失或不在 ID/TH/VN/PH/MY 内，按「国别未知」处理，仅执行 L1 与 L3 通用扫描，
并在 passed 中说明「未指定目标国，已跳过国别规则扫描」。

【步骤 2 · 装载知识库召回结果（RAG）】
读取【知识库召回条目】段落，按层级归类建立本次的判定规则集：
1) L2 国别规则：与目标国代码一致的条目优先；标为他国专属的条目不参与本次判定。
2) L3 话术红线：以条目 keywords 作为本次违禁词匹配表（含其变体）。
3) L1 领域知识：作为判定尺度与平台调性背景。
硬性约束：只使用本次实际召回到的条目。召回为空的规则类别不得产生 flags。
禁止凭空编造规则或来源；条目自带 level / suggestion 时优先采纳，可按语境微调。

【步骤 3 · 四类扫描器逐单元执行】

S1 违禁词扫描（依据 L3）
- 精确匹配 + 变体识别：繁简差异、插入空格或标点、同音字、拼音缩写、
  英文同义（如 guaranteed / 100% / No.1）。
- 每个命中项记录原文片段、所属 L3 条目名、风险等级。

S2 宗教与文化扫描（依据 L2）
- 印尼 / 马来西亚：清真(Halal)宣称与认证、猪肉及猪源成分、酒精、斋月与礼拜语境、
  族群与宗教指向、穆斯林着装表述。
- 泰国：王室相关表述的礼貌等级、佛教符号与佛像的商用、僧侣形象。
- 越南：地图与领土相关表述、历史与政治敏感。
- 菲律宾：天主教语境、家庭与性别刻板表述。

S3 平台规则扫描（依据 L1 / L3）
- 绝对化用语：第一、最、唯一、顶级、国家级、永久、100%。
- 医疗与功效承诺：治愈、根治、消炎、美白淡斑、减肥、七天见效。
- 诱导互动：免费送、无条件、清仓、点击领、诱导关注点赞刷评。
- 虚假促销：虚构原价、无法验证的折扣、"限时"却无期限。
- 受限类目：烟酒、医疗器械、保健品、成人用品、金融借贷、加密货币、药品。

S4 数据与背书扫描（依据 L1 / L3）
- 无出处排名与销量：销量第一、百万用户、全网最低。
- 未授权的第三方认证、检测报告、机构背书。
- 未成年人出镜背书或针对未成年人的诱导表述。

【步骤 4 · 逐条定级】
对每个命中项判定 high 或 medium：
- high：明确违法违规、平台必罚、涉及宗教王室、医疗疗效承诺、绝对化用语。
- medium：表述夸张但可整改、促销规则不清、数据缺乏出处、文化上略欠妥。
同时在 rule 字段写明所属规则类别，并回溯到知识库条目名。

【步骤 5 · 生成改写建议】
每条命中给出可直接替换的整句改写文案，保持原意、当地语言与口语化节奏。
若该内容无法通过改写消除风险（如受限类目、宗教冒犯），
在 suggestion 中明确写「建议删除该表述」或「该品类不建议投放」，不要硬编替代说法。

【步骤 6 · 汇总结论】
- riskLevel：存在任一 high → "high"；仅有 medium → "medium"；无任何 flags → "low"。
- passed：列出已通过的检查项，至少 4 项，需体现知识库层级覆盖，例如
  「L2 印尼清真与宗教禁忌检查通过」「L3 违禁词扫描未命中」
  「L1 平台调性与类目限制无冲突」「未使用未成年人背书话术」。
  若 flags 为空，额外包含「未发现违禁词与夸大宣传」。

【步骤 7 · 自检】
输出前逐项复核，任一不通过则修正后再输出：
1) 每个 word 是否原样出现在待检文案中？（不得臆造）
2) suggestion 里是否还残留违禁词或同类风险表述？
3) 是否存在误报（正常的描述被判违规）？
4) riskLevel 是否与 flags 的最高等级一致？
5) passed 是否至少 4 项且覆盖 L1 / L2 / L3 三层？

# 输出（严格 JSON）
{
  "riskLevel": "low | medium | high",
  "flags": [
    {
      "word": "命中的原文片段（原样摘录，便于定位）",
      "level": "high | medium",
      "rule": "规则类别与知识库条目名，如：绝对化用语（L3 · 绝对化用语）",
      "suggestion": "可直接替换的整句改写文案；若应删除请写明"
    }
  ],
  "passed": ["已通过的检查项（需体现 L1 / L2 / L3 层级覆盖）"]
}

# 语言
- flags.suggestion 与 passed 用中文输出，便于运营直接阅读。
- word 保持待检文案的原始语言。`,
    },
  ],
  nextId: 4,
}

// 按任务取负责该任务的成员：
// ① 精确匹配 task ② AI 修改没人认领时回落到「种草生成」成员 ③ 没有则返回 null（调用方回退模拟并提示）
export function getAgentForTask(task: TaskKey): AiConfig | null {
  const store = loadAiStore()
  const exact = store.list.find((a) => a.task === task)
  if (exact) return exact
  if (task === 'refine') {
    const gen = store.list.find((a) => a.task === 'generate')
    if (gen) return gen
  }
  return null
}

// 任务分工总览：每个任务 → 实际会调用的成员（含 AI 修改的回落说明）
export interface TaskAssignment {
  task: TaskKey
  label: string
  agent: AiConfig | null
  fallbackNote: string // 为空表示直接由该成员负责
}
export function getTaskAssignments(): TaskAssignment[] {
  return (Object.keys(TASK_LABELS) as TaskKey[]).map((t) => {
    const own = getAgentForTask(t)
    const exact = loadAiStore().list.find((a) => a.task === t)
    return {
      task: t,
      label: TASK_LABELS[t],
      agent: own,
      fallbackNote: !exact && own ? `未分配，自动使用「${own.name}」` : '',
    }
  })
}

// 兼容旧数据：历史成员可能没有 task 字段，按名字关键字推断一次并写回，
// 避免用户必须手动给每个成员重新选一遍任务。
function inferTask(a: AiConfig): TaskKey | '' {
  const n = `${a.name || ''}${a.aiName || ''}`
  if (/合规|审查|风控|审核/.test(n)) return 'compliance'
  if (/修改|润色|改写|优化/.test(n)) return 'refine'
  if (/种草|生成|脚本|文案/.test(n)) return 'generate'
  return ''
}

// ===== 服务端 AI 设置同步 =====
export const SETUP_KEY_DEFAULT = '1234'
const SETUP_KEY_LS = 'tikboost_setup_key'

// 将服务端下发的 Agent 列表做字段补全与旧数据迁移（纯函数，不写回）
function migrateAiStore(store: AiStore): AiStore {
  const list = (store.list ?? []).map((a) => {
    const next: AiConfig = {
      ...a,
      name: a.name ?? '',
      aiName: a.aiName ?? '',
      task: a.task ?? '',
      model: a.model ?? '',
      apiUrl: a.apiUrl ?? '',
      key: a.key ?? '',
      prompt: a.prompt ?? '',
    }
    // 已下线的「爆品分析」任务：历史成员清空为未分配，避免绑定到一个不存在的任务
    if ((next.task as string) === 'analyze') next.task = ''
    if (!next.task) {
      const guess = inferTask(next)
      if (guess) next.task = guess
    }
    return next
  })
  const nextId = store.nextId ?? Math.max(0, ...list.map((a) => a.id)) + 1
  return { list, nextId }
}

// 服务端下发的实时配置（访客无需本地保存）；设置后同步通知订阅者刷新 UI
let liveAiStore: AiStore | null = null
export function setLiveAiStore(store: AiStore): void {
  liveAiStore = migrateAiStore(store)
  notify()
}

export function loadAiStore(): AiStore {
  // 服务端已同步 → 直接返回（同步时已做迁移）
  if (liveAiStore) return liveAiStore
  let store: AiStore | null = null
  try {
    const raw = localStorage.getItem(AI_KEY)
    if (raw) store = JSON.parse(raw) as AiStore
  } catch {
    /* ignore */
  }
  if (!store) return JSON.parse(JSON.stringify(AI_SEED)) as AiStore
  const migrated = migrateAiStore(store)
  if (JSON.stringify(migrated) !== JSON.stringify(store)) saveAiStore(migrated)
  return migrated
}

// 保存 AI 列表（本地缓存，仅作为离线兜底；服务端为权威来源）
export function saveAiStore(store: AiStore): void {
  try {
    localStorage.setItem(AI_KEY, JSON.stringify(store))
  } catch {
    /* ignore */
  }
}

// 启动时从服务端拉取 AI 配置；若服务端尚未初始化且本地持有口令，自动用内置种子写入，
// 保证运营首次打开即把默认 Agent 落到服务器，访客无需各自配置。
export async function syncAiStoreFromServer(): Promise<void> {
  if (isStandaloneDemo()) return // 单文件演示：无服务端可拉取，直接用内置种子
  try {
    const res = await fetch('/__ai_store')
    if (!res.ok) return
    const data = await res.json().catch(() => null)
    if (!data || !data.store) return
    if (Array.isArray(data.store.list) && data.store.list.length > 0) {
      setLiveMode(data.mode === 'real' ? 'real' : 'mock')
      setLiveAiStore(data.store)
    } else {
      const key = localStorage.getItem(SETUP_KEY_LS) || SETUP_KEY_DEFAULT
      try {
        const r = await fetch('/__ai_store', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Setup-Key': key },
          body: JSON.stringify({ mode: 'mock', store: AI_SEED }),
        })
        if (r.ok) {
          setLiveMode('mock')
          setLiveAiStore(JSON.parse(JSON.stringify(AI_SEED)))
        }
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* 接口不存在（旧版本）/ 网络异常 → 回退本地 */
  }
}

// 将本地编辑后的配置写回服务端（运营经口令修改，对所有访客即时生效）
export async function saveAiStoreToServer(store: AiStore, mode: Mode, key: string): Promise<void> {
  const res = await fetch('/__ai_store', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Setup-Key': key },
    body: JSON.stringify({ mode, store }),
  })
  if (res.status === 401) throw new Error('口令错误')
  if (!res.ok) throw new Error('保存失败')
  setLiveMode(mode)
  setLiveAiStore(store)
}

// ===== 爆品搜索 · EchoTik 数据源配置 =====
// 凭证优先由 Vite 代理在服务端注入（.env 的 ECHOTIK_USERNAME/PASSWORD），
// 访客无需在本机填写即可访问实时数据；前端 localStorage 仍可单独存凭证用于本地开发调试，
// 但代理会统一覆盖为服务端凭证。请求打到同源的 /echotik/*（Vite 代理转发到 open.echotik.live），
// 避免浏览器跨域预检。
export type EchoTikSource = 'local' | 'echotik'

export interface EchoTikConfig {
  source: EchoTikSource // 'local' = 本地 18 条演示数据；'echotik' = 调真实接口
  username: string // EchoTik 开放平台 username
  password: string // EchoTik 开放平台 password
  apiBase: string // 代理前缀，默认 /echotik；也可填完整 https://open.echotik.live/api/v3
  pagesPerRegion: number // 每个国家拉取页数（每页上限 10 条）
  cacheMinutes: number // 结果缓存时长（分钟）；0 = 不缓存
  regions: string[] // 参与搜索的站点代码（默认 5 个东南亚站点全选）
}

const ECHOTIK_KEY = 'tikboost_echotik'

export const ECHOTIK_REGIONS = ['ID', 'TH', 'VN', 'PH', 'MY']

export const ECHOTIK_DEFAULTS: EchoTikConfig = {
  source: 'echotik', // 默认走实时接口；凭证由 Vite 代理服务端注入，访客开箱即看实时数据
  username: '',
  password: '',
  apiBase: '/echotik',
  pagesPerRegion: 1,
  cacheMinutes: 30,
  regions: [...ECHOTIK_REGIONS],
}

// 读取配置并保证 regions 至少剩一个、且只含合法站点码
export function loadEchoTik(): EchoTikConfig {
  let cfg: EchoTikConfig = { ...ECHOTIK_DEFAULTS }
  try {
    const raw = localStorage.getItem(ECHOTIK_KEY)
    if (raw) {
      cfg = { ...ECHOTIK_DEFAULTS, ...JSON.parse(raw) }
      const regions = Array.isArray(cfg.regions)
        ? cfg.regions.filter((r) => ECHOTIK_REGIONS.includes(r))
        : []
      cfg.regions = regions.length ? regions : [...ECHOTIK_REGIONS]
    }
  } catch {
    /* ignore */
  }
  // 演示模式强制本地演示数据：没有 /echotik 代理，实时接口必然失败
  if (isStandaloneDemo()) cfg.source = 'local'
  return cfg
}

export function saveEchoTik(c: EchoTikConfig): void {
  try {
    localStorage.setItem(ECHOTIK_KEY, JSON.stringify(c))
  } catch {
    /* ignore */
  }
}

// 是否已填齐调用凭据
export function hasEchoTikCredentials(c: EchoTikConfig = loadEchoTik()): boolean {
  return !!c.username.trim() && !!c.password.trim()
}

// Basic 认证头：Authorization: Basic base64(username:password)
export function echoTikAuthHeader(c: EchoTikConfig = loadEchoTik()): string {
  const raw = `${c.username}:${c.password}`
  const b64 = typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(raw))) : ''
  return b64 ? `Basic ${b64}` : ''
}
