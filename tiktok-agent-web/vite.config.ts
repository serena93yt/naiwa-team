import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
import fs from 'node:fs'
import path from 'node:path'

// LLM 代理：浏览器直连大模型接口会被 CORS 预检拦截（如智谱不返回预检跨域头），
// 改走同源 /llm/* 由 dev/preview 服务器转发，绕开跨域限制。
// 用法：AI 配置的 API 地址填 /llm/zhipu/chat/completions（或 /llm/deepseek/chat/completions）
const llmProxy: Record<string, { target: string; changeOrigin: boolean; rewrite: (p: string) => string }> = {
  '/llm/zhipu': {
    target: 'https://open.bigmodel.cn',
    changeOrigin: true,
    rewrite: (p) => p.replace(/^\/llm\/zhipu/, '/api/paas/v4'),
  },
  '/llm/deepseek': {
    target: 'https://api.deepseek.com',
    changeOrigin: true,
    rewrite: (p) => p.replace(/^\/llm\/deepseek/, '/v1'),
  },
}

// EchoTik 代理：真实接口在 open.echotik.live/api/v3/echotik/* 下，
// 前端统一以 /echotik 开头拼接（如 /echotik/product/list），由本代理去掉前缀后转发到
// https://open.echotik.live/api/v3/echotik，绕开浏览器跨域预检。
// 凭证由「服务端动态凭据」注入 Authorization 头：优先读 echotik-credentials.json
// （由搜索配置页通过口令保存的实时状态），否则回退到 .env 的初始值。
const echotikProxyBase = {
  target: 'https://open.echotik.live/api/v3/echotik',
  changeOrigin: true,
  secure: true,
  rewrite: (p: string) => p.replace(/^\/echotik/, ''),
}

// ===== 服务端动态凭据（页面可经口令热更新，落盘到 echotik-credentials.json）=====
// 放在模块级 let，代理每次请求从它读取，POST 更新后即时对所有访客生效。
const CRED_FILE = path.resolve(process.cwd(), 'echotik-credentials.json')
type Creds = { username: string; password: string }
let liveCreds: Creds = { username: '', password: '' }
let SETUP_KEY = '1234'

function loadInitialCreds(env: Record<string, string | undefined>) {
  let c: Creds = { username: env.ECHOTIK_USERNAME || '', password: env.ECHOTIK_PASSWORD || '' }
  try {
    if (fs.existsSync(CRED_FILE)) {
      const j = JSON.parse(fs.readFileSync(CRED_FILE, 'utf-8'))
      if (j && typeof j.username === 'string' && typeof j.password === 'string') c = j
    }
  } catch {
    /* 文件损坏则忽略，回退 .env */
  }
  liveCreds = c
}

// 凭据保存接口：GET 返回是否已配置（不回明文）；POST 经口令校验后写入（空值=清空）
function buildCredsMiddleware() {
  return (req: any, res: any, next: any) => {
    if (!req.url || !req.url.startsWith('/__echotik_creds')) return next()
    if (req.method === 'GET') {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ configured: !!(liveCreds.username && liveCreds.password) }))
      return
    }
    if (req.method === 'POST') {
      if (req.headers['x-setup-key'] !== SETUP_KEY) {
        res.statusCode = 401
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: 'bad key' }))
        return
      }
      let body = ''
      req.on('data', (c: any) => (body += c))
      req.on('end', () => {
        let payload: any = {}
        try {
          payload = JSON.parse(body || '{}')
        } catch {
          /* 忽略解析错误 */
        }
        const username: string = payload.username ?? ''
        const password: string = payload.password ?? ''
        // 两者皆空 = 清空
        if (!username && !password) {
          liveCreds = { username: '', password: '' }
          try {
            fs.writeFileSync(CRED_FILE, JSON.stringify(liveCreds))
          } catch {
            /* ignore */
          }
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: true, cleared: true }))
          return
        }
        if (!username || !password) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'need both username and password' }))
          return
        }
        liveCreds = { username, password }
        try {
          fs.writeFileSync(CRED_FILE, JSON.stringify(liveCreds))
        } catch {
          /* ignore */
        }
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: true }))
      })
      return
    }
    res.statusCode = 405
    res.end()
  }
}

