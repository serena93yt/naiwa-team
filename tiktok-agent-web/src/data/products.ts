// ===== TikBoost AI · 爆品搜索数据层（对齐 Creative Center「热门商品 / Top Products」抓取结构） =====
// 字段与 Nexscope / Apify 还原的 Creative Center 内部结构一致：
//   商品基础: title, productId, region, categoryName, categoryIds, imageUrl/coverUrl
//   价格:     price, minPrice, maxPrice, currency
//   销量:     totalSaleCnt, totalSale1dCnt/7dCnt/30dCnt
//   GMV:      totalSaleGmvAmt, totalSaleGmv1dAmt/7dAmt/30dAmt
//   趋势:     growthRate, salesTrendFlagText(飙升/平稳/下滑), rank
//   店铺:     shopName, shopSellerId, shopTotalUnitsSold, isCrossBorder, offShelvesText
//   带货:     totalVideoCnt, totalLiveCnt, creatorCount, tiktokUrl
//   佣金:     productCommissionRate(0.10=10%), productRating, reviewCount
// 预留：真实接入时把 PRODUCTS 替换为抓取 API 返回，searchProducts 逻辑不变。

// ---------- 季节 / 节日窗口（辅助启发，非抓取字段） ----------
export type Season = '大促' | '换季' | '保暖' | '日常' | '防晒'

export interface SeasonWindow {
  monthLabel: string
  tags: Season[]
  note: string
  festivals: string[]
}

export function getSeasonWindow(date = new Date()): SeasonWindow {
  const m = date.getMonth() // 0-based
  const map: Record<number, SeasonWindow> = {
    9: { monthLabel: '10 月', tags: ['大促', '换季', '保暖'], note: '年终大促预热季', festivals: ['双 11 预热', '万圣节', '年终囤货'] },
    10: { monthLabel: '11 月', tags: ['大促', '保暖'], note: '双 11 / 大促爆发', festivals: ['双 11', '黑五', '年终大促'] },
    11: { monthLabel: '12 月', tags: ['大促', '保暖'], note: '双 12 / 圣诞礼赠', festivals: ['双 12', '圣诞节', '跨年'] },
    0: { monthLabel: '1 月', tags: ['大促', '保暖'], note: '开年大促 / 年货', festivals: ['新年', '春节囤货'] },
    1: { monthLabel: '2 月', tags: ['大促', '日常'], note: '情人节 / 开学季', festivals: ['情人节', '返校'] },
    2: { monthLabel: '3 月', tags: ['换季', '日常'], note: '春季换装', festivals: ['春季上新'] },
    3: { monthLabel: '4 月', tags: ['防晒', '日常'], note: '防晒预热', festivals: ['开斋节(部分市场)'] },
    4: { monthLabel: '5 月', tags: ['防晒', '日常'], note: '夏季防晒', festivals: ['夏季大促'] },
    5: { monthLabel: '6 月', tags: ['防晒', '日常'], note: '夏季高峰', festivals: ['年中促'] },
    6: { monthLabel: '7 月', tags: ['防晒', '日常'], note: '盛夏延续', festivals: ['暑假'] },
    7: { monthLabel: '8 月', tags: ['防晒', '日常'], note: '盛夏延续', festivals: ['返校预热'] },
    8: { monthLabel: '9 月', tags: ['换季', '大促'], note: '换季 + 大促预热', festivals: ['双 10 预热'] },
  }
  return map[m] ?? { monthLabel: '当前', tags: ['大促', '换季', '日常', '防晒', '保暖'], note: '全年常青', festivals: ['日常运营'] }
}

// ---------- 抓取字段结构 ----------
export type TrendFlag = '飙升' | '平稳' | '下滑'

