import { useEffect, useState } from 'react'
import {
  loadKb,
  saveKb,
  nextKbId,
  subscribeKb,
  saveKbToServer,
  CATEGORY_NAME,
  LAYER_NAME,
  type KbEntry,
  type KbCategory,
  type KbLayer,
} from '../store/kbStore'
import { COUNTRIES } from '../data/content'

type Entry = KbEntry
const CATS: KbCategory[] = ['market', 'compliance', 'culture', 'script']
const COUNTRY_OPTS = COUNTRIES.map((c) => ({ code: c.code, label: `${c.name}（${c.code}）` }))
const KB_KEY_LS = 'tikboost_setup_key'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function Knowledge() {
  const [entries, setEntries] = useState<Entry[]>(() => loadKb())
  const [cat, setCat] = useState<KbCategory>('market')
  const [query, setQuery] = useState('')
  const [layerFilter, setLayerFilter] = useState<'all' | KbLayer>('all')
  const [countryFilter, setCountryFilter] = useState<string>('all')
  const [editing, setEditing] = useState<Entry | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [setupKey, setSetupKey] = useState<string>(() => localStorage.getItem(KB_KEY_LS) || '1234')
  const [status, setStatus] = useState('')

  // 服务端同步后自动刷新（运营在服务器上改，访客即时看到）
  useEffect(() => {
    setEntries(loadKb())
    const unsub = subscribeKb(() => setEntries(loadKb()))
    return unsub
  }, [])

  const catEntries = entries.filter((e) => e.category === cat)
  const visible = catEntries.filter((e) => {
    const okLayer = cat !== 'compliance' || layerFilter === 'all' || e.layer === layerFilter
    const okCountry =
      cat === 'compliance' || countryFilter === 'all' || (e.country ?? '') === countryFilter
    const okQuery =
      !query.trim() ||
      (e.title + e.content + e.source + (e.keywords ?? []).join(' ') + (e.scenario ?? '') + (e.structure ?? ''))
        .toLowerCase()
        .includes(query.trim().toLowerCase())
    return okLayer && okCountry && okQuery
  })

  function startNew() {
    const base: Entry = {
      id: 0,
      category: cat,
      title: '',
      content: '',
      source: '',
      updated: today(),
      hits: 0,
      country: '',
      keywords: [],
      level: 'medium',
      suggestion: '',
      scenario: '',
      structure: '',
      example: '',
      tags: [],
    }
    if (cat === 'compliance') base.layer = 'L3'
    setEditing(base)
    setShowForm(true)
    setStatus('')
  }
  function startEdit(e: Entry) {
    setEditing({ ...e, keywords: e.keywords ?? [], tags: e.tags ?? [] })
    setShowForm(true)
    setStatus('')
  }
  async function remove(e: Entry) {
    const next = entries.filter((x) => x.id !== e.id)
    setEntries(next)
    saveKb(next)
    try {
      await saveKbToServer(next, setupKey)
      setStatus('已删除并同步到服务器')
    } catch (err: any) {
      setStatus('本地已删除，但服务端保存失败：' + (err?.message ?? err))
    }
  }
  async function save() {
    if (!editing) return
    const e = editing
    let next: Entry[]
    if (e.id === 0) {
      next = [...entries, { ...e, id: nextKbId(entries), updated: today() }]
    } else {
      next = entries.map((x) => (x.id === e.id ? { ...e, updated: today() } : x))
    }
    setEntries(next)
    saveKb(next)
    setShowForm(false)
    setEditing(null)
    try {
      await saveKbToServer(next, setupKey)
      setStatus('已保存到服务器，所有访客即时生效')
    } catch (err: any) {
      setStatus('本地已保存，但服务端保存失败：' + (err?.message ?? err))
    }
  }
  function onFile(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0]
    if (f && editing) setEditing({ ...editing, source: '📎 ' + f.name })
  }

  return (
    <>
      <h2>知识库（四库）</h2>
      <p className="lead">
        四个子库支撑两个工作流：市场画像库 / 文化适配语料库 / 脚本结构模板库 供种草生成 Agent 召回参考，
        合规知识库供合规预检 Agent 召回判定。运营在此修改经口令写入服务器，所有访客即时生效。
      </p>

      {/* 四库标签页 */}
      <div style={{ display: 'flex', gap: 8, margin: '12px 0 14px', flexWrap: 'wrap' }}>
        {CATS.map((c) => (
          <button
            key={c}
            className="mini-btn"
            onClick={() => {
              setCat(c)
              setLayerFilter('all')
              setCountryFilter('all')
              setQuery('')
            }}
            style={cat === c ? { background: 'var(--c-blue)', color: '#fff', borderColor: 'var(--c-blue)' } : undefined}
          >
            {CATEGORY_NAME[c]}
          </button>
        ))}
        <span style={{ marginLeft: 'auto' }}>
          <button className="btn btn-primary" onClick={startNew}>新增条目</button>
        </span>
      </div>

      {/* 筛选行 */}
      <div className="field">
        <label>搜索（标题 / 内容 / 关键词 / 模板）</label>
        <input className="input" placeholder="如：清真 / 开箱 / 印尼 / 痛点" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div style={{ display: 'flex', gap: 8, margin: '10px 0 14px', flexWrap: 'wrap' }}>
        {cat === 'compliance' && (
          <>
            {(['all', 'L1', 'L2', 'L3'] as const).map((f) => (
              <button key={f} className="mini-btn" onClick={() => setLayerFilter(f)} style={layerFilter === f ? { background: 'var(--c-gray)', color: '#fff' } : undefined}>
                {f === 'all' ? '全部层级' : `${f} ${LAYER_NAME[f]}`}
              </button>
            ))}
          </>
        )}
        {cat !== 'compliance' && (
          <>
            <button className="mini-btn" onClick={() => setCountryFilter('all')} style={countryFilter === 'all' ? { background: 'var(--c-gray)', color: '#fff' } : undefined}>
              全部国家
            </button>
            {COUNTRY_OPTS.map((o) => (
              <button key={o.code} className="mini-btn" onClick={() => setCountryFilter(o.code)} style={countryFilter === o.code ? { background: 'var(--c-gray)', color: '#fff' } : undefined}>
                {o.label}
              </button>
            ))}
          </>
        )}
      </div>

      {status && <p className="note" style={{ color: status.includes('失败') ? 'var(--c-danger)' : 'var(--c-green)' }}>{status}</p>}

      {showForm && editing && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginBottom: 12 }}>{editing.id === 0 ? '新增条目' : '编辑条目'}</h3>

          {cat === 'compliance' && (
            <div className="field">
              <label>层级</label>
              <select className="select" value={editing.layer ?? 'L3'} onChange={(e) => setEditing({ ...editing, layer: e.target.value as KbLayer })}>
                <option value="L1">L1 领域知识</option>
                <option value="L2">L2 国别规则</option>
                <option value="L3">L3 话术红线</option>
              </select>
            </div>
          )}

          <div className="field">
            <label>适用国家（留空 = 多国通用；脚本库可留空）</label>
            <select className="select" value={editing.country ?? ''} onChange={(e) => setEditing({ ...editing, country: e.target.value })}>
              <option value="">多国通用</option>
              {COUNTRY_OPTS.map((o) => (
                <option key={o.code} value={o.code}>{o.label}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>标题</label>
            <input className="input" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
          </div>
          <div className="field">
            <label>内容 / 主描述</label>
            <textarea className="textarea" value={editing.content} onChange={(e) => setEditing({ ...editing, content: e.target.value })} style={{ minHeight: 70 }} />
          </div>

          {cat === 'script' && (
            <>
              <div className="field">
                <label>适用场景 / 内容类型</label>
                <input className="input" placeholder="如：数码新品开箱 / 痛点场景" value={editing.scenario ?? ''} onChange={(e) => setEditing({ ...editing, scenario: e.target.value })} />
              </div>
              <div className="field">
                <label>模板骨架（structure）</label>
                <textarea className="textarea" value={editing.structure ?? ''} onChange={(e) => setEditing({ ...editing, structure: e.target.value })} style={{ minHeight: 80 }} />
              </div>
              <div className="field">
                <label>示例片段（example）</label>
                <textarea className="textarea" value={editing.example ?? ''} onChange={(e) => setEditing({ ...editing, example: e.target.value })} style={{ minHeight: 50 }} />
              </div>
            </>
          )}

          {cat === 'market' && (
            <div className="field">
              <label>结构化标签（逗号分隔，如：年轻化, 价格敏感, 美妆家居）</label>
              <input className="input" value={(editing.tags ?? []).join(', ')} onChange={(e) => setEditing({ ...editing, tags: e.target.value.split(/[,，]/).map((s) => s.trim()).filter(Boolean) })} />
            </div>
          )}

          <div className="field">
            <label>召回关键词（逗号分隔，用于按文案内容命中本条目）</label>
            <input
              className="input"
              placeholder="如：最, 第一, 清真, kece"
              value={(editing.keywords ?? []).join(', ')}
              onChange={(e) => setEditing({ ...editing, keywords: e.target.value.split(/[,，]/).map((s) => s.trim()).filter(Boolean) })}
            />
          </div>

          {(cat === 'compliance' || cat === 'culture') && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 14 }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>预置风险 / 重要度</label>
                <select className="select" value={editing.level ?? 'medium'} onChange={(e) => setEditing({ ...editing, level: e.target.value as 'high' | 'medium' })}>
                  <option value="high">高</option>
                  <option value="medium">中</option>
                </select>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>预置建议 / 替换方向</label>
                <input className="input" placeholder="如：改为“很 / 颇受好评”" value={editing.suggestion ?? ''} onChange={(e) => setEditing({ ...editing, suggestion: e.target.value })} />
              </div>
            </div>
          )}

          <div className="field">
            <label>来源 (source)</label>
            <input className="input" value={editing.source.replace('📎 ', '')} onChange={(e) => setEditing({ ...editing, source: e.target.value })} />
            <input type="file" onChange={onFile} style={{ marginTop: 8, fontSize: 13 }} />
          </div>

          <div className="field">
            <label>访问口令（与 AI 设置页共用，默认 1234）</label>
            <input className="input" value={setupKey} onChange={(e) => { setSetupKey(e.target.value); localStorage.setItem(KB_KEY_LS, e.target.value) }} />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={save}>保存到服务器</button>
            <button className="mini-btn" onClick={() => { setShowForm(false); setEditing(null) }}>取消</button>
          </div>
        </div>
      )}

      <p className="muted-3" style={{ fontSize: 13 }}>共 {visible.length} 条（{CATEGORY_NAME[cat]}）</p>
      {visible.map((e) => (
        <div className="card" key={e.id} style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span className={`badge ${e.category === 'compliance' ? 'badge-warning' : e.category === 'market' ? 'badge-blue' : e.category === 'culture' ? 'badge-gray' : 'badge-green'}`}>
              {CATEGORY_NAME[e.category]}
            </span>
            {e.layer && <span className="badge">{e.layer} {LAYER_NAME[e.layer]}</span>}
            {e.country && <span className="badge">{e.country}</span>}
            {e.level && (
              <span className={`badge ${e.level === 'high' ? 'badge-danger' : 'badge-warning'}`}>
                {e.category === 'culture' ? '敏感' : '风险'}{e.level === 'high' ? '高' : '中'}
              </span>
            )}
            <span style={{ fontWeight: 600 }}>{e.title}</span>
            <span style={{ marginLeft: 'auto' }}>
              <button className="mini-btn" onClick={() => startEdit(e)}>编辑</button>
              <button className="mini-btn" style={{ marginLeft: 6, color: 'var(--c-danger)' }} onClick={() => remove(e)}>删除</button>
            </span>
          </div>
          <p className="muted" style={{ fontSize: 14, marginTop: 8 }}>{e.content}</p>
          {e.scenario && <div className="muted-3" style={{ fontSize: 12, marginTop: 4 }}>场景：{e.scenario}</div>}
          {e.structure && <div className="muted-3" style={{ fontSize: 12, marginTop: 4, whiteSpace: 'pre-wrap' }}>骨架：{e.structure}</div>}
          {e.example && <div className="muted-3" style={{ fontSize: 12, marginTop: 4 }}>示例：{e.example}</div>}
          {!!(e.tags ?? []).length && <div className="muted-3" style={{ fontSize: 12, marginTop: 4 }}>标签：{e.tags!.join(' / ')}</div>}
          {!!(e.keywords ?? []).length && <div className="muted-3" style={{ fontSize: 12, marginTop: 4 }}>关键词：{e.keywords!.join(' / ')}</div>}
          {e.suggestion && <div className="muted-3" style={{ fontSize: 12, marginTop: 4 }}>预置建议：{e.suggestion}</div>}
          <div className="muted-3" style={{ fontSize: 12 }}>source：{e.source} · 更新 {e.updated} · 命中 {e.hits} 次</div>
        </div>
      ))}
    </>
  )
}
