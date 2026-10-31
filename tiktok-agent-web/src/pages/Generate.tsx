import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { COUNTRIES } from '../data/content'
import {
  generateContent,
  generateLiveScript,
  checkCompliance,
  type ComplianceResult,
  type GenerateResult,
} from '../services/agent'
import { scoreCompliance, dimColor } from '../services/complianceScore'
import { exportGeneratePdf, type GenReportItem } from '../utils/exportPdf'
import { genStore, type ContentKind } from '../store/genStore'

interface State {
  product?: string
  summary?: string
}

// 演示用示例：故意包含多处违规表述，用于一屏展示「禁投」状态
const DEMO_CONTENT =
  '全国第一的便携榨汁杯，100% 治愈你的选择困难，下单免费送杯刷，效果 guaranteed 好用！30 秒现榨，健身通勤随身带。'

export default function Generate() {
  const loc = useLocation()
  const navigate = useNavigate()
  const st = (loc.state as State) || {}
  const init = genStore.get()

  const [product, setProduct] = useState(st.product || init.product || '便携榨汁杯')
  const [content, setContent] = useState(st.summary || init.content || '')
  const [countries, setCountries] = useState<string[]>(init.countries.length ? init.countries : COUNTRIES.map((c) => c.code))
  const [loading, setLoading] = useState(false)
  const [res, setRes] = useState<GenerateResult | null>(init.res ?? null)
  const [liveRes, setLiveRes] = useState<GenerateResult | null>(init.liveRes ?? null)
  const [checks, setChecks] = useState<Record<string, ComplianceResult>>(init.checks ?? {})
  const [liveChecks, setLiveChecks] = useState<Record<string, ComplianceResult>>(init.liveChecks ?? {})
  // 当前查看的内容形态：seed=种草内容 / live=直播话术；切换不清空另一侧内容
  const [activeTab, setActiveTab] = useState<ContentKind>(init.activeTab ?? 'seed')
  const [checking, setChecking] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportNote, setExportNote] = useState<string | undefined>(undefined)

  // 跨页面保留：表单、两套生成结果、两套体检结果与当前标签一并写入草稿 store，返回时自动恢复
  useEffect(() => {
    genStore.set({ product, content, countries, res, liveRes, checks, liveChecks, activeTab })
  }, [product, content, countries, res, liveRes, checks, liveChecks, activeTab])

  // 当前标签对应的结果与体检数据（切换视图时互不干扰）
  const activeRes = activeTab === 'live' ? liveRes : res
  const activeChecks = activeTab === 'live' ? liveChecks : checks
  const activePieces = activeRes?.pieces ?? []
  const kindLabel = activeTab === 'live' ? '直播话术' : '种草内容'

  function toggleCountry(code: string) {
    setCountries((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]))
  }

  // 对一组文案逐国做合规预检，返回结果映射（不改动页面状态，便于种草/直播并行体检）
  async function computeChecks(r: GenerateResult): Promise<Record<string, ComplianceResult>> {
    const entries = await Promise.all(
      r.pieces.map(async (p) => {
        try {
          const c = await checkCompliance({
            text: `${p.title}\n${p.script}`,
            countryCode: p.country,
            platform: 'TikTok',
          })
          return [p.country, c] as const
        } catch {
          return [p.country, null] as const
        }
      }),
    )
    const map: Record<string, ComplianceResult> = {}
    for (const [code, c] of entries) if (c) map[code] = c
    return map
  }

  // 一次生成「种草内容 + 直播话术」两套结果，并各自完成合规预检
  async function onGenerate() {
    if (countries.length === 0) return
    setLoading(true)
    setChecks({})
    setLiveChecks({})
    const input = { product, content, countries, platform: 'TikTok' }
    const [r, lr] = await Promise.all([
      generateContent(input),
      generateLiveScript(input),
    ])
    setRes(r)
    setLiveRes(lr)
    setLoading(false)
    // 两套结果并行体检
    setChecking(true)
    const [seedMap, liveMap] = await Promise.all([computeChecks(r), computeChecks(lr)])
    setChecks(seedMap)
    setLiveChecks(liveMap)
    setChecking(false)
  }

  // 一次性导出「当前标签内容 + 合规预检报告」PDF
  async function onExport() {
    if (!activeRes) return
    setExporting(true)
    setExportNote(undefined)
    try {
      const items: GenReportItem[] = activeRes.pieces.map((p) => {
        const c = activeChecks[p.country]
        const sc = c ? scoreCompliance(c) : null
        return {
          country: p.country,
          countryName: p.countryName || p.country,
          lang: p.lang,
          title: p.title,
          script: p.script,
          hashtags: p.hashtags,
          score: sc?.score ?? 100,
          level: sc?.level ?? 'pass',
          label: c ? sc!.label : '未体检',
          note: c?.modeNote,
          dims: sc?.dims ?? [],
          flags: c
            ? c.flags.map((f) => ({
                word: f.word,
                level: f.level,
                rule: f.rule,
                suggestion: f.suggestion,
                kb: f.kb,
              }))
            : [],
          passed: c?.passed ?? [],
          recalled: (c?.recalled ?? []).map((r) => ({
            layer: r.layer,
            country: r.country,
            title: r.title,
            source: r.source,
            score: r.score,
            matched: r.matched,
          })),
        }
      })
      const d = new Date()
      const pad = (n: number) => String(n).padStart(2, '0')
      await exportGeneratePdf({
        product,
        content,
        platform: 'TikTok',
        modeLabel: activeRes.mode === 'real' ? '真实 LLM' : '模拟数据',
        kindLabel,
        generatedAt: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`,
        items,
      })
    } catch (e) {
      setExportNote(`导出失败：${String((e as Error)?.message ?? e)}`)
    }
    setExporting(false)
  }

  return (
    <>
      <h2>种草内容生成</h2>
      <p className="lead">输入商品名称与商品内容，一键生成覆盖所选国家的多语言种草文案与直播话术，并自动完成合规体检（模式由「AI设置」统一控制）。两套内容同页产出，可用滑块切换查看。</p>

      <div className="card gen-form">
        <div className="field">
          <label>商品名称</label>
          <input className="input" value={product} onChange={(e) => setProduct(e.target.value)} placeholder="例如：便携榨汁杯" />
        </div>
        <div className="field">
          <label>目标国家（可多选，默认全选 5 国）</label>
          <div className="chip-row">
            {COUNTRIES.map((c) => (
              <button key={c.code} className={`chip ${countries.includes(c.code) ? 'on' : ''}`} onClick={() => toggleCountry(c.code)}>
                {c.name}（{c.lang}）
              </button>
            ))}
          </div>
        </div>
        <div className="field gen-content-field">
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span>商品内容</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setContent(DEMO_CONTENT)}>
              填入演示示例
            </button>
          </label>
          <textarea className="textarea" value={content} onChange={(e) => setContent(e.target.value)} placeholder="填写商品卖点 / 描述 / 使用场景，例如：USB 充电便携榨汁杯，30 秒现榨，健身通勤随身体验鲜榨" />
        </div>
        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={onGenerate} disabled={loading || checking || countries.length === 0}>
          {loading ? '生成中…' : checking ? '合规体检中…' : `生成 ${countries.length} 国文案（种草 + 直播话术）`}
        </button>
        {countries.length === 0 && <p className="note" style={{ color: 'var(--c-danger)' }}>请至少选择一个目标国家。</p>}
      </div>

      {(res || liveRes) && (
        <div style={{ marginTop: 18 }}>
          {/* 滑块：切换查看种草内容 / 直播话术；两侧内容各自保留，切回仍可见 */}
          <div className="gen-viewbar">
            <div className="seg-slider" role="tablist" aria-label="内容形态切换">
              <span className={`seg-thumb${activeTab === 'live' ? ' right' : ''}`} aria-hidden="true" />
              <button
                type="button" role="tab" aria-selected={activeTab === 'seed'}
                className={`seg-opt${activeTab === 'seed' ? ' on' : ''}`}
                onClick={() => setActiveTab('seed')}
              >
                <span className="seg-ico">▤</span> 种草内容
              </button>
              <button
                type="button" role="tab" aria-selected={activeTab === 'live'}
                className={`seg-opt${activeTab === 'live' ? ' on' : ''}`}
                onClick={() => setActiveTab('live')}
              >
                <span className="seg-ico">◉</span> 直播话术
              </button>
            </div>
            <span className="gen-viewhint">当前查看：{kindLabel} · 共 {activePieces.length} 国</span>
          </div>
          {res && liveRes && (
            <p className="note" style={{ marginTop: 8 }}>
              已同时生成「种草内容」与「直播话术」两套结果。上方滑块可切换查看，切换不会清空另一侧内容，切回仍能看到之前生成/修改的版本。
            </p>
          )}

          {activeRes ? (
            <>
              {activeRes.modeNote && <p className="note">{activeRes.modeNote}</p>}
              <div className="gen-tools">
                <span style={{ fontSize: 13, color: 'var(--c-text-2)' }}>
                  共 {activeRes.pieces.length} 国{kindLabel}，已自动完成合规体检
                </span>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={onExport}
                  disabled={exporting || checking}
                  title={`把本次${kindLabel}与合规预检结论导出为一份 A4 PDF 报告`}
                >
                  {exporting ? '导出中…' : checking ? '待体检完成' : `导出${kindLabel} + 合规报告`}
                </button>
              </div>
              {exportNote && <p className="note" style={{ color: 'var(--c-danger)' }}>{exportNote}</p>}
              <div className="gen-grid">
                {activeRes.pieces.map((p, i) => {
                  const cr = activeChecks[p.country]
                  const sc = cr ? scoreCompliance(cr) : null
                  const lvl = sc?.level ?? ''
                  return (
                    <div
                      className={`card gen-card clickable${lvl ? ` risk-${lvl}` : ''}`}
                      key={i}
                      onClick={() => navigate(`/products/generate/${p.country}`, { state: { kind: activeTab } })}
                    >
                      <div className="gen-card-body">
                        <div className="gen-card-main">
                          <div className="gen-card-head">
                            <span className="lang">{p.countryName || p.country} · {p.lang}</span>
                            <span className={`risk-badge rb-${lvl || 'none'}`}>{sc?.label ?? '待体检'}</span>
                          </div>
                          <div className="gen-title">{p.title}</div>
                          <div className="output" style={{ marginTop: 6 }}>{p.script}</div>
                          <div className="tag-row">
                            {p.hashtags.map((t) => <span className="tag" key={t}>{t}</span>)}
                          </div>
                          <div className="more">查看详情 ›</div>
                        </div>

                        <aside className="gen-risk" onClick={(e) => e.stopPropagation()}>
                          {sc ? (
                            <>
                              <div className={`risk-score rs-${sc.level}`}>
                                <div className="risk-num">{sc.score}</div>
                                <div className="risk-word">合规分</div>
                              </div>
                              <div className="risk-line" />
                              <div className="risk-dims">
                                {sc.dims.map((d) => (
                                  <div className="risk-dim" key={d.key} title={`${d.label}：命中 ${d.hits} 项`}>
                                    <span className="risk-dim-label">{d.label}</span>
                                    <span className="risk-bar">
                                      <i style={{ width: `${Math.max(d.value, 4)}%`, background: dimColor(d.value) }} />
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </>
                          ) : (
                            <div className="risk-pending">{checking ? '体检中…' : '—'}</div>
                          )}
                        </aside>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <div className="empty" style={{ marginTop: 12 }}>
              尚未生成「{kindLabel}」，点击上方「生成」按钮即可同时生成种草内容与直播话术两套结果。
            </div>
          )}
        </div>
      )}
    </>
  )
}
