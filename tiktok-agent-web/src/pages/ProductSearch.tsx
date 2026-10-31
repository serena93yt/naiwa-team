import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { COUNTRIES } from '../data/content'
import {
  CATEGORIES, TREND_FLAGS, PRODUCTS, DEFAULT_FILTERS,
  searchProducts,
  type SearchCriteria, type ProductHit, type TrendFlag,
} from '../data/products'
import { loadEchoTik, ECHOTIK_REGIONS } from '../settings'
import { searchEchoTik, getCachedCovers, resolveCoverUrls, type CoverResolveStats } from '../data/echotik'
import { exportProductsPdf, type PdfProductRow } from '../utils/exportPdf'

const REGION_NAME: Record<string, string> = Object.fromEntries(COUNTRIES.map((c) => [c.code, c.name]))

function toggle<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]
}

const TREND_BADGE: Record<TrendFlag, string> = {
  飙升: 'badge-success',
  平稳: 'badge-gray',
  下滑: 'badge-danger',
}

// ---------- 搜索结果持久化 ----------
// 目的：跳到「种草内容生成」再切回来时，结果/筛选条件还在，不用重新搜索。
const SEARCH_STATE_KEY = 'tikboost_search_state_v1'
type FiltersShape = {
  growth: boolean
  rating: boolean
  growthGt: number
  ratingMin: number
}
type Banner = { type: 'warn' | 'error' | 'info'; text: string }
type SearchState = {
  hits: ProductHit[] | null
  dataSource: 'local' | 'echotik'
  banner: Banner | null
  regions: string[]
  categories: string[]
  trendFlags: TrendFlag[]
  filters: FiltersShape
}

function defaultFilters(): FiltersShape {
  return {
    growth: true,
    rating: true,
    growthGt: DEFAULT_FILTERS.growthGt,
    ratingMin: DEFAULT_FILTERS.ratingMin,
  }
}

