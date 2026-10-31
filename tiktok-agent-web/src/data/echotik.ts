// ===== EchoTik 真实接口适配层 =====
// 数据源：open.echotik.live/api/v3/echotik/*
// 认证：HTTP Basic（Authorization: Basic base64(username:password)）
// 代理：前端以 /echotik 开头拼接，由 vite.config.ts 去掉前缀转发到上面地址，绕开浏览器跨域。
//
// 关键字段说明（来自官方 OpenAPI 文档）：
//  - 商品列表：GET /echotik/product/list，必填 region，page_size 上限 10（须为 10 的倍数）。
//    排序 productSortField：1=总销量 2=总GMV 3=均价 4=7日销量 5=30日销量 6=7日GMV 7=30日GMV；sortType 0升1降。
//  - 商品字段（snake_case，全部可选）：product_id / product_name / region / category_id(l1/l2/l3) /
//    cover_url(JSON数组) / skus(JSON,含real_price.price_val与currency) / spu_avg_price / min_price / max_price /
//    product_rating / review_count / product_commission_rate(0.05=5%) / total_sale_*_cnt / total_sale_gmv_*_amt /
//    sales_flag(1=视频 2=直播) / sales_trend_flag(0=平稳 1=飙升 2=下滑) / total_video_cnt / total_live_cnt /
//    total_ifl_cnt(达人数) / seller_id 等。
//  - 类目字典：GET /echotik/category/l1 (language) → 一级；/category/l3 (language, parent_id) → 三级。
//  - 注意：实时数据**没有现成 growthRate 字段**，改用「近 7 日日均 ÷ 前 23 日日均 − 1」近似推算；rank 仅在榜单接口有，列表接口无。

import type { EchoTikConfig } from '../settings'
import { echoTikAuthHeader } from '../settings'
import { buildHits, type ProductHit, type SearchCriteria, type TikTokProduct, type TrendFlag } from './products'

// ---------- 区域币种映射（用于展示符号；数据若带回 currency 代码则优先用代码） ----------
export const REGION_CURRENCY: Record<string, string> = {
  ID: 'Rp', // 印尼盾
  TH: '฿', // 泰铢
  VN: '₫', // 越南盾
  PH: '₱', // 菲律宾比索
  MY: 'RM', // 马来西亚林吉特
}

const CURRENCY_CODE_SYMBOL: Record<string, string> = {
  IDR: 'Rp', THB: '฿', VND: '₫', PHP: '₱', MYR: 'RM', USD: '$',
}

// sales_trend_flag 枚举 → 本地趋势标签
const TREND_FLAG_MAP: Record<number, TrendFlag> = { 0: '平稳', 1: '飙升', 2: '下滑' }

// ---------- 原始返回结构（仅列用到的字段，其余忽略） ----------
interface EchoRawProduct {
  product_id?: string
  product_name?: string
  region?: string
  category_id?: string
  category_l2_id?: string
  category_l3_id?: string
  cover_url?: string
  skus?: string
  spu_avg_price?: number
  min_price?: number
  max_price?: number
  product_rating?: number
  review_count?: number
  product_commission_rate?: number
  total_sale_cnt?: number
  total_sale_7d_cnt?: number
  total_sale_30d_cnt?: number
  total_sale_gmv_amt?: number
  total_sale_gmv_7d_amt?: number
  sales_flag?: number
  sales_trend_flag?: number
  total_video_cnt?: number
  total_live_cnt?: number
  total_ifl_cnt?: number
  seller_id?: string
  first_crawl_dt?: number
}

function parseCover(raw: EchoRawProduct): string {
  if (!raw.cover_url) return ''
  try {
    const arr = JSON.parse(raw.cover_url)
    if (Array.isArray(arr) && arr.length) {
      const sorted = [...arr].sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
      return sorted[0]?.url ?? ''
    }
  } catch {
    /* 非 JSON，忽略 */
  }
  return ''
}

