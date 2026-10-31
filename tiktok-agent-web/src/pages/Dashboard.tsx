import { Link } from 'react-router-dom'
import { METRICS, PRODUCT, WORKFLOWS, COUNTRIES } from '../data/content'

const QUICK = [
  { to: '/products/search', title: '爆品搜索', desc: '查看五国热销趋势，一键带入生成', icon: '🔍' },
  { to: '/products/generate', title: '种草内容生成', desc: '输入商品，生成多语言脚本', icon: '✨' },
  { to: '/products/compliance', title: '合规预检', desc: '扫描违禁词与夸大宣传', icon: '🛡' },
]

export default function Dashboard() {
  return (
    <>
      <h2>概览</h2>
      <p className="lead">{PRODUCT.tagline} · {PRODUCT.subtitle}</p>

      <div className="grid grid-3">
        {METRICS.slice(0, 3).map((m) => (
          <div className="kpi" key={m.label}>
            <div className="k-label">{m.label}</div>
            <div className="k-value">
              {m.value}
              <span style={{ fontSize: 13, color: 'var(--c-text-2)', fontWeight: 500, marginLeft: 4 }}>{m.unit}</span>
            </div>
            <div className="bar" style={{ marginTop: 10 }}>
              <span style={{ width: `${m.pct}%` }} />
            </div>
          </div>
        ))}
      </div>

      <h3 style={{ marginTop: 28 }}>快速开始</h3>
      <div className="grid grid-3" style={{ marginTop: 12 }}>
        {QUICK.map((q) => (
          <Link to={q.to} className="quick-card" key={q.to}>
            <div style={{ fontSize: 22 }}>{q.icon}</div>
            <div style={{ fontWeight: 700, marginTop: 6 }}>{q.title}</div>
            <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{q.desc}</div>
          </Link>
        ))}
      </div>

      <h3 style={{ marginTop: 28 }}>覆盖东南亚五国</h3>
      <div className="grid grid-5" style={{ marginTop: 12 }}>
        {COUNTRIES.map((c) => (
          <div className="card" key={c.code} style={{ padding: 14 }}>
            <div style={{ fontWeight: 700 }}>{c.name}</div>
            <div className="muted-3" style={{ fontSize: 12 }}>{c.lang}</div>
          </div>
        ))}
      </div>

      <p className="note">
        完整量化指标、商业模式与团队内容已归档至工程内《归档_项目评测与商业内容.md》，后续可接入“关于项目”或本页区块。
      </p>
    </>
  )
}