function loadSearchState(): SearchState | null {
  try {
    const raw = localStorage.getItem(SEARCH_STATE_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as SearchState
    if (!s || !Array.isArray(s.hits)) return null
    return s
  } catch {
    return null
  }
}

function saveSearchState(s: SearchState) {
  try { localStorage.setItem(SEARCH_STATE_KEY, JSON.stringify(s)) } catch { /* 容量溢出则放弃 */ }
}

function clearSearchState() {
  try { localStorage.removeItem(SEARCH_STATE_KEY) } catch { /* ignore */ }
}

// 商品缩略图：优先显示真实图片，加载失败自动回退 emoji 占位（避免破图）
function ProductThumb({ hit }: { hit: ProductHit }) {
  const [broken, setBroken] = useState(false)
  if (!hit.imageUrl || broken) return <span>{hit.emoji || '🛍️'}</span>
  return (
    <img
      src={hit.imageUrl}
      alt={hit.title}
      className="prod-thumb-img"
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
    />
  )
}

export default function ProductSearch() {
  const navigate = useNavigate()
  // 恢复上次搜索结果（含筛选条件），避免跳到种草页再回来时结果丢失
  const restored = loadSearchState()

  // 站点勾选即「本次要搜哪些国家」，默认全选（可搜索国家见搜索配置页）
  const [regions, setRegions] = useState<string[]>(restored?.regions ?? [...ECHOTIK_REGIONS])
  const [categories, setCategories] = useState<string[]>(restored?.categories ?? [])
  const [trendFlags, setTrendFlags] = useState<TrendFlag[]>(restored?.trendFlags ?? ['飙升'])
  const [filters, setFilters] = useState<FiltersShape>(restored?.filters ?? defaultFilters())

  const criteria: SearchCriteria = {
    regions, categories, trendFlags, filters,
  }
  const [hits, setHits] = useState<ProductHit[] | null>(restored?.hits ?? null)
  const [loading, setLoading] = useState(false)
  const [banner, setBanner] = useState<Banner | null>(restored?.banner ?? null)
  const [dataSource, setDataSource] = useState<'local' | 'echotik'>(restored?.dataSource ?? 'local')
  const [pdfBusy, setPdfBusy] = useState(false)

  // 统一出口：更新结果的同时落盘，页面来回切换后仍能还原
  function commit(next: Partial<SearchState>) {
    if (next.hits !== undefined) setHits(next.hits)
    if (next.dataSource) setDataSource(next.dataSource)
    if (next.banner !== undefined) setBanner(next.banner)
    saveSearchState({
      hits: next.hits !== undefined ? next.hits : hits,
      dataSource: next.dataSource ?? dataSource,
      banner: next.banner !== undefined ? next.banner : banner,
      regions, categories, trendFlags, filters,
    })
  }

  // 价格展示：本地演示为 USD（页面约定以 ¥ 展示）；EchoTik 实时数据用区域币种符号
  function priceLabel(p: ProductHit): string {
    const sym = p.currency && p.currency !== 'USD' ? p.currency : '¥'
    return `${sym}${p.price}`
  }

  // 组装导出 PDF 所需的数据（把本次结果 + 当前搜索条件一起写进报告）
  function buildPdfRows(list: ProductHit[]): PdfProductRow[] {
    return list.map((p, i) => {
      const meta = [
        p.categoryName || '未知类目',
        REGION_NAME[p.region] ?? p.region,
        p.rank > 0 ? `排名 #${p.rank}` : '',
        p.shopSellerId ? `店铺 ${p.shopSellerId}` : '',
        `商品 ID ${p.productId}`,
      ].filter(Boolean).join(' · ')

      const metrics = [
        { label: '销售趋势', value: p.salesTrendFlagText },
        { label: '售价', value: priceLabel(p) },
        { label: '评分', value: `★ ${p.productRating}` },
        { label: '评论数', value: String(p.reviewCount ?? 0) },
        { label: '佣金率', value: `${(p.productCommissionRate * 100).toFixed(0)}%` },
        { label: '30 日销量', value: `${p.totalSale30dCnt} 件` },
        ...(p.growthRate > 0 ? [{ label: '7 日增长率', value: `+${p.growthRate}%` }] : []),
        { label: '7 日销量', value: `${p.totalSale7dCnt} 件` },
        { label: '视频/直播', value: `${p.totalVideoCnt} / ${p.totalLiveCnt}` },
        { label: '达人数', value: String(p.creatorCount) },
      ]
      return { no: i + 1, verdict: p.verdict, title: p.title, metaLine: meta, metrics, reasons: p.reasons }
    })
  }

  async function downloadPdf() {
    if (!hits || hits.length === 0) return
    setPdfBusy(true)
    try {
      const now = new Date()
      const criteriaDesc = [
        { label: '目标站点', value: regions.map((r) => `${REGION_NAME[r] ?? r}(${r})`).join('、') || '全部' },
        { label: '品类', value: categories.length ? categories.join('、') : '全部品类' },
        { label: '销售趋势', value: trendFlags.length ? trendFlags.join('、') : '全部趋势' },
        { label: '量化筛选', value: [
          filters.growth ? `7 日增长率 > ${filters.growthGt}%` : '',
          filters.rating ? `评分 > ${filters.ratingMin} 分` : '',
        ].filter(Boolean).join('；') || '未启用' },
        { label: '数据源', value: dataSource === 'echotik' ? 'EchoTik 实时接口' : '本地演示数据' },
      ]
      await exportProductsPdf({
        title: 'TikTok 东南亚爆品搜索报告',
        generatedAt: now.toLocaleString('zh-CN', { hour12: false }),
        sourceLabel: dataSource === 'echotik' ? 'EchoTik 实时' : '本地演示',
        criteria: criteriaDesc,
        rows: buildPdfRows(hits),
      })
    } catch (e: any) {
      setBanner({ type: 'error', text: `PDF 导出失败：${String(e?.message ?? e)}` })
    } finally {
      setPdfBusy(false)
    }
  }

  // EchoTik 的图片 URL 不能直接访问，需经官方接口换临时链接；这里用缓存先渲染，再异步补齐
  async function attachImages(list: ProductHit[]): Promise<{ list: ProductHit[]; note: string | null }> {
    const urls = list.map((p) => p.imageUrl).filter(Boolean) as string[]
    if (!urls.length) return { list, note: null }
    const cached = getCachedCovers(urls)
    let next = list.map((p) => (p.imageUrl && cached[p.imageUrl] ? { ...p, imageUrl: cached[p.imageUrl] } : p))
    let stats: CoverResolveStats | null = null
    try {
      const r = await resolveCoverUrls(loadEchoTik(), urls)
      stats = r.stats
      next = next.map((p) => (p.imageUrl && r.map[p.imageUrl] ? { ...p, imageUrl: r.map[p.imageUrl] } : p))
    } catch (e: any) {
      stats = { total: urls.length, cached: Object.keys(cached).length, resolved: 0, unsupported: 0, failed: urls.length, batchErrors: [String(e?.message ?? e)] }
    }
    return { list: next, note: coverNote(stats) }
  }

  function coverNote(s: CoverResolveStats): string | null {
    if (!s.total) return null
    const parts = [`商品图：共 ${s.total} 张`]
    if (s.resolved) parts.push(`换链成功 ${s.resolved}`)
    if (s.cached) parts.push(`缓存命中 ${s.cached}`)
    if (s.unsupported) parts.push(`${s.unsupported} 张 EchoTik 尚未收录该图（官方 1-3 天内补，暂显示占位）`)
    if (s.failed) parts.push(`换链失败 ${s.failed}${s.batchErrors.length ? `（${s.batchErrors[0]}）` : ''}`)
    if (!s.resolved && !s.cached && !s.unsupported && !s.failed) return null
    return parts.join(' · ')
  }

  // 回到本页时，实时结果的临时图片链接可能已过期（有效期 24h），刷新一次
  useEffect(() => {
    if (!hits?.length || dataSource !== 'echotik') return
    let alive = true
    attachImages(hits).then(({ list: next, note }) => {
      if (!alive) return
      if (next.some((x, i) => x.imageUrl !== hits[i].imageUrl)) {
        const merged = [banner?.text, note].filter(Boolean).join(' ')
        commit({ hits: next, banner: merged ? { type: 'info', text: merged } : null })
      }
    })
    // 仅在挂载时执行一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function runSearch() {
    const cfg = loadEchoTik()
    // 只要数据源选了 EchoTik 实时就尝试连真实接口（凭证由 Vite 代理服务端注入，
    // 访客无需在本机填写）；仅当接口整体失败才回退本地数据。
    const useEcho = cfg.source === 'echotik'
    setBanner(null)
    if (!useEcho) {
      commit({ hits: searchProducts(criteria), dataSource: 'local', banner: null })
      return
    }

    setLoading(true)
    setDataSource('echotik')
    try {
      const res = await searchEchoTik(criteria, cfg)
      if (res.fallback) {
        // 实时全失败：回退本地演示，并提示原因
        commit({
          hits: searchProducts(criteria),
          dataSource: 'local',
          banner: { type: 'warn', text: `EchoTik 实时请求失败（${res.error ?? '无数据'}），已回退本地演示数据。请检查凭证 / 代理 / 配额。` },
        })
      } else {
        const { list: withImages, note: imgNote } = await attachImages(res.hits)
        const fullNote = [res.note, imgNote].filter(Boolean).join(' ')
        commit({ hits: withImages, dataSource: 'echotik', banner: fullNote ? { type: 'info', text: fullNote } : null })
      }
    } catch (e: any) {
      commit({
        hits: searchProducts(criteria),
        dataSource: 'local',
        banner: { type: 'warn', text: `EchoTik 调用异常（${String(e?.message ?? e)}），已回退本地演示数据。` },
      })
    } finally {
      setLoading(false)
    }
  }

  function reset() {
    setRegions([...ECHOTIK_REGIONS])
    setCategories([]); setTrendFlags(['飙升'])
    setFilters(defaultFilters())
    setHits(null)
    setBanner(null)
    setDataSource('local')
    clearSearchState()
  }

  function bring(p: ProductHit) {
    navigate('/products/generate', {
      state: { product: p.title, summary: p.summary },
    })
  }

  return (
    <>
      <h2>爆品搜索</h2>

      <div className="search-layout">
        {/* ===== 左侧：标签选择（基于抓取字段） ===== */}
        <aside className="filters">
          <div className="filter-group">
            <div className="fg-title">① 目标站点 / 地区</div>
            <div className="chip-row">
              {ECHOTIK_REGIONS.map((r) => (
                <button key={r} className={`chip ${regions.includes(r) ? 'on' : ''}`}
                  onClick={() => setRegions(toggle(regions, r))}>{REGION_NAME[r] ?? r}</button>
              ))}
            </div>
          </div>

          <div className="filter-group">
            <div className="fg-title">② 品类</div>
            <div className="chip-row">
              {CATEGORIES.map((cat) => (
                <button key={cat} className={`chip ${categories.includes(cat) ? 'on' : ''}`}
                  onClick={() => setCategories(toggle(categories, cat))}>{cat}</button>
              ))}
            </div>
            <p className="note" style={{ marginTop: 6 }}>不选 = 全部品类（品类路径见结果卡）。</p>
          </div>

          <div className="filter-group">
            <div className="fg-title">③ 销售趋势标签</div>
            <div className="chip-row">
              {TREND_FLAGS.map((t) => (
                <button key={t} className={`chip ${trendFlags.includes(t) ? 'on' : ''}`}
                  onClick={() => setTrendFlags(toggle(trendFlags, t))}>{t}</button>
              ))}
            </div>
          </div>

          <div className="filter-group">
            <div className="fg-title">④ 量化筛选</div>

            <div className="toggle-row">
              <span className="tr-label">7 日增长率 &gt;</span>
              <span className="tr-input-wrap">
                <input
                  className="input tr-input"
                  type="number"
                  min={0}
                  step={10}
                  value={filters.growthGt}
                  onChange={(e) => setFilters({ ...filters, growthGt: Number(e.target.value) || 0 })}
                />
                <span className="tr-unit">%</span>
              </span>
              <div className="switch">
                <button className={filters.growth ? 'on' : ''} onClick={() => setFilters({ ...filters, growth: true })}>开</button>
                <button className={!filters.growth ? 'on' : ''} onClick={() => setFilters({ ...filters, growth: false })}>关</button>
              </div>
            </div>

            <div className="toggle-row">
              <span className="tr-label">评分 &gt;</span>
              <span className="tr-input-wrap">
                <input
                  className="input tr-input"
                  type="number"
                  min={0}
                  max={5}
                  step={0.1}
                  value={filters.ratingMin}
                  onChange={(e) => setFilters({ ...filters, ratingMin: Number(e.target.value) || 0 })}
                />
                <span className="tr-unit">分</span>
              </span>
              <div className="switch">
                <button className={filters.rating ? 'on' : ''} onClick={() => setFilters({ ...filters, rating: true })}>开</button>
                <button className={!filters.rating ? 'on' : ''} onClick={() => setFilters({ ...filters, rating: false })}>关</button>
              </div>
            </div>

            <p className="note" style={{ marginTop: 6 }}>数值可直接修改；开关用于临时停用该条件。{dataSource === 'echotik' && '实时模式增长率为 7 日/30 日销量近似推算，可正常使用；品类筛选不生效。'}</p>
          </div>

          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} onClick={runSearch} disabled={loading}>
            {loading ? '搜索中…' : '搜索'}
          </button>
          <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} onClick={reset}>重置全部条件</button>
        </aside>

        {/* ===== 右侧：输出 ===== */}
        <section className="results">
          {hits === null ? (
            <div className="empty">请先在左侧设置筛选条件，然后点击「搜索」查看命中爆品。</div>
          ) : (
            <>
              {banner && (
                <div className={`note ${banner.type === 'info' ? '' : 'note-warn'}`} style={{ marginBottom: 10 }}>
                  {banner.type === 'info' ? 'ℹ️ ' : '⚠️ '}
                  {banner.text}
                </div>
              )}

              <div className="result-summary" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <span>命中 <strong>{hits.length}</strong> 个爆品</span>
                <span className="muted-3">
                  （数据源：{dataSource === 'echotik' ? 'EchoTik 实时' : '本地演示'}）
                </span>
                {dataSource === 'echotik' && (
                  <span className="muted-3">· 价格以区域币种展示</span>
                )}
                <button
                  className="btn btn-ghost"
                  style={{ marginLeft: 'auto' }}
                  onClick={downloadPdf}
                  disabled={pdfBusy || hits.length === 0}
                  title="把当前搜索结果导出为 A4 PDF 文件"
                >
                  {pdfBusy ? '正在生成 PDF…' : '下载 PDF'}
                </button>
              </div>

              {/* 爆品推荐 + 为什么值得做 */}
              <h3 className="block-title">爆品推荐 · 为什么值得做</h3>
              {hits.length === 0 && (
                <div className="empty">当前标签条件下无命中爆品，试试放宽「量化筛选」或加入「平稳」趋势。</div>
              )}
              <div className="hit-list">
            {hits.map((p) => (
              <div className="hit-card" key={p.productId}>
                <div className="hit-top">
                  <div>
                    <span className="muted-3">
                      {p.categoryName || '未知类目'} · {REGION_NAME[p.region] ?? p.region}
                      {p.rank > 0 && ` · 排名 #${p.rank}`}
                      {p.shopSellerId && dataSource === 'echotik' && ` · 店铺 ${p.shopSellerId}`}
                    </span>
                  </div>
                  <span className={`badge ${p.verdict === '强烈推荐' ? 'badge-success' : p.verdict === '推荐' ? 'badge-blue' : 'badge-gray'}`}>{p.verdict}</span>
                </div>
                <div className="product-content">
                  <div className="prod-thumb">
                    <ProductThumb hit={p} />
                  </div>
                  <div className="prod-info">
                    <div className="prod-title">{p.title}</div>
                  </div>
                </div>
                <div className="metric-row">
                  {p.growthRate > 0 && (
                    <span className="metric"><b style={{ color: 'var(--c-success)' }}>+{p.growthRate}%</b> 7 日增长率</span>
                  )}
                  <span className={`badge ${TREND_BADGE[p.salesTrendFlagText]}`}>{p.salesTrendFlagText}</span>
                  <span className="metric">售价 {priceLabel(p)}</span>
                  <span className="metric">评分 ★ {p.productRating}</span>
                  <span className="metric">评论 {p.reviewCount}</span>
                  <span className="metric">佣金率 {(p.productCommissionRate * 100).toFixed(0)}%</span>
                  <span className="metric">30 日售 {p.totalSale30dCnt} 件</span>
                  <span className="metric">视频 {p.totalVideoCnt} / 直播 {p.totalLiveCnt} / 达人 {p.creatorCount}</span>
                </div>
                <div className="judge-box">
                  <div className="judge-title">为什么值得做</div>
                  <ul className="judge-list">
                    {p.reasons.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                </div>
                <div className="hit-foot">
                  <button className="btn btn-ghost" onClick={() => bring(p)}>带入「种草内容生成」</button>
                </div>
              </div>
            ))}
          </div>
          </>
          )}

          <details className="field-map">
            <summary>抓取字段 → 页面标签 对照（Creative Center 热门商品结构）</summary>
            <table className="tbl">
              <thead><tr><th>分组</th><th>字段</th><th>页面用途</th></tr></thead>
              <tbody>
                <tr><td>商品基础</td><td>title / productId / region / categoryName / categoryIds / imageUrl</td><td>结果卡标题、地区标签①、品类标签②</td></tr>
                <tr><td>价格</td><td>price / minPrice / maxPrice / currency</td><td>售价展示（指标卡）</td></tr>
                <tr><td>销量</td><td>totalSaleCnt / 1d / 7d / 30dCnt</td><td>结果卡销量、判定「需求爆发」</td></tr>
                <tr><td>GMV</td><td>totalSaleGmvAmt / 7dAmt</td><td>结果卡展示（可扩展排序）</td></tr>
                <tr><td>趋势</td><td>growthRate / salesTrendFlagText / rank</td><td>增长率筛选、趋势标签③、排名展示</td></tr>
                <tr><td>店铺</td><td>shopName / isCrossBorder / offShelvesText</td><td>跨境 / 本土展示（指标卡）</td></tr>
                <tr><td>带货</td><td>totalVideoCnt / totalLiveCnt / creatorCount / tiktokUrl</td><td>达人生态展示（指标卡）</td></tr>
                <tr><td>佣金</td><td>productCommissionRate / productRating / reviewCount</td><td>评分与评论展示（指标卡）</td></tr>
              </tbody>
            </table>
          </details>

          <p className="note">
            {dataSource === 'echotik'
              ? '当前为 EchoTik 实时数据（经同源代理 /echotik 转发，凭证存于本机）。实时数据含销量 / GMV / 评分 / 趋势；「7 日增长率」由 7 日/30 日销量近似推算可正常使用，类目仅回 ID 故品类筛选关闭；排名为空（榜单接口才有）。'
              : `当前为 ${PRODUCTS.length} 条原型样本（字段结构与抓取一致，价格统一折算 USD）。切换「智能体设置 → 爆品搜索」数据源为 EchoTik 并填好凭证后，将改为实时数据。`}
          </p>
        </section>
      </div>
    </>
  )
}