// ===== 服务端 AI 设置（智能体配置 + 运行模式）=====
// 与 EchoTik 凭证同思路：Agent 的模型 / API 地址 / Key / 提示词 以及「运行模式」
// 原本只存于各访客的浏览器 localStorage。改为服务端持久化后，运营在设置页改一次，
// 经同一道口令（ECHOTIK_SETUP_KEY）写入 ai-store.json，对所有访客即时生效。
const AI_STORE_FILE = path.resolve(process.cwd(), 'ai-store.json')
let liveAiStore: { list: any[]; nextId: number } | null = null
let liveMode: string = 'mock'

function loadInitialAiStore() {
  try {
    if (fs.existsSync(AI_STORE_FILE)) {
      const j = JSON.parse(fs.readFileSync(AI_STORE_FILE, 'utf-8'))
      if (j && j.store && Array.isArray(j.store.list) && j.store.list.length) {
        liveAiStore = j.store
        liveMode = j.mode === 'real' ? 'real' : 'mock'
        return
      }
    }
  } catch {
    /* 文件损坏则忽略，回退前端内置种子 */
  }
  liveAiStore = null
  liveMode = 'mock'
}

// AI 设置接口：GET 返回当前服务端配置（未初始化则返回空）；
// POST 经口令校验后整体写入（含运行模式 + Agent 列表），即时对所有访客生效。
function buildAiStoreMiddleware() {
  return (req: any, res: any, next: any) => {
    if (!req.url || !req.url.startsWith('/__ai_store')) return next()
    if (req.method === 'GET') {
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          configured: !!(liveAiStore && liveAiStore.list.length),
          mode: liveMode,
          store: liveAiStore ?? { list: [], nextId: 1 },
        }),
      )
      return
    }
    if (req.method === 'POST') {
      if (req.headers['x-setup-key'] !== SETUP_KEY) {
        res.statusCode = 401
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: 'bad key' }))
        return
      }
      let body = ''
      req.on('data', (c: any) => (body += c))
      req.on('end', () => {
        let payload: any = {}
        try {
          payload = JSON.parse(body || '{}')
        } catch {
          /* ignore */
        }
        const store = payload.store
        const mode = payload.mode === 'real' ? 'real' : 'mock'
        if (!store || !Array.isArray(store.list)) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'invalid store' }))
          return
        }
        liveAiStore = store
        liveMode = mode
        try {
          fs.writeFileSync(AI_STORE_FILE, JSON.stringify({ mode: liveMode, store: liveAiStore }))
        } catch {
          /* ignore */
        }
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: true }))
      })
      return
    }
    res.statusCode = 405
    res.end()
  }
}

// ===== 服务端知识库（四库：市场画像 / 合规 / 文化 / 脚本模板）=====
// 与 AI 设置同思路：运营在「知识库」页经同一道口令写入 kb-store.json，对所有访客即时生效。
const KB_FILE = path.resolve(process.cwd(), 'kb-store.json')
let liveKb: any[] | null = null

function loadInitialKb() {
  try {
    if (fs.existsSync(KB_FILE)) {
      const j = JSON.parse(fs.readFileSync(KB_FILE, 'utf-8'))
      if (j && Array.isArray(j.entries)) {
        liveKb = j.entries
        return
      }
    }
  } catch {
    /* 文件损坏则忽略，回退前端内置种子 */
  }
  liveKb = null
}

