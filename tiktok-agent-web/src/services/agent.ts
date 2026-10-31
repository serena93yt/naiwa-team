// ===== TikBoost AI · 智能体服务层 =====
// 设计：默认走 mock（规则引擎 / 模板），真实模式读取全局设置中的 API 地址。
// 真实接入：在「AI设置」页填写 API 地址（或构建期 .env 配 VITE_AGENT_API）。

import { loadSettings, getAgentForTask, type AiConfig, type Mode } from '../settings'
import { recallKb, formatKb, type RecallItem } from '../store/kbStore'

export type { Mode }

export interface GenerateInput {
  product: string
  content: string
  countries: string[]
  platform: string
}

export interface GeneratedPiece {
  country: string
  countryName: string
  lang: string
  title: string
  script: string
  hashtags: string[]
}

export interface GenerateResult {
  pieces: GeneratedPiece[]
  mode: Mode
  modeNote?: string
}

export interface ComplianceInput {
  text: string
  countryCode: string
  platform: string
}

export interface FlagItem {
  word: string
  level: 'high' | 'medium'
  rule: string
  suggestion: string
  kb?: string // 对应的知识库条目标题（前端按规则名 / 命中词匹配）
}

// 本次召回的知识库条目（精简后返回给页面展示）
export interface RecalledKbItem {
  id: number
  layer: string
  title: string
  country: string
  source: string
  score: number
  matched: string[]
}

export interface ComplianceResult {
  riskLevel: 'low' | 'medium' | 'high'
  flags: FlagItem[]
  passed: string[]
  recalled?: RecalledKbItem[]
  mode: Mode
  modeNote?: string
}

// 种草内容「向 AI 提问修改」接口
export interface RefineInput {
  product: string
  country: string
  lang: string
  script: string
  instruction: string
  platform: string
}

export interface RefineResult {
  script: string
  mode: Mode
  modeNote?: string
}

// 各国本地化钩子（示意，真实模式由 LLM 产出母语文案）
const HOOKS: Record<string, { lang: string; hook: string }> = {
  ID: { lang: '印尼语', hook: 'Halo! Kali ini aku mau kenalin produk kece ini~' },
  TH: { lang: '泰语', hook: 'สวัสดีค่ะ วันนี้จะมารีวิวของดี ๆ ให้ฟัง' },
  VN: { lang: '越南语', hook: 'Xin chào! Hôm nay mình sẽ chia sẻ món đồ siêu xịn' },
  PH: { lang: '英语', hook: "Hey besties! You won't believe this find—" },
  MY: { lang: '英语/马来语', hook: 'Hi semua! Ni barang yang memang berbaloi beli' },
}

// 直播话术：各国开场留人口播（本地语言示意，真实模式由 LLM 产出母语文案）
const LIVE_OPENERS: Record<string, { lang: string; open: string }> = {
  ID: { lang: '印尼语', open: 'Halo semuanya~ Selamat datang di live aku, jangan ke mana-mana ya, ada kejutan!' },
  TH: { lang: '泰语', open: 'สวัสดีค่ะทุกคน~ วันนี้ไลฟ์มีของดีราคาพิเศษ รออยู่เพียงวันเดียวค่ะ อย่าเพิ่งเลื่อนผ่านนะคะ' },
  VN: { lang: '越南语', open: 'Xin chào mọi người~ Vào live ngay để săn deal hôm nay nha, đừng lướt qua vội!' },
  PH: { lang: '英语', open: "Hey besties, welcome to the live! Don't scroll away—today's price is only for this stream!" },
  MY: { lang: '英语/马来语', open: 'Hi semua~ Selamat datang ke live! Jangan pergi dulu, ada harga istimewa hari ini ya~' },
}

// 国家中文名（用于卡片展示）
const COUNTRY_NAMES: Record<string, string> = {
  ID: '印尼', TH: '泰国', VN: '越南', PH: '菲律宾', MY: '马来西亚',
}