function parsePrice(raw: EchoRawProduct): { price: number; currency: string } {
  let price: number | undefined
  let currency = ''
  if (raw.skus) {
    try {
      const skus = JSON.parse(raw.skus)
      if (Array.isArray(skus) && skus.length) {
        const rp = skus[0]?.real_price
        if (rp) {
          price = Number(rp.price_val) || undefined
          currency = rp.currency ?? ''
        }
      }
    } catch {
      /* ignore */
    }
  }
  if (price == null) price = raw.spu_avg_price ?? raw.min_price ?? 0
  // 优先用带回的币种代码，再回退区域符号
  const symbol = CURRENCY_CODE_SYMBOL[currency] ?? REGION_CURRENCY[raw.region ?? ''] ?? ''
  return { price, currency: symbol || 'USD' }
}

function toCommissionRate(v?: number): number {
  if (v == null) return 0
  return v > 1 ? v / 100 : v // 0.05=5%，若误传成 5 则 /100
}

// EchoTik 列表接口没有现成的「增长率」字段，改用销量近似推算：
//   近 7 日日均 = total_sale_7d_cnt / 7
//   前 23 日日均 = (total_sale_30d_cnt - total_sale_7d_cnt) / 23
//   近似增长率 = (近7日日均 / 前23日日均 - 1) × 100
// 数据不足（缺失 / 7日≥30日 / 前23日为0）时返回 0，由评分逻辑跳过该筛选。
function deriveGrowthRate(sale7d?: number, sale30d?: number): number {
  const s7 = sale7d ?? 0
  const s30 = sale30d ?? 0
  if (s7 <= 0 || s30 <= s7) return 0
  const prev23 = s30 - s7
  if (prev23 <= 0) return 0
  const rate = (s7 / 7 / (prev23 / 23) - 1) * 100
  return Math.round(rate)
}

// 原始商品 → 统一 TikTokProduct 结构（growthRate 未知置 0，rank / 类目名 / 店铺名列表接口无）
export function normalizeProduct(raw: EchoRawProduct): TikTokProduct {
  const { price, currency } = parsePrice(raw)
  const trend: TrendFlag = TREND_FLAG_MAP[raw.sales_trend_flag ?? 0] ?? '平稳'
  return {
    productId: raw.product_id ?? '',
    title: raw.product_name ?? '',
    region: raw.region ?? '',
    categoryName: raw.category_id ?? '', // 列表接口只回类目 ID，无名称
    categoryIds: [raw.category_id, raw.category_l2_id, raw.category_l3_id].filter(Boolean).join(' > '),
    imageUrl: parseCover(raw),
    price,
    minPrice: raw.min_price ?? price,
    maxPrice: raw.max_price ?? price,
    currency,
    totalSaleCnt: raw.total_sale_cnt ?? 0,
    totalSale1dCnt: 0,
    totalSale7dCnt: raw.total_sale_7d_cnt ?? 0,
    totalSale30dCnt: raw.total_sale_30d_cnt ?? 0,
    totalSaleGmvAmt: raw.total_sale_gmv_amt ?? 0,
    totalSaleGmv7dAmt: raw.total_sale_gmv_7d_amt ?? 0,
    growthRate: deriveGrowthRate(raw.total_sale_7d_cnt, raw.total_sale_30d_cnt), // 由 7d/30d 销量近似推算
    salesTrendFlagText: trend,
    rank: 0,
    shopName: '',
    shopSellerId: raw.seller_id ?? '',
    shopTotalUnitsSold: raw.total_sale_cnt ?? 0,
    isCrossBorder: false,
    offShelvesText: '在售',
    totalVideoCnt: raw.total_video_cnt ?? 0,
    totalLiveCnt: raw.total_live_cnt ?? 0,
    creatorCount: raw.total_ifl_cnt ?? 0,
    tiktokUrl: '',
    productCommissionRate: toCommissionRate(raw.product_commission_rate),
    productRating: raw.product_rating ?? 0,
    reviewCount: raw.review_count ?? 0,
    season: '日常',
    emoji: '🛍️',
    summary: raw.product_name ?? '',
    contentAngles: [],
  }
}

// ---------- 结果缓存（localStorage，按 region+page 维度） ----------
const CACHE_KEY = 'tikboost_echotik_cache'
type CacheStore = Record<string, { ts: number; data: EchoRawProduct[] }>

function readCache(): CacheStore {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}')
  } catch {
    return {}
  }
}
function writeCache(store: CacheStore) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(store))
  } catch {
    /* 忽略容量异常 */
  }
}

function cacheKey(region: string, page: number): string {
  return `${region}_${page}`
}