export interface TikTokProduct {
  // 商品基础
  productId: string
  title: string
  region: string // 国家码 ID/TH/VN/PH/MY
  categoryName: string
  categoryIds: string // 品类路径
  imageUrl: string // 原型留空，前端用占位块
  // 价格（原型统一折算 USD）
  price: number
  minPrice: number
  maxPrice: number
  currency: string
  // 销量
  totalSaleCnt: number
  totalSale1dCnt: number
  totalSale7dCnt: number
  totalSale30dCnt: number
  // GMV
  totalSaleGmvAmt: number
  totalSaleGmv7dAmt: number
  // 趋势
  growthRate: number // %，150 = +150%
  salesTrendFlagText: TrendFlag
  rank: number // 品类排名
  // 店铺
  shopName: string
  shopSellerId: string
  shopTotalUnitsSold: number
  isCrossBorder: boolean
  offShelvesText: string // 在售 / 已下架
  // 带货
  totalVideoCnt: number
  totalLiveCnt: number
  creatorCount: number
  tiktokUrl: string
  // 佣金
  productCommissionRate: number // 0.10 = 10%
  productRating: number
  reviewCount: number
  // 原型辅助（非抓取字段）
  season: Season
  // 商品内容（种草素材，真实接入可由商品详情页 / 知识库补全）
  emoji: string // 商品图占位图标
  summary: string // 一句话卖点 / 商品内容
  contentAngles: string[] // 种草内容角度
}

interface Raw {
  id: string; title: string; region: string; category: string
  price: number; rating: number; reviews: number; commission: number
  growth: number; trend: TrendFlag; rank: number
  sales7d: number; sales30d: number; totalSales: number
  videos: number; lives: number; creators: number
  cross: boolean; shop: string; season: Season
  emoji: string; summary: string; contentAngles: string[]
}