// 违禁词 / 夸大宣传规则库（跨平台通用示例）
const BANNED: { word: string; level: 'high' | 'medium'; rule: string; suggestion: string }[] = [
  { word: '最', level: 'high', rule: '绝对化用语', suggestion: '改为“很 / 颇受好评”等相对表述' },
  { word: '第一', level: 'high', rule: '绝对化用语', suggestion: '删去排名表述，或附第三方数据来源' },
  { word: '国家级', level: 'high', rule: '违禁资质宣称', suggestion: '移除未授权资质描述' },
  { word: '100%', level: 'medium', rule: '功效/成分夸大', suggestion: '给出可验证区间，如“高达 98%”' },
  { word: ' guaranteed', level: 'medium', rule: '英文夸大承诺', suggestion: '移除无法履约的绝对承诺' },
  { word: '治愈', level: 'high', rule: '医疗宣称', suggestion: '仅描述使用感受，不作疗效承诺' },
  { word: '免费送', level: 'medium', rule: '诱导互动', suggestion: '明确活动规则，避免“无条件”表述' },
]

const PASSED_CHECKS = [
  '未含明显政治 / 宗教敏感词',
  '类目与平台类目限制无冲突',
  '未使用未成年人背书话术',
  '价格与折扣表述合规',
]

function delay<T>(v: T, ms = 420): Promise<T> {
  return new Promise((r) => setTimeout(() => r(v), ms))
}

// ---- 真实接口：直连大模型官方 /chat/completions 端点（OpenAI 兼容） ----
function authHeaders(key: string): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (key) h['Authorization'] = `Bearer ${key}`
  return h
}

// 输出契约：拼在成员提示词之后，优先级最高，保证前端能稳定解析
const CONTRACT_GENERATE =
  '【输出契约（优先级最高，必须遵守）】只返回一个 JSON 对象，不要任何解释与 markdown 代码块，字段：' +
  'title(字符串)、script(必须是单个字符串：若分镜多段，用 \\n 连接成一段文字，绝不能是数组)、hashtags(字符串数组)、lang(字符串，语言名称如"越南语"，不要填国家代码)。' +
  '内容红线：script 只使用目标国当地语言，不得混入其他东南亚国家语言；不得虚构监管机构认证或背书（如 NPRA/BPOM/KEMENKES 等），除非确有该认证。'
// 直播话术：按直播流程分环节，环节标签允许用简短中文，正文用当地语言
const CONTRACT_LIVE =
  '【输出契约（优先级最高，必须遵守）】只返回一个 JSON 对象，不要任何解释与 markdown 代码块，字段：' +
  'title(字符串)、script(字符串：直播口播逐字稿，按「开场留人 → 产品讲解 → 场景演示 → 逼单促单 → 互动引导」等环节顺序撰写，每个环节用【环节名】起头，环节之间用 \\n 连接成单个字符串，绝不能是数组)、hashtags(字符串数组)、lang(字符串，语言名称如"越南语"，不要填国家代码)。' +
  '内容红线：正文用目标国当地语言口语化撰写，环节标签可用简短中文；不得混入其他东南亚国家语言；不得虚构监管机构认证或背书（如 NPRA/BPOM/KEMENKES 等），除非确有该认证。'
const CONTRACT_COMPLIANCE =
  '【输出契约（优先级最高，必须遵守）】只返回一个 JSON 对象，不要任何解释与 markdown 代码块，字段：' +
  'riskLevel("low"|"medium"|"high")、flags(数组，每项含 word/level/rule/suggestion 四个字符串字段)、passed(字符串数组)。'
const CONTRACT_REFINE =
  '【输出契约（优先级最高，必须遵守）】只返回一个 JSON 对象，不要任何解释与 markdown 代码块，字段：script(字符串，修改后的完整文案)。'

