import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { COUNTRIES } from '../data/content'
import { checkCompliance, type ComplianceResult } from '../services/agent'
import HighlightedText from '../components/HighlightedText'

const COUNTRY_OPTS = COUNTRIES.map((c) => ({ code: c.code, label: `${c.name}（${c.lang}）` }))

interface BringState {
  text?: string
  countryCode?: string
}

export default function Compliance() {
  const loc = useLocation()
  const st = (loc.state as BringState) || {}

  const [text, setText] = useState(st.text ?? '这款产品是全国第一，100% 治愈你的烦恼，免费送还有 guaranteed 效果！')
  const [country, setCountry] = useState(st.countryCode ?? 'TH')
  const [loading, setLoading] = useState(false)
  const [res, setRes] = useState<ComplianceResult | null>(null)
  // 检查时的文案快照：避免用户改动输入框后，高亮位置与结果对不上
  const [checkedText, setCheckedText] = useState('')

  async function onCheck() {
    setLoading(true)
    setCheckedText(text)
    const r = await checkCompliance({ text, countryCode: country, platform: 'TikTok' })
    setRes(r)
    setLoading(false)
  }

  const riskBadge =
    res?.riskLevel === 'high' ? 'badge-danger' : res?.riskLevel === 'medium' ? 'badge-warning' : 'badge-success'

  return (
    <>
      <h2>合规预检</h2>
      <p className="lead">粘贴待发文案，扫描违禁词、夸大宣传与类目限制，给出风险等级与修改建议（模式由「AI设置」统一控制）。</p>

      <div className="card">
        <div className="field">
          <label>待检文案</label>
          <textarea className="textarea" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <div className="field">
          <label>目标国</label>
          <select className="select" value={country} onChange={(e) => setCountry(e.target.value)}>
            {COUNTRY_OPTS.map((o) => (
              <option key={o.code} value={o.code}>{o.label}</option>
            ))}
          </select>
        </div>
        <button className="btn btn-primary" onClick={onCheck} disabled={loading}>
          {loading ? '预检中…' : '开始合规预检'}
        </button>
      </div>

      {res && (
        <div style={{ marginTop: 18 }}>
          {res.modeNote && <p className="note">{res.modeNote}</p>}
          <div style={{ marginBottom: 10 }}>
            风险等级：
            <span className={`badge ${riskBadge}`}>
              {res.riskLevel === 'high' ? '高风险' : res.riskLevel === 'medium' ? '中风险' : '低风险'}
            </span>
            <span className="muted-3" style={{ fontSize: 12, marginLeft: 8 }}>
              （{res.mode === 'real' ? '真实接口' : '模拟规则'}）
            </span>
          </div>

          <HighlightedText text={checkedText || text} flags={res.flags} />

          {res.flags.length > 0 ? (
            <table className="tbl">
              <thead>
                <tr><th>命中词</th><th>等级</th><th>规则</th><th>知识库条目</th><th>修改建议</th></tr>
              </thead>
              <tbody>
                {res.flags.map((f, i) => (
                  <tr key={i}>
                    <td>{f.word}</td>
                    <td><span className={`badge ${f.level === 'high' ? 'badge-danger' : 'badge-warning'}`}>{f.level === 'high' ? '高' : '中'}</span></td>
                    <td>{f.rule}</td>
                    <td>{f.kb ? <span className="badge">{f.kb}</span> : <span className="muted-3">—</span>}</td>
                    <td>{f.suggestion}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p><span className="badge badge-success">未发现违禁词与夸大宣传</span></p>
          )}

          {res.recalled && res.recalled.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div className="muted" style={{ fontSize: 13, fontWeight: 600 }}>
                本次召回的知识库条目（{res.recalled.length} 条，按相关度降序）
              </div>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18, color: 'var(--c-text-2)', fontSize: 13, lineHeight: 1.9 }}>
                {res.recalled.map((r) => (
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

          <div style={{ marginTop: 14 }}>
            <div className="muted" style={{ fontSize: 13, fontWeight: 600 }}>已通过的检查</div>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, color: 'var(--c-text-2)', fontSize: 14 }}>
              {res.passed.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
          </div>
        </div>
      )}
    </>
  )
}
