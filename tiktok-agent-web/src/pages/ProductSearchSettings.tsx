import { useEffect, useState } from 'react'
import { loadEchoTik, saveEchoTik, type EchoTikConfig } from '../settings'
import { explainEchoFailure } from '../data/echotik'

// EchoTik 支持的东南亚站点（页面只用这 5 个做说明，实际以搜索页勾选为准）
const SEA_REGIONS = [
  { code: 'ID', name: '印尼' },
  { code: 'TH', name: '泰国' },
  { code: 'VN', name: '越南' },
  { code: 'PH', name: '菲律宾' },
  { code: 'MY', name: '马来西亚' },
]

export default function ProductSearchSettings() {
  const [cfg, setCfg] = useState<EchoTikConfig>(loadEchoTik())
  const [showPwd, setShowPwd] = useState(false)
  const [saved, setSaved] = useState(false)

  // 凭证表单（仅用于发送到服务端，不再存浏览器）
  const [cred, setCred] = useState({ username: '', password: '' })
  const [setupKey, setSetupKey] = useState('')
  const [serverConfigured, setServerConfigured] = useState<boolean | null>(null)
  const [credMsg, setCredMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // 测试连接
  const [testing, setTesting] = useState(false)
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [rawResp, setRawResp] = useState<string | null>(null)

  const perCountry = Math.max(1, cfg.pagesPerRegion)
  const maxItemsPerCountry = perCountry * 10
  const requestsPerSearch = SEA_REGIONS.length * perCountry

  // 进入页面时拉取服务端凭证状态（不返回明文）
  useEffect(() => {
    fetch('/__echotik_creds')
      .then((r) => r.json())
      .then((d) => setServerConfigured(!!d.configured))
      .catch(() => setServerConfigured(null))
  }, [])

  function patch(p: Partial<EchoTikConfig>) {
    setCfg({ ...cfg, ...p })
    setSaved(false)
  }

  // 仅保存数据源 / 抓取参数等到浏览器（凭证已改由服务端保存）
  function persistSettings() {
    saveEchoTik(cfg)
    setSaved(true)
  }

  async function saveCreds() {
    setCredMsg(null)
    if (!cred.username || !cred.password) {
      setCredMsg({ ok: false, text: '请填写 username 与 password' })
      return
    }
    if (!setupKey) {
      setCredMsg({ ok: false, text: '请填写访问口令（默认 1234，见 .env 的 ECHOTIK_SETUP_KEY）' })
      return
    }
    try {
      const res = await fetch('/__echotik_creds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Setup-Key': setupKey },
        body: JSON.stringify({ username: cred.username, password: cred.password }),
      })
      if (res.status === 401) {
        setCredMsg({ ok: false, text: '访问口令错误' })
        return
      }
      const d = (await res.json().catch(() => ({}))) as any
      if (!res.ok) {
        setCredMsg({ ok: false, text: d.error || '保存失败' })
        return
      }
      setCredMsg({ ok: true, text: '已保存到服务端，所有访客立即生效（无需刷新页面）' })
      setServerConfigured(true)
    } catch (e: any) {
      setCredMsg({ ok: false, text: `请求失败：${String(e?.message ?? e)}` })
    }
  }

  async function clearCreds() {
    setCredMsg(null)
    if (!setupKey) {
      setCredMsg({ ok: false, text: '请填写访问口令' })
      return
    }
    try {
      const res = await fetch('/__echotik_creds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Setup-Key': setupKey },
        body: JSON.stringify({ username: '', password: '' }),
      })
      if (res.status === 401) {
        setCredMsg({ ok: false, text: '访问口令错误' })
        return
      }
      const d = (await res.json().catch(() => ({}))) as any
      if (!res.ok) {
        setCredMsg({ ok: false, text: d.error || '清空失败' })
        return
      }
      setCredMsg({ ok: true, text: '已清空服务端凭证，所有访客将回退本地演示数据' })
      setServerConfigured(false)
      setCred({ username: '', password: '' })
    } catch (e: any) {
      setCredMsg({ ok: false, text: `请求失败：${String(e?.message ?? e)}` })
    }
  }

  async function testConnection() {
    setTesting(true)
    setTestMsg(null)
    setRawResp(null)
    try {
      // 不自带 Authorization：由 Vite 代理在服务端注入当前生效的凭证
      const url = `/echotik/product/list?region=TH&page_num=1&page_size=10&product_sort_field=5&sort_type=1`
      const res = await fetch(url, { method: 'GET' })
      const text = await res.text()
      let data: any = null
      let parseErr = ''
      try {
        data = JSON.parse(text)
      } catch (e: any) {
        parseErr = String(e?.message ?? e)
      }
      const head = `HTTP ${res.status} ${res.statusText}\nContent-Type: ${res.headers.get('content-type') ?? '(无)'}${parseErr ? `\nJSON 解析失败：${parseErr}` : ''}\n\n`
      setRawResp(head + (text ? text.slice(0, 3000) : '(body 为空)'))
      const bizMsg =
        data && data.code && data.code !== 200 && data.code !== 0
          ? String(data.message ?? data.msg ?? '未知业务错误')
          : null
      if (!res.ok || bizMsg) {
        // 用统一诊断给出「下一步该做什么」，而不是笼统地归到「凭证无效」
        const hint = explainEchoFailure(res.status, bizMsg ?? '')
        setTestMsg({
          ok: false,
          text: `连接失败：HTTP ${res.status}${bizMsg ? `（${bizMsg}）` : ''}\n${hint.summary}。${hint.advice}`,
        })
        return
      }
      if (data == null) {
        const looksLikeApp = /<!doctype html|<title[^>]*>/i.test(text)
        setTestMsg({
          ok: false,
          text: looksLikeApp
            ? '返回的是本应用的 HTML 页面而非接口数据 —— 当前预览实例没有加载 /echotik 代理（旧实例）。请关闭旧预览窗口、刷新或重新打开最新预览地址后重试。'
            : '接口返回 2xx，但 body 不是合法 JSON。请展开「原始响应」查看，并发给我以便定位。',
        })
        return
      }
      const d: any = data?.data
      const cnt = Array.isArray(d)
        ? d.length
        : Array.isArray(d?.list)
          ? d.list.length
          : Array.isArray(d?.records)
            ? d.records.length
            : Array.isArray(data?.list)
              ? data.list.length
              : 0
      if (cnt === 0) {
        setTestMsg({
          ok: false,
          text: '认证通过、接口正常响应，但泰国站返回 0 条商品。通常意味着当前套餐未包含该站点数据权限（EchoTik 按站点/数据包售卖），或该站数据尚未收录。请到 EchoTik 开放平台核对已购站点范围。',
        })
        return
      }
      setTestMsg({ ok: true, text: `连接成功，样例返回 ${cnt} 条商品（泰国 · 1 页 10 条，按 30 日销量降序）` })
    } catch (e: any) {
      setTestMsg({
        ok: false,
        text: `请求失败：${String(e?.message ?? e)}。若提示 Failed to fetch / 404，说明 /echotik 代理尚未配置。`,
      })
    } finally {
      setTesting(false)
    }
  }

  const ready = serverConfigured === true

  return (
    <>
      <h2>搜索配置 · EchoTik 数据源</h2>
      <p className="lead">
        配置 EchoTik 开放平台的调用凭证，爆品搜索页即可从「本地演示数据」切换到「EchoTik 实时数据」。
        凭证保存在<strong>服务端</strong>（Vite 代理读取并注入 Authorization），所有访客无需填写即可看实时数据；
        你在下面改了账号，全站立即生效。
      </p>

      {/* ① 数据源开关 */}
      <div className="card">
        <div className="field" style={{ marginBottom: 0 }}>
          <label>数据源</label>
          <div className="switch">
            <button
              className={cfg.source === 'local' ? 'on' : ''}
              onClick={() => patch({ source: 'local' })}
            >
              本地演示数据
            </button>
            <button
              className={cfg.source === 'echotik' ? 'on' : ''}
              onClick={() => patch({ source: 'echotik' })}
            >
              EchoTik 实时
            </button>
          </div>
          <p className="note" style={{ marginBottom: 0 }}>
            {cfg.source === 'echotik'
              ? ready
                ? '爆品搜索页点「搜索」时将调用 EchoTik 接口；失败会自动回退本地数据并在页面顶部提示原因。'
                : '已选 EchoTik 实时：服务端尚未配置凭证，将自动使用访客本地回退数据。请先在下方「EchoTik 凭证」填写并保存。'
              : '使用内置 18 条演示样本，不消耗接口额度，无需凭证。'}
          </p>
        </div>
      </div>

      {/* ② 凭证（保存到服务端） */}
      <div className="block-title" style={{ margin: '18px 0 10px' }}>
        EchoTik 凭证
        <span
          className={`badge ${ready ? 'badge-success' : serverConfigured === false ? 'badge-warning' : 'badge-info'}`}
          style={{ marginLeft: 8 }}
        >
          {ready ? '服务端已配置' : serverConfigured === false ? '服务端未配置' : '检测中…'}
        </span>
      </div>
      <div className="card">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>username</label>
            <input
              className="input"
              placeholder="EchoTik 开放平台 username"
              value={cred.username}
              onChange={(e) => setCred({ ...cred, username: e.target.value })}
              autoComplete="off"
            />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>password</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="input"
                type={showPwd ? 'text' : 'password'}
                placeholder="EchoTik 开放平台 password"
                value={cred.password}
                onChange={(e) => setCred({ ...cred, password: e.target.value })}
                autoComplete="off"
              />
              <button className="mini-btn" onClick={() => setShowPwd((s) => !s)}>
                {showPwd ? '隐藏' : '显示'}
              </button>
            </div>
          </div>
        </div>

        <div className="field" style={{ marginTop: 14 }}>
          <label>访问口令</label>
          <input
            className="input"
            type="password"
            placeholder="默认 1234（见 .env 的 ECHOTIK_SETUP_KEY）"
            value={setupKey}
            onChange={(e) => setSetupKey(e.target.value)}
            autoComplete="off"
          />
          <p className="note" style={{ marginBottom: 0 }}>
            保存凭证需校验此口令，防止公开链接被他人随意更改你的 EchoTik 账号。改 <code>.env</code> 的{' '}
            <code>ECHOTIK_SETUP_KEY</code> 即可更换（需重新 build + 重启预览）。
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={saveCreds}>
            保存凭证（服务端）
          </button>
          <button className="btn btn-ghost" onClick={testConnection} disabled={testing}>
            {testing ? '测试中…' : '测试连接'}
          </button>
          <button className="mini-btn mini-btn-danger" onClick={clearCreds}>
            清空凭证
          </button>
        </div>

        {credMsg && (
          <p className={`note ${credMsg.ok ? '' : 'note-warn'}`} style={{ marginTop: 10, marginBottom: 0 }}>
            {credMsg.ok ? '✅ ' : '❌ '}
            {credMsg.text}
          </p>
        )}

        {testMsg && (
          <p className={`note ${testMsg.ok ? '' : 'note-warn'}`} style={{ marginTop: 10, marginBottom: 0 }}>
            {testMsg.ok ? '✅ ' : '❌ '}
            {testMsg.text}
          </p>
        )}

        {rawResp && (
          <details style={{ marginTop: 8 }}>
            <summary style={{ cursor: 'pointer', fontSize: 12.5, color: 'var(--c-text-2)' }}>
              查看原始响应（排查用，前 3000 字符）
            </summary>
            <pre
              style={{
                margin: '8px 0 0',
                padding: 12,
                background: 'var(--c-gray-100)',
                borderRadius: 8,
                fontSize: 12,
                lineHeight: 1.5,
                overflow: 'auto',
                maxHeight: 260,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
              }}
            >
              {rawResp}
            </pre>
          </details>
        )}
      </div>

      {/* ③ 抓取参数 */}
      <div className="block-title" style={{ margin: '18px 0 10px' }}>抓取参数</div>
      <div className="card">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>每个国家拉取页数</label>
            <select
              className="select"
              value={String(perCountry)}
              onChange={(e) => patch({ pagesPerRegion: Number(e.target.value) })}
            >
              <option value="1">1 页（10 条）— 最省额度</option>
              <option value="2">2 页（20 条）</option>
              <option value="3">3 页（30 条）</option>
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>结果缓存时长</label>
            <select
              className="select"
              value={String(cfg.cacheMinutes)}
              onChange={(e) => patch({ cacheMinutes: Number(e.target.value) })}
            >
              <option value="0">不缓存（每次都真实请求）</option>
              <option value="10">10 分钟</option>
              <option value="30">30 分钟</option>
              <option value="60">60 分钟</option>
            </select>
          </div>
        </div>
        <p className="note" style={{ marginTop: 10, marginBottom: 0 }}>
          EchoTik 的 <code>region</code> 为单值必填、<code>page_size</code> 上限 10，所以最多覆盖{' '}
          {SEA_REGIONS.length} 个国家时，一次搜索 = 最多 <strong>{requestsPerSearch}</strong> 次请求、最多{' '}
          <strong>{maxItemsPerCountry * SEA_REGIONS.length}</strong> 条商品。
          免费额度 50 次，请配合缓存使用。实际每次搜哪些国家，由「爆品种草 → 爆品搜索」页面的站点勾选决定。
        </p>
        <div style={{ marginTop: 12 }}>
          <button className="btn btn-primary" onClick={persistSettings}>
            {saved ? '已保存设置' : '保存设置'}
          </button>
        </div>
      </div>

      {/* ④ 覆盖站点（展示可搜索国家，实际勾选在爆品搜索页） */}
      <div className="block-title" style={{ margin: '18px 0 10px' }}>
        可搜索国家
        <span className="badge badge-info" style={{ marginLeft: 8 }}>
          EchoTik 支持
        </span>
      </div>
      <div className="card">
        <div className="chip-row">
          {SEA_REGIONS.map((r) => (
            <span key={r.code} className="chip on" style={{ cursor: 'default' }}>
              {r.name} {r.code}
            </span>
          ))}
        </div>
        <p className="note" style={{ marginBottom: 0 }}>
          以上 5 个东南亚国家均可通过 EchoTik 接口搜索。<strong>具体每次搜索哪些国家，请在「爆品种草 → 爆品搜索」页面的站点勾选决定</strong>
          （配置页仅作展示，不再控制默认勾选）。
        </p>
      </div>

      <p className="note">
        凭证获取路径：<code>echotik.live</code> 注册 → 控制台 <code>/platform/api-keys</code> 生成
        username / password（不是 Bearer Token，是 HTTP Basic 认证）。
        <br />
        ⚠️ 凭证由 <strong>服务端（Vite 代理读取 <code>echotik-credentials.json</code> / <code>.env</code>）统一注入
        Authorization</strong>，所有访客无需填账号即可看实时数据；修改后立即对所有访客生效。
        <code>echotik-credentials.json</code> 含密钥，已加入 .gitignore，请勿提交到公开仓库或转发他人。
        <br />
        EchoTik 数据为 T+1 离线估算值，商品未被收录时返回空数组属正常现象，不是接口故障。
      </p>
    </>
  )
}