function systemPrompt(agent: AiConfig, contract: string): string {
  const base = (agent.prompt || '').trim()
  // 所有任务通用的 JSON 卫生要求：字符串里禁止真实换行（最常见的解析失败原因）
  const full = contract + ' 另外：字符串值内部不得包含真实换行或制表符，换行必须写作 \\n。'
  return base ? `${base}\n\n${full}` : full
}

// 发起一次标准 chat completions 请求，返回模型输出的文本
async function chat(agent: AiConfig, system: string, user: string): Promise<string> {
  const res = await fetch(agent.apiUrl, {
    method: 'POST',
    headers: authHeaders(agent.key),
    body: JSON.stringify({
      model: agent.model,
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        { role: 'user', content: user },
      ],
      temperature: 0.7,
    }),
  })
  if (!res.ok) throw new Error(`接口返回 ${res.status}`)
  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) throw new Error('接口未返回文本内容')
  return content
}

// 修复模型输出 JSON 的常见错误：字符串值内部出现未转义的控制字符
// （真实换行 / 回车 / 制表符），JSON 规范要求写成 \n \r \t
function escapeControlCharsInStrings(raw: string): string {
  let out = ''
  let inStr = false
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]
    if (!inStr) {
      if (ch === '"') inStr = true
      out += ch
      continue
    }
    if (ch === '\\') {
      out += ch
      const nxt = raw[i + 1]
      if (nxt !== undefined) { out += nxt; i++ }
      continue
    }
    if (ch === '"') { inStr = false; out += ch; continue }
    if (ch === '\n') { out += '\\n'; continue }
    if (ch === '\r') { out += '\\r'; continue }
    if (ch === '\t') { out += '\\t'; continue }
    out += ch
  }
  return out
}