// ---------- 错误诊断：把 HTTP 状态码 / body 提示翻译成「下一步该做什么」 ----------
// 结论来自对本账号的真实实测（2026-10-31）：
//   无 Authorization 头      → 403 "get auth error"
//   错误的用户名/密码        → 403 "auth error or uri forbidden"
//   凭证正确但额度耗尽       → 402 "Usage Limit Exceeded..."（连类目字典等接口也一并 402，属整账号级别）
export type EchoErrorKind = 'quota' | 'auth' | 'proxy' | 'ratelimit' | 'server' | 'unknown'

export interface EchoErrorHint {
  kind: EchoErrorKind
  summary: string // 一句话定性
  advice: string // 可执行的处理建议
}

export function explainEchoFailure(status: number, bizMsg?: string): EchoErrorHint {
  const msg = (bizMsg ?? '').toLowerCase()
  const isQuota = status === 402 || msg.includes('usage limit') || msg.includes('quota')
  const isAuth = status === 401 || status === 403
  const isProxy = status === 404
  const isRate = status === 429

  if (isQuota) {
    return {
      kind: 'quota',
      summary: '凭证有效，但账号套餐额度已耗尽（或套餐已到期）',
      advice:
        '这是 EchoTik 账号侧的计费问题，代码无需改动：请到 EchoTik 开放平台控制台续费或申请提高调用额度；' +
        '额度恢复后直接重试即可（无需改代码、无需重启服务）。注意 402 是整账号级别，所有接口都会一起失败。',
    }
  }
  if (isAuth) {
    return {
      kind: 'auth',
      summary: '凭证无效或服务端未配置凭证',
      advice:
        '请在「搜索配置」页用访问口令重新保存一次 username / password；' +
        '若确认已保存仍报错，多半是账号密码本身有误或该密钥已被停用，需到 EchoTik 开放平台核对。',
    }
  }
  if (isProxy) {
    return {
      kind: 'proxy',
      summary: '代理路径未配置（/echotik 未生效）',
      advice: '当前预览实例没有加载 vite.config.ts 里的 /echotik 代理。请重启预览服务后重试。',
    }
  }
  if (isRate) {
    return {
      kind: 'ratelimit',
      summary: '调用频率超限',
      advice: '已被限流，请降低每国抓取页数（减少并发请求）或稍后重试。',
    }
  }
  if (status >= 500) {
    return {
      kind: 'server',
      summary: 'EchoTik 服务端异常',
      advice: '属对方服务故障，请稍后重试；若持续失败可联系 EchoTik 技术支持。',
    }
  }
  return {
    kind: 'unknown',
    summary: '未知错误',
    advice: '请展开「原始响应」查看完整返回，并核对接口参数（如 region、page_size）。',
  }
}

// ---------- 网络请求 ----------
async function requestJson(cfg: EchoTikConfig, path: string, params: Record<string, string | number>): Promise<any> {
  const base = (cfg.apiBase || '/echotik').replace(/\/+$/, '')
  const url = `${base}${path}?${new URLSearchParams(params as any).toString()}`
  const auth = echoTikAuthHeader(cfg)
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      // 仅当本地存了凭证才带；若为空，由 Vite 代理（.env 服务端凭证）注入
      ...(auth ? { Authorization: auth } : {}),
    },
  })
  const json = await res.json().catch(() => null)
  if (!res.ok || (json && json.code && json.code !== 200 && json.code !== 0)) {
    // EchoTik 同时用 HTTP 状态码和 body.code 表达错误（如 {"code":403,"message":"get auth error"}），
    // 这里把 body 里的中文/英文原因一并带上，并附上一句可执行的诊断建议（402 额度 / 403 凭证 / 404 代理）。
    const bizMsg = json?.message ?? json?.msg ?? res.statusText
    const hint = explainEchoFailure(res.status, String(bizMsg ?? ''))
    throw new Error(`接口返回 ${res.status}${bizMsg ? `（${bizMsg}）` : ''} —— ${hint.summary}。${hint.advice}`)
  }
  return json
}