const RAW: Raw[] = [
  { id: 'p01', title: '便携榨汁杯', region: 'ID', category: '小家电', price: 18, rating: 4.6, reviews: 142, commission: 0.12, growth: 185, trend: '飙升', rank: 3, sales7d: 1400, sales30d: 5200, totalSales: 8500, videos: 320, lives: 45, creators: 120, cross: true, shop: 'GlowHome ID', season: '大促', emoji: '🥤', summary: 'USB 充电便携榨汁杯，30 秒现榨，健身 / 通勤随身体验鲜榨。', contentAngles: ['场景化种草', '开箱测评', '懒人神器'] },
  { id: 'p02', title: '穆斯林头巾(花色)', region: 'ID', category: '服饰', price: 14, rating: 4.7, reviews: 88, commission: 0.15, growth: 210, trend: '飙升', rank: 2, sales7d: 1900, sales30d: 6800, totalSales: 12000, videos: 560, lives: 80, creators: 210, cross: false, shop: 'Safa Collection', season: '日常', emoji: '🧕', summary: '印尼本土花色 hijab，透气垂感好，日常 / 祷告两用高性价比。', contentAngles: ['本土审美', '穿搭教程', '节日礼赠'] },
  { id: 'p03', title: '无线耳机(学生款)', region: 'ID', category: '3C', price: 22, rating: 4.3, reviews: 320, commission: 0.08, growth: 95, trend: '平稳', rank: 7, sales7d: 900, sales30d: 4100, totalSales: 9600, videos: 260, lives: 30, creators: 95, cross: true, shop: 'SoundWave 3C', season: '日常', emoji: '🎧', summary: '平价无线耳机，学生党性价比之选，长续航低延迟。', contentAngles: ['学生党测评', '性价比对比', '开箱'] },
  { id: 'p04', title: '乳胶枕', region: 'TH', category: '家居', price: 28, rating: 4.5, reviews: 156, commission: 0.10, growth: 165, trend: '飙升', rank: 4, sales7d: 1100, sales30d: 3900, totalSales: 7200, videos: 280, lives: 52, creators: 130, cross: false, shop: 'ThaiLatex Home', season: '换季', emoji: '🛏️', summary: '泰国天然乳胶枕，护颈助眠，酒店同款睡眠体验。', contentAngles: ['睡眠场景', '材质科普', '对比平替'] },
  { id: 'p05', title: '美白防晒', region: 'TH', category: '美妆', price: 16, rating: 4.2, reviews: 110, commission: 0.18, growth: 230, trend: '飙升', rank: 2, sales7d: 2200, sales30d: 7400, totalSales: 11000, videos: 640, lives: 95, creators: 260, cross: true, shop: 'BelleSkin TH', season: '大促', emoji: '🧴', summary: '美白 + 防晒二合一，热带刚需，清爽不闷痘。', contentAngles: ['热带刚需', '成分科普', '素人测评'] },
  { id: 'p06', title: '猫粮(进口)', region: 'TH', category: '宠物', price: 35, rating: 4.8, reviews: 260, commission: 0.06, growth: 120, trend: '平稳', rank: 9, sales7d: 800, sales30d: 3400, totalSales: 8800, videos: 190, lives: 25, creators: 70, cross: true, shop: 'PetPal TH', season: '日常', emoji: '🐱', summary: '进口猫粮，高蛋白低敏，多猫家庭囤货装。', contentAngles: ['萌宠日常', '囤货攻略', '成分对比'] },
  { id: 'p07', title: '咖啡滤杯', region: 'VN', category: '家居', price: 12, rating: 4.4, reviews: 95, commission: 0.12, growth: 175, trend: '飙升', rank: 5, sales7d: 1300, sales30d: 4600, totalSales: 7900, videos: 240, lives: 38, creators: 105, cross: false, shop: 'VN Brew Craft', season: '日常', emoji: '☕', summary: '手冲咖啡滤杯，越南咖啡文化入门平价好物。', contentAngles: ['咖啡文化', '手冲教程', '氛围感'] },
  { id: 'p08', title: '运动鞋(平价)', region: 'VN', category: '鞋服', price: 30, rating: 4.1, reviews: 180, commission: 0.09, growth: 88, trend: '下滑', rank: 11, sales7d: 600, sales30d: 3100, totalSales: 9200, videos: 210, lives: 22, creators: 85, cross: true, shop: 'StepUp VN', season: '日常', emoji: '👟', summary: '平价缓震运动鞋，日常通勤慢跑两穿。', contentAngles: ['穿搭', '性价比', '开箱'] },
  { id: 'p09', title: '手机支架(直播)', region: 'VN', category: '3C', price: 9, rating: 4.0, reviews: 140, commission: 0.20, growth: 140, trend: '飙升', rank: 6, sales7d: 1600, sales30d: 5100, totalSales: 8600, videos: 380, lives: 66, creators: 150, cross: true, shop: 'LiveGear VN', season: '大促', emoji: '📱', summary: '直播 / 追剧手机支架，多档调节，桌面必备。', contentAngles: ['直播场景', '桌面好物', '开箱'] },
  { id: 'p10', title: '唇釉', region: 'PH', category: '美妆', price: 11, rating: 4.6, reviews: 90, commission: 0.16, growth: 260, trend: '飙升', rank: 1, sales7d: 2600, sales30d: 8200, totalSales: 13000, videos: 720, lives: 110, creators: 300, cross: true, shop: 'GlamPH Beauty', season: '大促', emoji: '💄', summary: '显白唇釉，东南亚妆容热门色，平价大碗。', contentAngles: ['试色', '妆容教程', '素人测评'] },
  { id: 'p11', title: '蓝牙音箱(派对)', region: 'PH', category: '3C', price: 25, rating: 4.3, reviews: 130, commission: 0.11, growth: 150, trend: '平稳', rank: 8, sales7d: 1000, sales30d: 4000, totalSales: 8100, videos: 300, lives: 48, creators: 125, cross: true, shop: 'PartyBox PH', season: '大促', emoji: '🔊', summary: '便携派对蓝牙音箱，重低音带灯，聚会神器。', contentAngles: ['聚会场景', '氛围感', '开箱'] },
  { id: 'p12', title: '收纳盒(租房)', region: 'PH', category: '家居', price: 13, rating: 4.5, reviews: 75, commission: 0.14, growth: 195, trend: '飙升', rank: 3, sales7d: 1700, sales30d: 5600, totalSales: 9000, videos: 410, lives: 58, creators: 170, cross: false, shop: 'TidyHome PH', season: '大促', emoji: '📦', summary: '租房党收纳盒，免钉折叠，小户型扩容神器。', contentAngles: ['租房改造', '收纳教程', '好物清单'] },
  { id: 'p13', title: '清真零食', region: 'MY', category: '食品', price: 10, rating: 4.7, reviews: 160, commission: 0.07, growth: 170, trend: '平稳', rank: 6, sales7d: 1500, sales30d: 5300, totalSales: 9800, videos: 350, lives: 60, creators: 140, cross: false, shop: 'HalalBite MY', season: '大促', emoji: '🍪', summary: '清真认证零食，马来家庭下午茶，囤货装。', contentAngles: ['零食测评', '家庭分享', '囤货'] },
  { id: 'p14', title: '头戴耳机', region: 'MY', category: '3C', price: 38, rating: 4.2, reviews: 210, commission: 0.08, growth: 105, trend: '平稳', rank: 10, sales7d: 700, sales30d: 3300, totalSales: 8900, videos: 180, lives: 20, creators: 65, cross: true, shop: 'AudioZone MY', season: '日常', emoji: '🎧', summary: '头戴降噪耳机，通勤长途，长续航舒适佩戴。', contentAngles: ['通勤场景', '降噪测评', '对比'] },
  { id: 'p15', title: '美妆套盒(礼赠)', region: 'MY', category: '美妆', price: 32, rating: 4.4, reviews: 120, commission: 0.15, growth: 160, trend: '飙升', rank: 4, sales7d: 1200, sales30d: 4200, totalSales: 7600, videos: 290, lives: 55, creators: 135, cross: true, shop: 'LuxeGift MY', season: '大促', emoji: '🎁', summary: '美妆礼赠套盒，节日送礼，高颜值开箱即出片。', contentAngles: ['礼赠场景', '开箱', '节日'] },
  { id: 'p16', title: '速干毛巾(健身)', region: 'TH', category: '运动', price: 15, rating: 4.3, reviews: 100, commission: 0.17, growth: 200, trend: '飙升', rank: 5, sales7d: 1450, sales30d: 4800, totalSales: 8300, videos: 330, lives: 42, creators: 115, cross: true, shop: 'FitDry TH', season: '换季', emoji: '🏋️', summary: '健身速干毛巾，吸汗速干，运动随身必备。', contentAngles: ['健身场景', '好物', '对比'] },
  { id: 'p17', title: '蒸汽眼罩(熬夜)', region: 'VN', category: '个护', price: 17, rating: 4.5, reviews: 130, commission: 0.19, growth: 220, trend: '飙升', rank: 2, sales7d: 1800, sales30d: 6100, totalSales: 9400, videos: 450, lives: 72, creators: 185, cross: true, shop: 'RelaxEyes VN', season: '大促', emoji: '😴', summary: '蒸汽眼罩，熬夜护眼，睡前放松仪式感。', contentAngles: ['熬夜场景', '助眠', '开箱'] },
  { id: 'p18', title: '防晒衣(海边)', region: 'PH', category: '服饰', price: 24, rating: 4.4, reviews: 115, commission: 0.13, growth: 245, trend: '飙升', rank: 1, sales7d: 2100, sales30d: 7000, totalSales: 10800, videos: 520, lives: 88, creators: 225, cross: true, shop: 'SunGuard PH', season: '大促', emoji: '🏖️', summary: '海边防晒衣，UPF50+ 透气，度假必备穿搭。', contentAngles: ['度假场景', '防晒科普', '穿搭'] },
]

