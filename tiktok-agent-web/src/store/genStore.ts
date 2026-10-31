// 种草内容生成草稿的跨页面暂存（模块级单例）
// 用途：从生成页跳转到详情页再返回时，保留上次生成的表单与结果。
import type { ComplianceResult, GenerateResult } from '../services/agent'

/** 内容形态：seed = 种草内容（短视频文案），live = 直播话术（口播稿） */
export type ContentKind = 'seed' | 'live'

export interface GenDraft {
  product: string
  content: string
  countries: string[]
  res: GenerateResult | null
  /** 直播话术生成结果（与种草内容同页一次生成，切换标签时互不清空） */
  liveRes: GenerateResult | null
  /** 生成后自动合规预检的结果，按国家码索引（跨页面返回时一并保留） */
  checks: Record<string, ComplianceResult>
  /** 直播话术各自的合规预检结果（与种草内容分开存） */
  liveChecks: Record<string, ComplianceResult>
  /** 当前查看的内容形态，跨页面返回时保留，切回仍能看到之前的内容 */
  activeTab: ContentKind
}

const blank: GenDraft = {
  product: '', content: '', countries: [],
  res: null, liveRes: null, checks: {}, liveChecks: {}, activeTab: 'seed',
}
let draft: GenDraft = { ...blank }

export const genStore = {
  get: (): GenDraft => draft,
  set: (patch: Partial<GenDraft>): void => {
    draft = { ...draft, ...patch }
  },
}