// 容错解析：模型可能包 ```json 代码块、前后加解释文字、
// 或在字符串里直接按回车（如上，需修复后再 parse）
export function extractJson(text: string): any | null {
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim()
  const start = cleaned.search(/[{[]/)
  if (start < 0) return null
  const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'))
  const candidates = [cleaned.slice(start)]
  if (end > start) candidates.push(cleaned.slice(start, end + 1))
  for (const raw of candidates) {
    for (const attempt of [raw, escapeControlCharsInStrings(raw)]) {
      try {
        return JSON.parse(attempt)
      } catch {
        /* 尝试下一个候选 */
      }
    }
  }
  return null
}

// 模型可能把 script 返回成数组（分镜一行一项）甚至对象数组；统一拍平成单个字符串，
// 避免走到 text.trim() 把整段原始 JSON 当文案展示。
function pickScriptText(src: any, fallback: string): string {
  const fromArray = (arr: any[]): string =>
    arr
      .map((it) => {
        if (typeof it === 'string') return it
        if (it && typeof it === 'object') {
          const o = it as Record<string, unknown>
          const v = o.text ?? o.line ?? o.content ?? o.voiceover ?? o.scene
          return typeof v === 'string' ? v : ''
        }
        return ''
      })
      .filter(Boolean)
      .join('\n')
  for (const key of ['script', 'voiceover', 'copy']) {
    const v = src?.[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
    if (Array.isArray(v)) {
      const joined = fromArray(v)
      if (joined) return joined
    }
  }
  if (Array.isArray(src?.scenes)) {
    const joined = fromArray(src.scenes)
    if (joined) return joined
  }
  return fallback.trim()
}

async function realGeneratePiece(input: GenerateInput, code: string, agent: AiConfig): Promise<GeneratedPiece> {
  const countryName = COUNTRY_NAMES[code] ?? code
  const lang = HOOKS[code]?.lang ?? ''
  // 真 RAG：召回市场画像 / 文化适配 / 脚本模板 三库，作为本地化与合规依据注入
  const marketKb = recallKb(`${input.product} ${input.content}`, code, 'market', 4)
  const cultureKb = recallKb(`${input.product} ${input.content} ${countryName}`, code, 'culture', 5)
  const scriptKb = recallKb(`${input.product} ${input.content}`, code, 'script', 3)
  const kbItems = [...marketKb, ...cultureKb, ...scriptKb]
  const kbBlock = kbItems.length
    ? `\n\n【参考知识库（运营维护，请据此做本地化、文化适配与避讳）】\n` + formatKb(kbItems)
    : ''

  const user = [
    '请为下面的商品生成 TikTok 种草内容。',
    `商品名称：${input.product}`,
    `商品内容：${input.content}`,
    `目标国家：${countryName}（代码 ${code}）`,
    `投放平台：${input.platform}`,
    '',
    `要求：script 用${countryName}的当地语言撰写，短句口语化；hashtags 给 3-5 个当地常用标签。`,
  ].join('\n') + kbBlock
  const text = await chat(agent, systemPrompt(agent, CONTRACT_GENERATE), user)
  const j = extractJson(text)
  const src = j && typeof j === 'object' ? j : {}
  const script = pickScriptText(src, text)
  return {
    country: code,
    countryName,
    // 模型有时把 lang 填成国家代码（如 "VN"），此时回退到内置语言名
    lang: typeof src.lang === 'string' && src.lang && src.lang.trim().toUpperCase() !== code ? src.lang.trim() : lang,
    title: typeof src.title === 'string' && src.title ? src.title : `${input.product}｜${countryName}种草文案`,
    script,
    hashtags: Array.isArray(src.hashtags) ? src.hashtags.map(String) : [],
  }
}

// 真实模式：生成一国直播话术（与种草生成复用同一 Agent，仅提示词不同）
async function realGenerateLivePiece(input: GenerateInput, code: string, agent: AiConfig): Promise<GeneratedPiece> {
  const countryName = COUNTRY_NAMES[code] ?? code
  const lang = LIVE_OPENERS[code]?.lang ?? HOOKS[code]?.lang ?? ''
  const marketKb = recallKb(`${input.product} ${input.content}`, code, 'market', 3)
  const cultureKb = recallKb(`${input.product} ${input.content} ${countryName}`, code, 'culture', 4)
  const scriptKb = recallKb(`${input.product} ${input.content}`, code, 'script', 3)
  const kbItems = [...marketKb, ...cultureKb, ...scriptKb]
  const kbBlock = kbItems.length
    ? `\n\n【参考知识库（运营维护，请据此做本地化、文化适配与避讳）】\n` + formatKb(kbItems)
    : ''

  const user = [
    '请为下面的商品生成一场 TikTok 直播带货的口播话术。',
    `商品名称：${input.product}`,
    `商品内容：${input.content}`,
    `目标国家：${countryName}（代码 ${code}）`,
    `投放平台：${input.platform}`,
    '',
    '要求：script 用目标国当地语言口语化撰写，按直播流程分环节（开场留人 / 产品讲解 / 场景演示 / 逼单促单 / 互动引导）；hashtags 给 3-5 个当地常用直播标签。',
  ].join('\n') + kbBlock
  const text = await chat(agent, systemPrompt(agent, CONTRACT_LIVE), user)
  const j = extractJson(text)
  const src = j && typeof j === 'object' ? j : {}
  const script = pickScriptText(src, text)
  return {
    country: code,
    countryName,
    lang: typeof src.lang === 'string' && src.lang && src.lang.trim().toUpperCase() !== code ? src.lang.trim() : lang,
    title: typeof src.title === 'string' && src.title ? src.title : `${input.product}｜${countryName}直播话术`,
    script,
    hashtags: Array.isArray(src.hashtags) ? src.hashtags.map(String) : [],
  }
}

// 把召回结果精简成返回给页面的结构
function toRecalledOut(recalled: RecallItem[]): RecalledKbItem[] {
  return recalled.map(({ entry, score, matched }) => ({
    id: entry.id,
    layer: entry.layer ?? '',
    title: entry.title,
    country: entry.country ?? '',
    source: entry.source ?? '',
    score,
    matched,
  }))
}

// 把一条 flag 关联到召回的知识库条目：
// ① 规则名与条目标题互相包含（如 rule「广告法 绝对化用语」↔ 条目「绝对化用语」）
// ② 命中词命中条目关键词（含变体，如 word「最好用」命中关键词「最」）
// 都对不上则返回空串（模型自行判定的部分）
function matchFlagToKb(rule: string, word: string, recalled: RecallItem[]): string {
  const r = (rule || '').toLowerCase().trim()
  for (const { entry } of recalled) {
    const t = (entry.title || '').toLowerCase()
    if (t && r && (r.includes(t) || t.includes(r))) return entry.title
  }
  const w = (word || '').toLowerCase().trim()
  if (w) {
    for (const { entry } of recalled) {
      const hit = (entry.keywords ?? []).some((k) => {
        const kk = (k || '').toLowerCase()
        return kk && (w.includes(kk) || kk.includes(w))
      })
      if (hit) return entry.title
    }
  }
  return ''
}

async function realCompliance(input: ComplianceInput, agent: AiConfig): Promise<ComplianceResult> {
  // 真 RAG：按「目标国家码 + 文案关键词」从知识库召回条目，一并交给模型
  const recalled = recallKb(input.text, input.countryCode, 'compliance')
  const user = [
    '请审查下面这条投放文案的合规风险。',
    `投放平台：${input.platform}`,
    `目标国家代码：${input.countryCode}`,
    '',
    `【知识库召回条目（共 ${recalled.length} 条，按相关度降序）】`,
    formatKb(recalled),
    '',
    '【待检文案】',
    input.text,
    '',
    '要求：严格依据上面召回的条目逐条扫描；未被召回的规则类别不得产生 flags。',
  ].join('\n')
  const text = await chat(agent, systemPrompt(agent, CONTRACT_COMPLIANCE), user)
  const j = extractJson(text)
  if (!j || typeof j !== 'object') throw new Error('未返回可解析结果')
  const riskLevel: ComplianceResult['riskLevel'] =
    j.riskLevel === 'high' || j.riskLevel === 'medium' || j.riskLevel === 'low' ? j.riskLevel : 'medium'
  const flags: FlagItem[] = Array.isArray(j.flags)
    ? j.flags.map((f: any) => {
        const word = String(f?.word ?? f?.text ?? '')
        const rule = String(f?.rule ?? f?.type ?? '')
        return {
          word,
          level: f?.level === 'high' ? 'high' : 'medium',
          rule,
          suggestion: String(f?.suggestion ?? ''),
          kb: matchFlagToKb(rule, word, recalled) || undefined,
        }
      })
    : []
  return {
    riskLevel,
    flags,
    passed: Array.isArray(j.passed) ? j.passed.map(String) : [],
    recalled: toRecalledOut(recalled),
    mode: 'real',
  }
}

async function realRefine(input: RefineInput, agent: AiConfig): Promise<RefineResult> {
  const user = [
    `请按下面的指令修改这条${input.lang}种草文案。`,
    `商品名称：${input.product}`,
    `目标国家：${input.country}`,
    `投放平台：${input.platform}`,
    `修改指令：${input.instruction}`,
    '原文案：',
    input.script,
    '',
    '要求：只输出修改后的完整文案，保持当地语言与原有结构。',
  ].join('\n')
  const text = await chat(agent, systemPrompt(agent, CONTRACT_REFINE), user)
  const j = extractJson(text)
  const script = j && typeof j.script === 'string' && j.script.trim() ? j.script : text.trim()
  return { script, mode: 'real' }
}

// ---- 模拟实现 ----
function mockGenerate(input: GenerateInput): GenerateResult {
  const content = (input.content && input.content.trim()) || '好用又不贵，适合日常多种场景，轻松提升生活质感'
  const countries = input.countries.length ? input.countries : ['ID']
  const productTag = '#' + input.product.replace(/\s+/g, '')
  const pieces: GeneratedPiece[] = countries.map((code) => {
    const hook = HOOKS[code] ?? HOOKS.ID
    return {
      country: code,
      countryName: COUNTRY_NAMES[code] ?? code,
      lang: hook.lang,
      title: `${input.product}｜${hook.lang}种草文案`,
      script:
        `${hook.hook}\n` +
        `今天给大家种草的是「${input.product}」。\n` +
        `${content}\n` +
        `想看更多搭配和实测，评论区扣 1，下条接着聊～`,
      hashtags: ['#TikTokMadeMeBuyIt', productTag, '#种草', '#东南亚好物', '#开箱'],
    }
  })
  return { pieces, mode: 'mock' }
}

// ---- 模拟实现：直播话术（按环节分段的口播稿） ----
function mockGenerateLive(input: GenerateInput): GenerateResult {
  const content = (input.content && input.content.trim()) || '好用又不贵，适合日常多种场景，轻松提升生活质感'
  const countries = input.countries.length ? input.countries : ['ID']
  const productTag = '#直播' + input.product.replace(/\s+/g, '')
  const pieces: GeneratedPiece[] = countries.map((code) => {
    const lh = LIVE_OPENERS[code] ?? LIVE_OPENERS.ID
    return {
      country: code,
      countryName: COUNTRY_NAMES[code] ?? code,
      lang: lh.lang,
      title: `${input.product}｜${lh.lang}直播话术`,
      script:
        `【开场留人】${lh.open}\n` +
        `【产品讲解】今天直播间给大家上的就是「${input.product}」。${content} 喜欢的宝宝先别划走，听我细细说。\n` +
        `【场景演示】（举起产品对准镜头）大家看，${input.product} 用起来特别简单，我现在现场给你们演示一遍，效果肉眼可见。\n` +
        `【逼单促单】直播间专属价只限今天这一场，库存真的不多！想要的宝宝赶紧点小黄车下单，扣「已拍」我这边优先给大家安排发货。\n` +
        `【互动引导】还没点关注的先点个关注，评论区告诉我你想要的颜色/款式，我再给大家看一下细节～`,
      hashtags: ['#TikTokLive', '#LiveShopping', productTag, '#直播带货', '#东南亚好物'],
    }
  })
  return { pieces, mode: 'mock' }
}

function mockCompliance(input: ComplianceInput): ComplianceResult {
  const recalled = recallKb(input.text, input.countryCode, 'compliance')
  const flags: FlagItem[] = []
  for (const b of BANNED) {
    if (input.text.includes(b.word)) {
      flags.push({
        word: b.word,
        level: b.level,
        rule: b.rule,
        suggestion: b.suggestion,
        kb: matchFlagToKb(b.rule, b.word, recalled) || undefined,
      })
    }
  }
  const riskLevel: ComplianceResult['riskLevel'] = flags.some((f) => f.level === 'high')
    ? 'high'
    : flags.length > 0
      ? 'medium'
      : 'low'
  const passed = [...PASSED_CHECKS]
  if (flags.length === 0) passed.push('未发现违禁词与夸大宣传')
  return { riskLevel, flags, passed, recalled: toRecalledOut(recalled), mode: 'mock' }
}

// ---- 模拟实现：按指令改写文案 ----
function mockRefine(input: RefineInput): RefineResult {
  const lines = input.script.split('\n').filter(Boolean)
  const firstLine = lines[0] ?? ''
  const restBody = lines.slice(1).join('\n')
  const refined =
    `${firstLine}（已按「${input.instruction}」调整）\n` +
    `${restBody}\n` +
    `— 修改说明：依据「${input.instruction}」对${input.lang}文案做了针对性改写，语气与卖点侧重更贴合要求。`
  return { script: refined, mode: 'mock' }
}

// ---- 对外 API（读取全局设置） ----
export async function generateContent(input: GenerateInput): Promise<GenerateResult> {
  const s = loadSettings()
  if (s.mode !== 'real') return delay(mockGenerate(input))
  const agent = getAgentForTask('generate')
  if (!agent) {
    return { ...mockGenerate(input), mode: 'real', modeNote: '未找到负责「种草生成」的 Agent（请在 AI 设置页给成员选择「负责任务」），已回退模拟数据' }
  }
  if (!agent.apiUrl) {
    return { ...mockGenerate(input), mode: 'real', modeNote: `「${agent.name}」未配置 API 地址，已回退模拟数据` }
  }
  try {
    const countries = input.countries.length ? input.countries : ['ID']
    const pieces = await Promise.all(countries.map((c) => realGeneratePiece(input, c, agent)))
    return { pieces, mode: 'real' }
  } catch {
    return { ...mockGenerate(input), mode: 'real', modeNote: '真实接口调用失败，已回退模拟数据' }
  }
}

// 直播话术生成：与种草生成同页一次产出，复用「种草生成」Agent（提示词不同）
export async function generateLiveScript(input: GenerateInput): Promise<GenerateResult> {
  const s = loadSettings()
  if (s.mode !== 'real') return delay(mockGenerateLive(input))
  const agent = getAgentForTask('generate')
  if (!agent) {
    return { ...mockGenerateLive(input), mode: 'real', modeNote: '未找到负责「种草生成」的 Agent（请在 AI 设置页给成员选择「负责任务」），已回退模拟数据' }
  }
  if (!agent.apiUrl) {
    return { ...mockGenerateLive(input), mode: 'real', modeNote: `「${agent.name}」未配置 API 地址，已回退模拟数据` }
  }
  try {
    const countries = input.countries.length ? input.countries : ['ID']
    const pieces = await Promise.all(countries.map((c) => realGenerateLivePiece(input, c, agent)))
    return { pieces, mode: 'real' }
  } catch {
    return { ...mockGenerateLive(input), mode: 'real', modeNote: '真实接口调用失败，已回退模拟数据' }
  }
}

export async function refineContent(input: RefineInput): Promise<RefineResult> {
  const s = loadSettings()
  if (s.mode !== 'real') return delay(mockRefine(input))
  const agent = getAgentForTask('refine')
  if (!agent) {
    return { ...mockRefine(input), mode: 'real', modeNote: '未找到负责「AI 修改」的 Agent（未分配时自动复用种草生成 Agent），已回退模拟数据' }
  }
  if (!agent.apiUrl) {
    return { ...mockRefine(input), mode: 'real', modeNote: `「${agent.name}」未配置 API 地址，已回退模拟数据` }
  }
  try {
    return await realRefine(input, agent)
  } catch {
    return { ...mockRefine(input), mode: 'real', modeNote: '真实接口调用失败，已回退模拟数据' }
  }
}

export async function checkCompliance(input: ComplianceInput): Promise<ComplianceResult> {
  const s = loadSettings()
  if (s.mode !== 'real') return delay(mockCompliance(input))
  const agent = getAgentForTask('compliance')
  if (!agent) {
    return { ...mockCompliance(input), mode: 'real', modeNote: '未找到负责「合规预检」的 Agent（请在 AI 设置页给成员选择「负责任务」），已回退模拟数据' }
  }
  if (!agent.apiUrl) {
    return { ...mockCompliance(input), mode: 'real', modeNote: `「${agent.name}」未配置 API 地址，已回退模拟数据` }
  }
  try {
    return await realCompliance(input, agent)
  } catch {
    return { ...mockCompliance(input), mode: 'real', modeNote: '真实接口调用失败，已回退模拟数据' }
  }
}