export const PRODUCTS: TikTokProduct[] = RAW.map((r) => ({
  productId: r.id,
  title: r.title,
  region: r.region,
  categoryName: r.category,
  categoryIds: `${r.region} > ${r.category}`,
  imageUrl: '',
  price: r.price,
  minPrice: r.price,
  maxPrice: r.price,
  currency: 'USD',
  totalSaleCnt: r.totalSales,
  totalSale1dCnt: Math.round(r.sales7d / 7),
  totalSale7dCnt: r.sales7d,
  totalSale30dCnt: r.sales30d,
  totalSaleGmvAmt: r.totalSales * r.price,
  totalSaleGmv7dAmt: r.sales7d * r.price,
  growthRate: r.growth,
  salesTrendFlagText: r.trend,
  rank: r.rank,
  shopName: r.shop,
  shopSellerId: `shop_${r.id}`,
  shopTotalUnitsSold: r.totalSales,
  isCrossBorder: r.cross,
  offShelvesText: '在售',
  totalVideoCnt: r.videos,
  totalLiveCnt: r.lives,
  creatorCount: r.creators,
  tiktokUrl: `https://www.tiktok.com/shop/product/${r.id}`,
  productCommissionRate: r.commission,
  productRating: r.rating,
  reviewCount: r.reviews,
  season: r.season,
  emoji: r.emoji,
  summary: r.summary,
  contentAngles: r.contentAngles,
}))

