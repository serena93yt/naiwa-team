import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { genStore } from '../store/genStore'
import {
  refineContent,
  checkCompliance,
  type ComplianceResult,
  type GenerateResult,
} from '../services/agent'
import { scoreCompliance, dimColor } from '../services/complianceScore'
import HighlightedText from '../components/HighlightedText'
import { diffWords } from '../utils/diff'

export default function GenerateDetail() {
  const { country } = useParams<{ country: string }>()
  const navigate = useNavigate()
  const loc = useLocation()
  const draft = genStore.get()
  // 形态来源：优先取跳转时携带的 kind，退回草稿里记录的当前标签（刷新 / 直链也能正确定位）
  const kind = ((loc.state as { kind?: string } | null)?.kind ?? draft.activeTab ?? 'seed') as 'seed' | 'live'
  const isLive = kind === 'live'
  const resultSet = isLive ? draft.liveRes : draft.res
  const checkMap = isLive ? draft.liveChecks : draft.checks
  const piece = resultSet?.pieces.find((p) => p.country === country)
  const kindLabel = isLive ? '直播话术' : '种草内容'

  const [instruction, setInstruction] = useState('')
  const [loading, setLoading] = useState(false)
  const [modeNote, setModeNote] = useState<string | undefined>(undefined)

  // 可编辑的当前文案（原文框）；AI 修改后会直接更新这里
  const [working, setWorking] = useState(piece?.script ?? '')
  // 修改前的文案（= 本次修改前的最新版本，用于颜色标注对比；连续修改时以上一次结果为基准）
  const [baseline, setBaseline] = useState<string | null>(null)
  const [refined, setRefined] = useState<string | null>(null)

  // 合规体检：进入详情时自动对文案跑一次，改写后自动复检
  const [check, setCheck] = useState<ComplianceResult | null>(
    (country && checkMap?.[country]) || null,
  )
  const [checking, setChecking] = useState(false)
  // 体检时的文案快照：保证高亮位置与体检结果对应
  const [checkedText, setCheckedText] = useState('')
  // AI 修改前的合规分，用于展示「整改前 → 整改后」
  const [prevScore, setPrevScore] = useState<number | null>(null)

  const diff = useMemo(
    () => (baseline !== null && refined !== null ? diffWords(baseline, refined) : null),
    [baseline, refined],
  )

  const sc = check ? scoreCompliance(check) : null
  const riskBadge =
    check?.riskLevel === 'high' ? 'badge-danger' : check?.riskLevel === 'medium' ? 'badge-warning' : 'badge-success'

  // 首次进入：优先复用生成页已算好的体检结果，否则自动体检（读取当前形态对应的 check 集）
  useEffect(() => {
    if (!piece) return
    const d = genStore.get()
    const cached = (isLive ? d.liveChecks : d.checks)?.[piece.country]
    if (cached) {
      setCheck(cached)
      setCheckedText(`${piece.title}\n${piece.script}`)
      return
    }
    void runCheck(`${piece.title}\n${piece.script}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [piece?.country])

  // 文案修改（手动编辑 / AI 改写）实时同步回草稿 store 中「当前形态」对应的结果集，
  // 返回生成页时卡片展示与导出都会用到最新版文案；另一侧内容不受影响。
  useEffect(() => {
    if (!country) return
    const d = genStore.get()
    const rs = isLive ? d.liveRes : d.res
    if (!rs) return
    const updated: GenerateResult = {
      ...rs,
      pieces: rs.pieces.map((p) => (p.country === country ? { ...p, script: working } : p)),
    }
    genStore.set(isLive ? { liveRes: updated } : { res: updated })
  }, [working, country])

  async function runCheck(text: string) {
    if (!piece) return
    setChecking(true)
    try {
      const c = await checkCompliance({ text, countryCode: piece.country, platform: 'TikTok' })
      setCheck(c)
      setCheckedText(text)
      // 同步回当前形态对应的 check 集，返回生成页时卡片分数保持一致
      const d = genStore.get()
      if (isLive) {
        genStore.set({ liveChecks: { ...(d.liveChecks ?? {}), [piece.country]: c } })
      } else {
        genStore.set({ checks: { ...(d.checks ?? {}), [piece.country]: c } })
      }
    } catch {
      /* 体检失败不影响主流程 */
    }
    setChecking(false)
  }

  function goBack() {
    navigate('/products/generate')
  }

  // 按命中的合规问题自动拼出整改指令（一键整改用）
  function buildFixInstruction(): string {
    if (!check || check.flags.length === 0) return ''
    const parts = check.flags
      .slice(0, 8)
      .map((f, i) => `${i + 1}. ${f.rule}（命中「${f.word}」）→ ${f.suggestion || '删除或改为合规表述'}`)
    return [
      '请整改下面列出的合规风险，只输出整改后的完整文案：',
      ...parts,
      '要求：整改后不得再包含上述命中词及同义表述；保留原文的语言、语气与结构，不新增未经证实的信息。',
    ].join('\n')
  }

  const canAutoFix = !!check && check.flags.length > 0

  // 统一的改写执行：改写 → 记录旧分 → 自动复检
  async function doRefine(instr: string) {
    if (!piece || !instr.trim()) return
    setLoading(true)
    const r = await refineContent({
      product: draft.product,
      country: piece.country,
      lang: piece.lang,
      script: working,
      instruction: instr.trim(),
      platform: 'TikTok',
    })
    setBaseline(working)
    setRefined(r.script)
    setWorking(r.script) // AI 直接改在原文框
    setModeNote(r.modeNote)
    setLoading(false)
    // 记住修改前的分数，改写完成后自动复检，展示整改前后对比
    setPrevScore(check ? scoreCompliance(check).score : null)
    await runCheck(r.script)
  }

  // 一键整改：无需手填指令，直接按体检结果改写并复检
  async function onAutoFix() {
    await doRefine(buildFixInstruction())
  }

  async function onRefine() {
    await doRefine(instruction)
  }

  if (!piece) {
    return (
      <>
        <button className="back-btn" onClick={goBack}>‹ 返回生成页</button>
        <div className="empty" style={{ marginTop: 16 }}>
          未找到该国家的{kindLabel}，请先在「种草内容生成」页生成后再查看详情。
        </div>
      </>
    )
  }

  return (
    <>
      <button className="back-btn" onClick={goBack}>‹ 返回生成页</button>
      <h2 style={{ marginTop: 14 }}>{kindLabel}详情</h2>

      {/* 三栏：内容 25% | 合规体检面板 15% | 完整合规反馈 60% */}
      <div className={`card detail-card${sc ? ` risk-${sc.level}` : ''}`} style={{ marginTop: 12 }}>
        <div className="detail-grid">
          {/* 左：当前形态内容（25%） */}
          <div className="detail-content">
            <div className="detail-head">
              <span className="lang">{piece.countryName || piece.country} · {piece.lang}</span>
              <span className={`risk-badge rb-${sc?.level ?? 'none'}`}>{sc?.label ?? '待体检'}</span>
            </div>
            <div className="gen-title" style={{ marginTop: 8 }}>{piece.title}</div>
            <textarea
              className="textarea gen-edit"
              value={working}
              onChange={(e) => setWorking(e.target.value)}
              placeholder="可直接编辑这份文案；AI 修改后也会写回这里"
            />
            {check && <HighlightedText text={checkedText || working} flags={check.flags} />}
            <div className="tag-row" style={{ marginTop: 10 }}>
              {piece.hashtags.map((t) => <span className="tag" key={t}>{t}</span>)}
            </div>
          </div>

          {/* 中：合规体检面板（15%） */}
          <aside className="detail-panel">
            {sc ? (
              <>
                <div className={`risk-score rs-${sc.level}`}>
                  <div className="risk-num">{sc.score}</div>
                  <div className="risk-word">合规分</div>
                </div>
                {prevScore !== null && prevScore !== sc.score && (
                  <div className="risk-delta">
                    整改前 {prevScore}
                    <span className="risk-arrow">→</span>
                    <b>{sc.score}</b>
                  </div>
                )}
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
                <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => runCheck(working)} disabled={checking}>
                  {checking ? '体检中…' : '重新体检'}
                </button>
              </>
            ) : (
              <div className="risk-pending">{checking ? '体检中…' : '—'}</div>
            )}
          </aside>

          {/* 右：完整合规反馈（60%，与「合规预检」页同一套内容） */}
          <div className="detail-feedback">
            <div className="detail-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>风险等级：</span>
                <span className={`badge ${check ? riskBadge : 'badge-secondary'}`}>
                  {check ? (check.riskLevel === 'high' ? '高风险' : check.riskLevel === 'medium' ? '中风险' : '低风险') : '待体检'}
                </span>
                {check && (
                  <span style={{ fontSize: 12, color: 'var(--c-text-3)' }}>
                    （{check.mode === 'real' ? '真实接口' : '模拟规则'}）
                  </span>
                )}
              </div>
              <button
                className="btn btn-primary btn-sm"
                onClick={onAutoFix}
                disabled={loading || checking || !canAutoFix}
                title={canAutoFix ? '按命中的合规问题自动改写，并立即复检' : '当前未发现合规问题，无需整改'}
              >
                {loading ? '整改中…' : checking ? '复检中…' : '一键整改'}
              </button>
            </div>

            {check?.modeNote && <p className="note" style={{ margin: '8px 0 0' }}>{check.modeNote}</p>}

            {check && check.flags.length > 0 ? (
              <div className="tbl-wrap">
                <table className="tbl tbl-sm">
                  <thead>
                    <tr><th>命中词</th><th>等级</th><th>规则</th><th>知识库条目</th><th>修改建议</th></tr>
                  </thead>
                  <tbody>
                    {check.flags.map((f, i) => (
                      <tr key={i}>
                        <td>{f.word}</td>
                        <td>
                          <span className={`badge ${f.level === 'high' ? 'badge-danger' : 'badge-warning'}`}>
                            {f.level === 'high' ? '高' : '中'}
                          </span>
                        </td>
                        <td>{f.rule}</td>
                        <td>{f.kb ? <span className="badge">{f.kb}</span> : <span style={{ color: 'var(--c-text-3)' }}>—</span>}</td>
                        <td>{f.suggestion}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : check ? (
              <p style={{ margin: '10px 0 0' }}>
                <span className="badge badge-success">未发现违禁词与夸大宣传</span>
              </p>
            ) : null}

            {check?.recalled && check.recalled.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div className="diff-h">本次召回的知识库条目（{check.recalled.length} 条，按相关度降序）</div>
                <ul className="recall-list">
                  {check.recalled.map((r) => (
                    <li key={r.id}>
                      <span className="badge">[{r.layer}{r.country ? ` · ${r.country}` : ''}] {r.title}</span>
                      {r.source && <span>　来源：{r.source}</span>}
                      <span>　相关度 {r.score}</span>
                      {r.matched.length > 0 && <span>　命中：{r.matched.join('、')}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {check && check.passed.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div className="diff-h">已通过的检查</div>
                <ul className="recall-list">
                  {check.passed.map((p, i) => <li key={i}>{p}</li>)}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 向 AI 提问修改 */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="block-title" style={{ marginTop: 0 }}>向 AI 提问修改</div>
        <div className="field">
          <label>修改要求（例如：更口语化 / 加入限时优惠 / 强调送礼场景）</label>
          <textarea
            className="textarea"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="描述你希望如何调整这份文案…"
          />
        </div>
        <button className="btn btn-primary" onClick={onRefine} disabled={loading || !instruction.trim()}>
          {loading ? '修改中…' : '让 AI 修改'}
        </button>
        {modeNote && <p className="note">{modeNote}</p>}

        {diff && (
          <div style={{ marginTop: 16 }}>
            <div className="block-title" style={{ marginTop: 0 }}>AI 修改对比（修改前 → 修改后，红=删除 绿=新增）</div>
            <div className="diff-cols">
              <div className="diff-col">
                <div className="diff-h">修改前</div>
                <div className="output diff-box">
                  {diff.map((t, i) => (t.t === 'del'
                    ? <span className="diff-del" key={i}>{t.s}</span>
                    : <span key={i}>{t.s}</span>))}
                </div>
              </div>
              <div className="diff-col">
                <div className="diff-h">修改后</div>
                <div className="output diff-box">
                  {diff.map((t, i) => (t.t === 'add'
                    ? <span className="diff-add" key={i}>{t.s}</span>
                    : <span key={i}>{t.s}</span>))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