function buildKbStoreMiddleware() {
  return (req: any, res: any, next: any) => {
    if (!req.url || !req.url.startsWith('/__kb_store')) return next()
    if (req.method === 'GET') {
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          configured: !!(liveKb && liveKb.length),
          entries: liveKb ?? [],
        }),
      )
      return
    }
    if (req.method === 'POST') {
      if (req.headers['x-setup-key'] !== SETUP_KEY) {
        res.statusCode = 401
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: 'bad key' }))
        return
      }
      let body = ''
      req.on('data', (c: any) => (body += c))
      req.on('end', () => {
        let payload: any = {}
        try {
          payload = JSON.parse(body || '{}')
        } catch {
          /* ignore */
        }
        const entries = payload.entries
        if (!Array.isArray(entries)) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'invalid entries' }))
          return
        }
        liveKb = entries
        try {
          fs.writeFileSync(KB_FILE, JSON.stringify({ entries: liveKb }))
        } catch {
          /* ignore */
        }
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: true }))
      })
      return
    }
    res.statusCode = 405
    res.end()
  }
}

// 将中间件插到中间件栈最前，确保它在 Vite 的 SPA fallback / 静态服务之前拦截
// 专属路径 /__echotik_creds、/__ai_store 与 /__kb_store（否则会被 SPA fallback 当作页面返回 HTML）。
function prependMiddleware(server: any, mw: any) {
  server.middlewares.use(mw)
  const stack = server.middlewares.stack as any[]
  const idx = stack.findIndex((l) => l.handle === mw)
  if (idx > 0) {
    const [item] = stack.splice(idx, 1)
    stack.unshift(item)
  }
}

// 以插件形式注册中间件（configureServer / configurePreviewServer 是插件钩子，
// 不能写成 server/preview 配置项，否则不会被执行）。
function echotikCredsPlugin() {
  const mw1 = buildCredsMiddleware()
  const mw2 = buildAiStoreMiddleware()
  const mw3 = buildKbStoreMiddleware()
  return {
    name: 'echotik-creds',
    configureServer(server: any) {
      prependMiddleware(server, mw1)
      prependMiddleware(server, mw2)
      prependMiddleware(server, mw3)
    },
    configurePreviewServer(server: any) {
      prependMiddleware(server, mw1)
      prependMiddleware(server, mw2)
      prependMiddleware(server, mw3)
    },
  }
}

// 纯前端原型：base 用相对路径，便于本地预览与静态托管
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  loadInitialCreds(env)
  loadInitialAiStore()
  loadInitialKb()
  SETUP_KEY = env.ECHOTIK_SETUP_KEY || '1234'

  const echotikProxy = {
    ...echotikProxyBase,
    configure: (proxy: any) => {
      proxy.on('proxyReq', (proxyReq: any) => {
        // 每次请求都从动态凭据读取并注入；覆盖浏览器可能带来的（或无）Authorization 头
        if (liveCreds.username && liveCreds.password) {
          proxyReq.setHeader(
            'Authorization',
            `Basic ${Buffer.from(`${liveCreds.username}:${liveCreds.password}`).toString('base64')}`,
          )
        }
      })
    },
  }

  const proxies = { ...llmProxy, '/echotik': echotikProxy }

  // 单文件演示版：npm run build:single（vite build --mode single）
  // 把 JS/CSS 全部内联进一个 index.html，产出 dist-single/index.html，
  // 双击即可打开、可直接发给别人，无需任何服务器。
  // 注意：此模式下没有服务端，应用会自动降级为「模拟数据 + 本地演示数据」
  // （见 src/settings.ts 的 isStandaloneDemo）。
  const isSingle = mode === 'single'

  return {
    plugins: [react(), echotikCredsPlugin(), ...(isSingle ? [viteSingleFile()] : [])],
    base: './',
    build: isSingle
      ? {
          outDir: 'dist-single',
          // 内联所有资源，避免单文件外还有碎片文件
          assetsInlineLimit: 100 * 1024 * 1024,
          cssCodeSplit: false,
          chunkSizeWarningLimit: 100 * 1024 * 1024,
        }
      : {},
    // 允许任意 Host（含公网隧道等随机子域名）访问 dev/preview 服务
    server: { allowedHosts: true, proxy: proxies },
    preview: { allowedHosts: true, proxy: proxies },
  }
})