// ---------- 标签选项（全部由数据派生，抓取后自动更新） ----------
export const REGIONS = [...new Set(PRODUCTS.map((p) => p.region))]
export const CATEGORIES = [...new Set(PRODUCTS.map((p) => p.categoryName))]
export const TREND_FLAGS: TrendFlag[] = ['飙升', '平稳', '下滑']

// ---------- 筛选阈值（对齐抓取字段口径） ----------
export const DEFAULT_FILTERS = {
  growthGt: 100, // growthRate > 100%（可在页面输入框修改）
  ratingMin: 4.0, // 评分下限（可在页面输入框修改）
  videosGte: 100, // totalVideoCnt ≥ 100（内容验证充分）
}

// ---------- 搜索条件（全部基于抓取字段） ----------
export interface SearchCriteria {
  regions: string[]
  categories: string[]
  trendFlags: TrendFlag[]
  filters: {
    growth: boolean // 是否启用「7 日增长率」筛选
    rating: boolean // 是否启用「评分」筛选
    growthGt: number // 7 日增长率阈值（%），默认 100
    ratingMin: number // 评分下限，默认 4.0
  }
}

// ---------- 搜索引擎 ----------
export interface ProductHit extends TikTokProduct {
  verdict: '强烈推荐' | '推荐' | '观察'
  reasons: string[]
}

export function searchProducts(c: SearchCriteria): ProductHit[] {
  return buildHits(PRODUCTS, c)
}

// 把「过滤 + 评分 + 排序」从数据源解耦：本地演示与 EchoTik 实时数据都复用它。
// 注意：growthRate <= 0 视为「未知（实时数据无该字段）」，此时跳过增长率筛选与对应评分理由。
export function buildHits(list: TikTokProduct[], c: SearchCriteria): ProductHit[] {
  const f = DEFAULT_FILTERS
  const growthGt = c.filters.growthGt ?? f.growthGt
  const ratingMin = c.filters.ratingMin ?? f.ratingMin
  const hits: ProductHit[] = []

  for (const p of list) {
    if (c.regions.length && !c.regions.includes(p.region)) continue
    if (c.categories.length && !c.categories.includes(p.categoryName)) continue
    if (c.trendFlags.length && !c.trendFlags.includes(p.salesTrendFlagText)) continue
    if (c.filters.growth && p.growthRate > 0 && !(p.growthRate > growthGt)) continue
    if (c.filters.rating && !(p.productRating >= ratingMin)) continue

    // 为什么值得做 —— 基于抓取字段逐条判定
    const reasons: string[] = []
    let score = 0
    if (p.growthRate > growthGt) { reasons.push(`growthRate +${p.growthRate}%，近 7 日销量 ${p.totalSale7dCnt} 件，需求爆发`); score++ }
    if (p.salesTrendFlagText === '飙升') { reasons.push('趋势标签为「飙升」，平台流量倾斜中'); score++ }
    if (p.productCommissionRate >= 0.15) { reasons.push(`佣金率 ${(p.productCommissionRate * 100).toFixed(0)}%，达人分发动力足`); score++ }
    if (p.productRating >= ratingMin) { reasons.push(`评分 ${p.productRating}，口碑健康`); score++ }
    if (p.totalVideoCnt >= f.videosGte) { reasons.push(`带货视频 ${p.totalVideoCnt} 条 / 达人 ${p.creatorCount} 位，内容验证充分`); score++ }

    const verdict: ProductHit['verdict'] = score >= 5 ? '强烈推荐' : score >= 3 ? '推荐' : '观察'
    hits.push({ ...p, verdict, reasons })
  }

  const rankOrder = { 强烈推荐: 0, 推荐: 1, 观察: 2 } as const
  hits.sort((a, b) => rankOrder[a.verdict] - rankOrder[b.verdict] || b.growthRate - a.growthRate)
  return hits
}
