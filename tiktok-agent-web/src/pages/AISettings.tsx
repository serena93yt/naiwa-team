import { useState, useEffect } from 'react'
import {
  loadSettings,
  saveSettings,
  loadAiStore,
  saveAiStore,
  setLiveAiStore,
  setLiveMode,
  saveAiStoreToServer,
  getTaskAssignments,
  isStandaloneDemo,
  TASK_LABELS,
  SETUP_KEY_DEFAULT,
  type Mode,
  type AiConfig,
  type AiStore,
  type TaskKey,
} from '../settings'

const SETUP_KEY_LS = 'tikboost_setup_key'

export default function AISettings() {
  const [mode, setMode] = useState<Mode>(loadSettings().mode)
  const [store, setStore] = useState<AiStore>(loadAiStore())
  const [setupKey, setSetupKey] = useState<string>(
    () => localStorage.getItem(SETUP_KEY_LS) || SETUP_KEY_DEFAULT,
  )
  const [status, setStatus] = useState<string>('正在读取服务端配置…')
  const [msg, setMsg] = useState<string>('')

  const [editing, setEditing] = useState<AiConfig | null>(null)
  const [showForm, setShowForm] = useState(false)

  const assignments = getTaskAssignments()

  // 挂载时从服务端拉取（运营在服务器上配置的值），本地仅作离线兜底
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await fetch('/__ai_store')
        const data = await res.json().catch(() => null)
        if (!alive) return
        if (data?.store?.list?.length) {
          const s: AiStore = data.store
          setStore(s)
          setMode(data.mode === 'real' ? 'real' : 'mock')
          setStatus(`服务端已配置 ${s.list.length} 个 Agent（对所有访客生效）`)
        } else {
          setStatus('服务端未配置（将使用内置默认；保存后会写入服务端）')
        }
      } catch {
        if (!alive) return
        setStatus(
          isStandaloneDemo()
            ? '演示模式（单文件本地运行）：无服务端，编辑仅保存在本机浏览器'
            : '无法连接服务端接口（旧版本？），本次编辑仅存本地',
        )
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  function persist(next: AiStore) {
    setStore(next)
    setLiveAiStore(next)
    saveAiStore(next) // 本地缓存兜底
  }

  async function pushToServer(next: AiStore, m: Mode) {
    setMsg('保存中…')
    try {
      await saveAiStoreToServer(next, m, setupKey)
      setMsg('已写入服务端，对所有访客即时生效 ✓')
    } catch (e: any) {
      setMsg(`服务端保存失败：${e?.message || e}（已保存到本地兜底）`)
    }
  }

  function switchMode(m: Mode) {
    setMode(m)
    setLiveMode(m)
    saveSettings({ ...loadSettings(), mode: m })
    pushToServer(store, m)
  }

  function startNew() {
    setEditing({ id: 0, name: '', aiName: '', task: '', model: '', apiUrl: '', key: '', prompt: '' })
    setShowForm(true)
  }
  function startEdit(c: AiConfig) {
    setEditing({
      ...c,
      name: c.name ?? '',
      aiName: c.aiName ?? '',
      task: c.task ?? '',
      model: c.model ?? '',
      apiUrl: c.apiUrl ?? '',
      key: c.key ?? '',
      prompt: c.prompt ?? '',
    })
    setShowForm(true)
  }
  function remove(c: AiConfig) {
    const next: AiStore = { ...store, list: store.list.filter((x) => x.id !== c.id) }
    persist(next)
    pushToServer(next, mode)
  }
  function save() {
    if (!editing) return
    let next: AiStore
    if (editing.id === 0) {
      const id = store.nextId
      next = { ...store, list: [...store.list, { ...editing, id }], nextId: store.nextId + 1 }
    } else {
      next = { ...store, list: store.list.map((x) => (x.id === editing.id ? editing : x)) }
    }
    persist(next)
    setShowForm(false)
    setEditing(null)
    pushToServer(next, mode)
  }

  function onSetupKeyChange(v: string) {
    setSetupKey(v)
    try {
      localStorage.setItem(SETUP_KEY_LS, v)
    } catch {
      /* ignore */
    }
  }

  return (
    <>
      <h2>AI 设置</h2>
      <p className="lead">
        每个团队人员（任务 Agents）用「负责任务」绑定站内的一个工作流，绑定后自动生效、无需再切换「使用中」：
        种草内容生成 → 种草生成，合规预检 → 合规预检，详情页 AI 修改 → AI 修改（没人认领时自动用种草生成）。
        成员的提示词会作为 system 角色设定随请求一起发给模型；模拟模式无需配置即可演示。
      </p>

      {/* 服务端状态 + 访问口令 */}
      <div className="card">
        <div className="field" style={{ marginBottom: 10 }}>
          <label>服务端状态</label>
          <p className="note" style={{ marginBottom: 0 }}>{status}</p>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>访问口令（与服务端 EchoTik 同源，默认 1234）</label>
          <input
            className="input"
            type="password"
            placeholder="1234"
            value={setupKey}
            onChange={(e) => onSetupKeyChange(e.target.value)}
          />
          <p className="note" style={{ marginBottom: 0 }}>
            保存 Agent 配置 / 运行模式到服务端需校验此口令；本地修改随即对所有访客生效。
          </p>
        </div>
        {msg && (
          <p className="note" style={{ margin: '8px 0 0', color: msg.includes('失败') ? '#c0392b' : '#1d7a46' }}>
            {msg}
          </p>
        )}
      </div>

      {/* 运行模式（即时生效） */}
      <div className="card">
        <div className="field" style={{ marginBottom: 0 }}>
          <label>运行模式</label>
          <div className="switch">
            <button className={mode === 'mock' ? 'on' : ''} onClick={() => switchMode('mock')}>模拟数据</button>
            <button className={mode === 'real' ? 'on' : ''} onClick={() => switchMode('real')}>真实 LLM</button>
          </div>
          <p className="note" style={{ marginBottom: 0 }}>
            {mode === 'real'
              ? '真实模式下，各页面按下面的「任务分工」调用对应成员的 API 地址、模型与 Key；调用失败会安全回退到模拟数据。'
              : '模拟模式使用内置规则引擎与模板，无需网络即可演示。'}
          </p>
        </div>
      </div>

      {/* 任务分工总览（按「负责任务」自动对应） */}
      <div className="block-title" style={{ margin: '18px 0 10px' }}>任务分工（自动对应，无需切换）</div>
      <div className="card task-map">
        {assignments.map((a) => {
          const ok = !!a.agent?.apiUrl
          return (
            <div className="tm-row" key={a.task}>
              <span className="tm-task">{a.label}</span>
              <span className="tm-arrow">→</span>
              {a.agent ? (
                <span className="tm-agent">
                  {a.agent.name}
                  {a.fallbackNote && <span className="badge">{a.fallbackNote}</span>}
                  <span className={`badge ${ok ? 'badge-success' : 'badge-warning'}`}>
                    {ok ? '已配置' : '缺 API 地址'}
                  </span>
                </span>
              ) : (
                <span className="tm-agent">
                  <span className="badge badge-warning">未分配</span>
                  <span className="tm-hint">该任务将回退模拟数据</span>
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* AI 配置列表：顶部「添加新 AI」 */}
      <div style={{ display: 'flex', alignItems: 'center', margin: '18px 0 12px' }}>
        <div className="block-title" style={{ margin: 0 }}>团队成员（{store.list.length}）</div>
        <span style={{ marginLeft: 'auto' }}>
          <button className="btn btn-primary" onClick={startNew}>＋ 添加新 AI</button>
        </span>
      </div>

      {showForm && editing && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginBottom: 12 }}>{editing.id === 0 ? '添加新 AI' : '修改 AI 配置'}</h3>
          <div className="field">
            <label>任务 Agents 名字</label>
            <input className="input" placeholder="例如：种草生成 Agent" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
          </div>
          <div className="field">
            <label>AI 名字 / 平台</label>
            <input
              className="input"
              placeholder="例如：脚本导演 · OpenAI 或 GPT-4o-mini（OpenAI）"
              value={editing.aiName}
              onChange={(e) => setEditing({ ...editing, aiName: e.target.value })}
            />
          </div>
          <div className="field">
            <label>负责任务</label>
            <select className="select" value={editing.task} onChange={(e) => setEditing({ ...editing, task: e.target.value as TaskKey | '' })}>
              <option value="">未分配</option>
              {(Object.keys(TASK_LABELS) as TaskKey[]).map((k) => (
                <option key={k} value={k}>{TASK_LABELS[k]}</option>
              ))}
            </select>
            <p className="note" style={{ marginBottom: 0 }}>
              选定后，对应页面在真实模式下自动使用该成员的 API 地址、模型与提示词。
            </p>
          </div>
          <div className="field">
            <label>模型名字</label>
            <input className="input" placeholder="例如：gpt-4o-mini" value={editing.model} onChange={(e) => setEditing({ ...editing, model: e.target.value })} />
          </div>
          <div className="field">
            <label>API 地址</label>
            <input className="input" placeholder="/llm/zhipu/chat/completions 或 https://your-endpoint/api/agent" value={editing.apiUrl} onChange={(e) => setEditing({ ...editing, apiUrl: e.target.value })} />
          </div>
          <div className="field">
            <label>Key 值</label>
            <input className="input" placeholder="sk-..." value={editing.key} onChange={(e) => setEditing({ ...editing, key: e.target.value })} />
          </div>
          <div className="field">
            <label>提示词（角色设定）</label>
            <textarea
              className="textarea"
              style={{ minHeight: 160 }}
              placeholder={'例如：你是「脚本导演」，专为 TikTok 短视频种草而生……\n可粘贴完整角色提示词，真实 LLM 模式下会作为该成员的系统设定。'}
              value={editing.prompt}
              onChange={(e) => setEditing({ ...editing, prompt: e.target.value })}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={save} disabled={!editing.name.trim()}>保存</button>
            <button className="mini-btn" onClick={() => { setShowForm(false); setEditing(null) }}>取消</button>
          </div>
        </div>
      )}

      {store.list.map((c) => (
        <div className="card ai-row" key={c.id}>
          <div className="ai-info">
            <div className="ai-name">
              {c.name}
              {c.task
                ? <span className="badge">{TASK_LABELS[c.task]}</span>
                : <span className="badge badge-warning">未分配</span>}
            </div>
            <div className="ai-meta">
              AI / 平台：{c.aiName || '未配置'} · 模型：{c.model || '未配置'} · API：{c.apiUrl || '未配置'} · Key：{c.key ? `••••••${c.key.slice(-4)}` : '未配置'}
            </div>
            <div className="ai-prompt">
              {c.prompt ? `提示词：${c.prompt.slice(0, 80)}${c.prompt.length > 80 ? '…' : ''}` : '提示词：未配置'}
            </div>
          </div>
          <div className="ai-acts">
            <button className="mini-btn" onClick={() => startEdit(c)}>修改</button>
            <button className="mini-btn mini-btn-danger" onClick={() => remove(c)}>删除</button>
          </div>
        </div>
      ))}

      <p className="note">
        「负责任务」决定各页面在真实模式下调用哪个成员，无需再手动切换「使用中」。
        请求使用 OpenAI 标准格式：<code>model</code> 取成员模型名，提示词放在 <code>messages[0].system</code>，业务输入放在 <code>messages[1].user</code>，
        因此 API 地址填大模型官方的 <code>/chat/completions</code> 端点；浏览器直连若被 CORS 拦截，可改填本机代理路径：<code>/llm/zhipu/chat/completions</code>（智谱）、<code>/llm/deepseek/chat/completions</code>（DeepSeek）。
      </p>
    </>
  )
}