// 拉取单个 region 单页；命中有效缓存直接返回
async function fetchListPage(cfg: EchoTikConfig, region: string, page: number): Promise<EchoRawProduct[]> {
  const ck = cacheKey(region, page)
  const ttl = Math.max(0, cfg.cacheMinutes) * 60 * 1000
  const store = readCache()
  const hit = store[ck]
  if (ttl > 0 && hit && Date.now() - hit.ts < ttl) {
    return hit.data
  }
  const json = await requestJson(cfg, '/product/list', {
    region,
    page_num: page,
    page_size: 10,
    product_sort_field: 5, // 30 日销量降序，保证爆品优先（文档参数为 snake_case：product_sort_field）
    sort_type: 1,
  })
  const list: EchoRawProduct[] = Array.isArray(json?.data)
    ? json.data
    : Array.isArray(json?.data?.list)
      ? json.data.list
      : []
  if (ttl > 0) {
    store[ck] = { ts: Date.now(), data: list }
    writeCache(store)
  }
  return list
}

// ---------- 封面图：官方明确「EchoTik 返回的图片 URL 都不能直接访问」 ----------
// 必须调用 GET /batch/cover/download?cover_urls=... 换取临时可访问 URL（有效期 24 小时），
// 且该接口**不消耗调用次数**。仅当原图 Host 为 echosell-images.tos-ap-southeast-1.volces.com
// 才能换到；其他域名说明 EchoTik 尚未下载该图（1-3 天内异步补），此时保持原状即可。
const COVER_CACHE_KEY = 'tikboost_echotik_cover_cache_v1'
const COVER_TTL = 20 * 60 * 60 * 1000 // 临时链接 24h，留 4h 安全余量
const COVER_HOST = 'echosell-images.tos-ap-southeast-1.volces.com'
type CoverCache = Record<string, { dest: string; ts: number }>

function readCoverCache(): CoverCache {
  try { return JSON.parse(localStorage.getItem(COVER_CACHE_KEY) || '{}') } catch { return {} }
}
function writeCoverCache(c: CoverCache) {
  try { localStorage.setItem(COVER_CACHE_KEY, JSON.stringify(c)) } catch { /* 忽略容量异常 */ }
}

// 同步读取本地已换好且在有效期内的临时链接（首屏立即渲染，无需等待网络）
export function getCachedCovers(urls: string[]): Record<string, string> {
  const cache = readCoverCache()
  const now = Date.now()
  const out: Record<string, string> = {}
  for (const u of urls) {
    const hit = cache[u]
    if (hit && now - hit.ts < COVER_TTL) out[u] = hit.dest
  }
  return out
}

export interface CoverResolveStats {
  total: number // 传入的图片 URL 总数
  cached: number // 本地缓存命中（无需请求）
  resolved: number // 本次换链成功
  unsupported: number // 原图域名不受支持（EchoTik 尚未收录，官方 1-3 天内异步补）
  failed: number // 换链请求失败
  batchErrors: string[] // 失败原因（按批次）
}

export interface CoverResolveResult {
  map: Record<string, string> // 原图 URL → 临时可访问 URL
  stats: CoverResolveStats
}

function normUrl(u: string): string {
  try { return decodeURIComponent(u) } catch { return u }
}

