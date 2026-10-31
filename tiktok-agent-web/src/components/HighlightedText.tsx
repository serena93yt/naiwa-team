import { useMemo, useState, type ReactNode } from 'react'
import type { FlagItem } from '../services/agent'

export interface Mark {
  start: number
  end: number
  level: 'high' | 'medium'
  word: string
  rule: string
  suggestion: string
}

// 由命中词反查在原文中的位置：支持同一词多次出现，跳过与已标记区间重叠的命中
export function buildMarks(text: string, flags: FlagItem[]): Mark[] {
  const marks: Mark[] = []
  for (const f of flags) {
    const w = (f.word ?? '').trim()
    if (!w || !text) continue
    let from = 0
    let guard = 0
    while (guard++ < 30) {
      const idx = text.indexOf(w, from)
      if (idx < 0) break
      const end = idx + w.length
      const overlap = marks.some((m) => idx < m.end && end > m.start)
      if (!overlap) {
        marks.push({
          start: idx,
          end,
          level: f.level,
          word: w,
          rule: f.rule ?? '',
          suggestion: f.suggestion ?? '',
        })
      }
      from = end
    }
  }
  return marks.sort((a, b) => a.start - b.start)
}

interface Props {
  text: string
  flags: FlagItem[]
  title?: string
}

// 文案热力高亮：在原文上标出风险词，点击弹出规则与修改建议
export default function HighlightedText({ text, flags, title }: Props) {
  const [active, setActive] = useState(-1)
  const marks = useMemo(() => buildMarks(text, flags), [text, flags])
  if (!text || !text.trim()) return null

  const parts: ReactNode[] = []
  let cursor = 0
  marks.forEach((m, i) => {
    if (m.start > cursor) parts.push(<span key={`t${i}`}>{text.slice(cursor, m.start)}</span>)
    parts.push(
      <span
        key={`m${i}`}
        className={`hl-mark ${m.level === 'high' ? 'hl-high' : 'hl-mid'}${active === i ? ' on' : ''}`}
        onClick={() => setActive(active === i ? -1 : i)}
        title={`${m.rule}：${m.suggestion}`}
      >
        {text.slice(m.start, m.end)}
      </span>,
    )
    cursor = m.end
  })
  if (cursor < text.length) parts.push(<span key="tail">{text.slice(cursor)}</span>)

  const cur = active >= 0 ? marks[active] : null

  return (
    <div style={{ marginTop: 12 }}>
      <div className="diff-h">{title ?? '原文定位（点击标色处查看规则与修改建议）'}</div>
      <div className="hl-box">{parts}</div>
      {cur ? (
        <div className="hl-tip">
          <b>{cur.word}</b> · {cur.rule || '合规风险'}（{cur.level === 'high' ? '高' : '中'}风险）
          {cur.suggestion ? ` → ${cur.suggestion}` : ' → 删除或改为合规表述'}
        </div>
      ) : marks.length === 0 ? (
        <div className="hl-tip hl-ok">当前文案未命中任何风险词</div>
      ) : (
        <div className="hl-tip hl-hint">共标出 {marks.length} 处风险，点击查看每一处的规则与修改建议</div>
      )}
    </div>
  )
}
