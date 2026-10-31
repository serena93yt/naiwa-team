// 合规体检评分：把一次合规预检结果换算成「总分 + 风险维度条」
// 用途：生成页每张文案卡片右侧的合规面板（分数圆环 + 维度条 + 禁投角标）
import type { ComplianceResult } from './agent'

export type RiskLevel = 'pass' | 'warn' | 'block'

export interface RiskDim {
  key: string
  label: string
  /** 0-100 风险值，用于维度条长度；0 表示该项干净 */
  value: number
  /** 命中条数 */
  hits: number
}

export interface RiskScore {
  /** 0-100 合规分，越高越安全 */
  score: number
  level: RiskLevel
  /** 角标文案：可投放 / 需修改 / 禁投 */
  label: string
  dims: RiskDim[]
}

// 六个风险维度及归属关键词（同时匹配 flag 的 rule 与 word，大小写不敏感）
const DIMS: { key: string; label: string; hints: string[] }[] = [
  {
    key: 'absolute',
    label: '绝对化用语',
    hints: ['绝对化', '最', '第一', '唯一', '顶级', '国家级', 'no.1', 'no1', '永久', '百分百'],
  },
  {
    key: 'medical',
    label: '医疗疗效',
    hints: ['医疗', '疗效', '治愈', '根治', '治疗', '药用', '保健', '消炎', '药效'],
  },
  {
    key: 'exaggerate',
    label: '夸大承诺',
    hints: ['夸大', '100%', 'guaranteed', '承诺', '功效', '成分', '保证'],
  },
  {
    key: 'induce',
    label: '诱导促销',
    hints: ['诱导', '免费', '清仓', '无条件', '互动', '抽奖', '秒杀', '送'],
  },
  {
    key: 'culture',
    label: '宗教文化',
    hints: ['宗教', '清真', '王室', '族群', '政治', '领土', '文化', '敏感', 'haram', 'halal'],
  },
  {
    key: 'category',
    label: '类目资质',
    hints: ['资质', '认证', '类目', '许可', '监管', '备案', '授权', '认证机构'],
  },
]

const OTHER: { key: string; label: string; hints: string[] } = { key: 'other', label: '其他风险', hints: [] }

// 单条 flag 扣分值：高风险扣 22，中风险扣 9
const W_HIGH = 22
const W_MED = 9

// 单个维度的风险值：高风险 34 / 条，中风险 16 / 条，上限 100
const D_HIGH = 34
const D_MED = 16

function classify(text: string): string {
  const t = (text || '').toLowerCase()
  if (!t) return OTHER.key
  for (const d of DIMS) {
    for (const h of d.hints) {
      if (t.includes(h.toLowerCase())) return d.key
    }
  }
  return OTHER.key
}

export function scoreCompliance(result: ComplianceResult): RiskScore {
  const flags = Array.isArray(result.flags) ? result.flags : []
  let deduct = 0
  const bucket: Record<string, { hits: number; value: number }> = {}

  for (const f of flags) {
    const high = f.level === 'high'
    deduct += high ? W_HIGH : W_MED
    const key = classify(`${f.rule ?? ''} ${f.word ?? ''}`)
    const cur = bucket[key] ?? { hits: 0, value: 0 }
    cur.hits += 1
    cur.value = Math.min(100, cur.value + (high ? D_HIGH : D_MED))
    bucket[key] = cur
  }

  const score = Math.max(0, 100 - deduct)
  const level: RiskLevel = score >= 85 ? 'pass' : score >= 60 ? 'warn' : 'block'
  const label = level === 'pass' ? '可投放' : level === 'warn' ? '需修改' : '禁投'

  const dims: RiskDim[] = DIMS.map((d) => ({
    key: d.key,
    label: d.label,
    value: bucket[d.key]?.value ?? 0,
    hits: bucket[d.key]?.hits ?? 0,
  }))
  // 只在确实存在未归类风险时才补「其他风险」维度，避免面板出现无意义的空行
  if (bucket[OTHER.key]?.hits) {
    dims.push({ key: OTHER.key, label: OTHER.label, value: bucket[OTHER.key].value, hits: bucket[OTHER.key].hits })
  }

  return { score, level, label, dims }
}

// 维度条颜色：风险越高越红
export function dimColor(value: number): string {
  if (value >= 50) return '#E24B4A'
  if (value >= 25) return '#EF9F27'
  if (value > 0) return '#FAC775'
  return '#97C459'
}