// 批量换临时链接（官方限制每批最多 10 个；这里每批 5 个以防 query 过长），失败不影响主流程
export async function resolveCoverUrls(cfg: EchoTikConfig, urls: string[]): Promise<CoverResolveResult> {
  const unique = Array.from(new Set(urls.filter(Boolean)))
  const valid = unique.filter((u) => u.includes(COVER_HOST))
  const unsupported = unique.length - valid.length
  const stats: CoverResolveStats = {
    total: unique.length, cached: 0, resolved: 0, unsupported, failed: 0, batchErrors: [],
  }
  if (!valid.length) return { map: {}, stats }

  const out = getCachedCovers(valid)
  stats.cached = Object.keys(out).length
  const pending = valid.filter((u) => !out[u])

  for (let i = 0; i < pending.length; i += 5) {
    const batch = pending.slice(i, i + 5)
    try {
      const json = await requestJson(cfg, '/batch/cover/download', { cover_urls: batch.join(',') })
      const raw: unknown = json && typeof json === 'object' ? (json as any).data : null
      if (!raw || typeof raw !== 'object') {
        stats.batchErrors.push(`返回结构异常：${JSON.stringify(raw).slice(0, 120)}`)
        stats.failed += batch.length
        continue
      }
      // 官方返回 { 源URL: 临时URL }；key 可能与传入 URL 有编码差异，做宽松匹配
      const entries = Object.entries(raw as Record<string, unknown>)
      const used = new Set<number>()
      for (const url of batch) {
        const nu = normUrl(url)
        let dest: string | null = null
        let hitIdx = -1
        for (let j = 0; j < entries.length; j++) {
          const [k, v] = entries[j]
          if (typeof v === 'string' && v && !used.has(j) && (k === url || normUrl(k) === nu)) {
            dest = v; hitIdx = j; break
          }
        }
        if (dest && hitIdx >= 0) {
          used.add(hitIdx)
          out[url] = dest
          stats.resolved++
        } else {
          stats.failed++
        }
      }
    } catch (e: any) {
      stats.batchErrors.push(String(e?.message ?? e))
      stats.failed += batch.length
    }
  }

  if (stats.resolved > 0) {
    const cache = readCoverCache()
    const now = Date.now()
    for (const [src, dest] of Object.entries(out)) {
      if (out[src] && !cache[src]?.dest) cache[src] = { dest, ts: now }
      else if (cache[src]?.dest !== out[src]) cache[src] = { dest: out[src], ts: now }
    }
    writeCoverCache(cache)
  }
  return { map: out, stats }
}

export interface EchoSearchResult {
  hits: ProductHit[]
  fallback: boolean // true = 全部 region 请求失败，已回退（调用方决定是否用本地数据填充）
  error?: string // 失败原因（部分或全部）
  note?: string // 成功但需提示（如实时数据无增长率字段）
  totalFetched: number
}

// 主入口：按 cfg.regions 与 pagesPerRegion 并发拉取，归一化后套用与本地一致的过滤/评分。
// 类目名筛选在实时模式下不可用（列表仅回类目 ID），会跳过并在 note 里说明。
export async function searchEchoTik(c: SearchCriteria, cfg: EchoTikConfig): Promise<EchoSearchResult> {
  const regions = c.regions.length ? c.regions : []
  const pages = Math.max(1, cfg.pagesPerRegion)
  const tasks: Promise<{ region: string; list: EchoRawProduct[] }>[] = []
  for (const region of regions) {
    for (let p = 1; p <= pages; p++) {
      tasks.push(
        fetchListPage(cfg, region, p)
          .then((list) => ({ region, list }))
          .catch((e) => {
            throw { region, error: String(e?.message ?? e) }
          }),
      )
    }
  }

  const settled = await Promise.allSettled(tasks)
  const all: EchoRawProduct[] = []
  const errors: string[] = []
  for (const s of settled) {
    if (s.status === 'fulfilled') all.push(...s.value.list)
    else errors.push((s.reason as any)?.error ?? '未知错误')
  }

  if (all.length === 0) {
    return {
      hits: [],
      fallback: true,
      error: errors.length ? errors.join('；') : '接口返回空数据（商品可能尚未被 EchoTik 收录，属正常现象）',
      totalFetched: 0,
    }
  }

  // 实时数据无类目中文名（仅回 category_id），品类筛选关闭；增长率已由 7d/30d 销量近似推算，保留开关
  const adapted: SearchCriteria = {
    ...c,
    categories: [], // 实时接口只回 category_id，无法按本地中文类目名匹配
    filters: { ...c.filters },
  }
  const hits = buildHits(all.map(normalizeProduct), adapted)

  const notes: string[] = []
  if (errors.length) notes.push(`部分站点请求失败已跳过：${errors.join('；')}`)
  notes.push('实时数据无类目中文名（仅回类目 ID），品类筛选已自动关闭；「7 日增长率」由 7 日/30 日销量近似推算，可正常使用。')
  return { hits, fallback: false, note: notes.join(' '), totalFetched: all.length }
}

// ---------- 类目字典（可选：供后续按类目过滤使用，当前搜索页暂未启用） ----------
export interface EchoCategory {
  category_id: string
  category_name: string
  category_level: string
  parent_id: string
}

export async function fetchCategories(cfg: EchoTikConfig, language = 'en-US'): Promise<EchoCategory[]> {
  try {
    const json = await requestJson(cfg, '/category/l1', { language })
    return Array.isArray(json?.data) ? json.data : []
  } catch {
    return []
  }
}
