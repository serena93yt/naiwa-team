// ===== 知识库：四库结构 + 持久化 + 检索（真 RAG 召回） =====
// 四个子库（category）：
//   market      五国市场画像库（消费者画像 / 热销品类 / 价格带 / 平台调性）
//   compliance  五国合规知识库（L1 领域 / L2 国别规则 / L3 话术红线，供合规预检召回）
//   culture     文化适配语料库（禁忌意象 / 节日时机 / 本地化称呼与热词）
//   script      脚本结构模板库（不同内容类型的口播框架）
// 调用链路：合规预检召回 compliance；种草生成召回 market / culture / script。
// 存储：服务端 kb-store.json 为权威（运营改、访客即时生效），localStorage 仅离线兜底。

export type KbCategory = 'market' | 'compliance' | 'culture' | 'script'
export type KbLayer = 'L1' | 'L2' | 'L3'

export interface KbEntry {
  id: number
  category: KbCategory
  layer?: KbLayer // 仅合规库使用
  title: string
  content: string // 主描述 / 正文
  source: string
  updated: string
  hits: number
  country?: string // 适用国家码（ID/TH/VN/PH/MY）；留空 = 多国通用
  keywords?: string[] // 召回关键词（文案命中即关联）
  level?: 'high' | 'medium' // 风险 / 重要度
  suggestion?: string // 预置建议 / 替换 / 改写方向
  // 脚本模板库专用
  scenario?: string // 适用场景 / 内容类型
  structure?: string // 模板骨架
  example?: string // 示例片段
  // 市场画像库专用（结构化标签，便于页面展示）
  tags?: string[]
}

export const CATEGORY_NAME: Record<KbCategory, string> = {
  market: '五国市场画像库',
  compliance: '五国合规知识库',
  culture: '文化适配语料库',
  script: '脚本结构模板库',
}

export const LAYER_NAME: Record<KbLayer, string> = {
  L1: '领域知识',
  L2: '国别规则',
  L3: '话术红线',
}

export const KB_SETUP_KEY_DEFAULT = '1234'
const KB_KEY = 'tikboost_kb_entries'
const KB_SETUP_KEY_LS = 'tikboost_setup_key'

// ===== 种子数据（四库） =====
export const KB_SEED: KbEntry[] = [
  // ---------- 市场画像库 market ----------
  {
    id: 101,
    category: 'market',
    title: '东南亚 TikTok 电商共性画像',
    content:
      '东南亚 6 亿人口中超半数在 35 岁以下，移动优先、社交电商渗透高。用户决策受「熟人/主播推荐 + 评论区口碑」驱动明显，价格敏感但愿意为「好看、好用、有面子」买单。内容节奏快、前 3 秒定生死，评论区运营与达人种草是关键转化杠杆。',
    source: '行业常识',
    updated: '2026-10-28',
    hits: 0,
    keywords: ['东南亚', '共性', '年轻', '社交电商', '价格敏感'],
    tags: ['年轻化', '移动优先', '社交电商', '价格敏感'],
  },
  {
    id: 102,
    category: 'market',
    title: '印尼市场画像（ID）',
    content:
      '人口 2.7 亿、穆斯林为主，宗教与家庭观念强。价格高度敏感，平价与促销驱动强；美妆个护、穆斯林时尚、家居、母婴需求大。内容偏好亲切口语、真实开箱，忌酒精/猪肉/不清真宣称。印尼语为主，斋月是全年最大消费节点。',
    source: '行业常识',
    updated: '2026-10-28',
    hits: 0,
    country: 'ID',
    keywords: ['印尼', 'ID', '穆斯林', '斋月', '平价', '美妆', '家居'],
    tags: ['穆斯林', '价格敏感', '斋月大促', '美妆家居'],
  },
  {
    id: 103,
    category: 'market',
    title: '泰国市场画像（TH）',
    content:
      '韩流与偶像文化影响深，美妆、时尚、护肤、零食高热度；用户爱甜美活泼的表达与颜值向内容。佛教为主，皇室极受尊重。英语+泰语混用常见，内容精致度高。对「可爱、治愈、颜值」类内容接受度强，评论互动活跃。',
    source: '行业常识',
    updated: '2026-10-28',
    hits: 0,
    country: 'TH',
    keywords: ['泰国', 'TH', '韩流', '美妆', '护肤', '佛教', '皇室'],
    tags: ['韩流', '美妆护肤', '颜值向', '精致内容'],
  },
  {
    id: 104,
    category: 'market',
    title: '越南市场画像（VN）',
    content:
      '人口年轻、城镇化提速，性价比与实用主义突出。3C 数码、美妆、服饰、家居受欢迎。越南语为主，用户直爽、爱叠词与感叹，对「便宜好用、真实测评」反应好。价格与功效宣称需可验证，避免过度夸大。',
    source: '行业常识',
    updated: '2026-10-28',
    hits: 0,
    country: 'VN',
    keywords: ['越南', 'VN', '性价比', '数码', '美妆', '测评'],
    tags: ['年轻', '性价比', '实用主义', '真实测评'],
  },
  {
    id: 105,
    category: 'market',
    title: '菲律宾市场画像（PH）',
    content:
      '英语普及率高，家庭与宗教（天主教）观念强，内容偏温情、幽默、家庭向。美妆、护肤、母婴、食品、手机配件需求大。英语或他加禄语混用，budol（种草/冲动购）文化流行。用户爱「bestie、affordable、real talk」式亲切表达。',
    source: '行业常识',
    updated: '2026-10-28',
    hits: 0,
    country: 'PH',
    keywords: ['菲律宾', 'PH', '英语', '天主教', '家庭', 'budol', '美妆'],
    tags: ['英语普及', '家庭向', '温情幽默', 'budol'],
  },
  {
    id: 106,
    category: 'market',
    title: '马来西亚市场画像（MY）',
    content:
      '多元族群（马来、华、印），中产占比高、消费力较强。Halal 认证对食品/美妆/个护影响大。马来语/英语/华语并存。内容可走「berbaloi（划算）、murah（便宜）、日常口语」路线；宗教与族群话题需谨慎尊重。',
    source: '行业常识',
    updated: '2026-10-28',
    hits: 0,
    country: 'MY',
    keywords: ['马来西亚', 'MY', 'halal', '多元', '中产', '划算'],
    tags: ['多元族群', 'Halal', '中产', '日常口语'],
  },

  // ---------- 合规知识库 compliance ----------
  { id: 201, category: 'compliance', layer: 'L1', title: '东南亚社媒带货基础', content: '短视频 + 直播双驱动，内容节奏前 3 秒决定完播；达人背书与评论口碑是核心转化杠杆。', source: '内部方法论 v1.2', updated: '2026-10-20', hits: 0, keywords: ['完播', '短视频', '直播', '口碑'] },
  { id: 202, category: 'compliance', layer: 'L1', title: 'TikTok 算法基础', content: '完播率、互动率权重高，标签影响初始分发；自然流量依赖内容质量而非硬广堆砌。', source: '平台公开文档', updated: '2026-10-18', hits: 0, keywords: ['完播率', '互动率', '标签', '分发'] },
  { id: 203, category: 'compliance', layer: 'L1', title: '跨境内容通用尺度', content: '不得涉及政治、色情、暴力、仇恨言论；医疗/金融/保健/烟酒等受限制类目需资质，普通卖家勿碰。', source: '平台规则', updated: '2026-10-23', hits: 0, keywords: ['政治', '色情', '暴力', '医疗', '金融', '烟酒'] },

  { id: 211, category: 'compliance', layer: 'L2', title: '印尼：清真与宗教禁忌', content: '避免酒精、猪肉暗示及清真相关误用；未取得 Halal 认证不得宣称清真。斋月营销宜侧重家庭与馈赠。', source: '印尼贸易部规定（通用原则）', updated: '2026-10-22', hits: 0, country: 'ID', keywords: ['清真', 'halal', '猪肉', '猪', '酒精', '酒', '斋月', '礼拜', 'ramadan'], level: 'high', suggestion: '删除清真相关宣称，或改为“适合日常使用”等中性表述' },
  { id: 212, category: 'compliance', layer: 'L2', title: '印尼：价格与功效宣称', content: '价格与功效宣称需可验证，避免“最低价/销量第一”等无法证明的表述。', source: '印尼广告法（通用原则）', updated: '2026-10-22', hits: 0, country: 'ID', keywords: ['最低价', '销量第一', '功效', '全网最低'], level: 'medium', suggestion: '给出可验证的价格区间与数据来源，或改为“近期优惠价”' },
  { id: 221, category: 'compliance', layer: 'L2', title: '泰国：皇室与宗教敏感', content: '皇室相关用语需极度礼貌，宗教内容谨慎；佛像、僧侣形象不得商用或戏谑。', source: '泰国法律（通用原则）', updated: '2026-10-21', hits: 0, country: 'TH', keywords: ['皇室', '王室', '国王', '王后', '佛像', '佛教', '僧侣', 'royal'], level: 'high', suggestion: '移除皇室与宗教相关内容，避免任何戏谑或商业挪用' },
  { id: 222, category: 'compliance', layer: 'L2', title: '泰国：医疗与美妆宣称', content: '护肤品不得宣称疗效（美白/淡斑/祛痘需有依据），药品类须资质；避免“治疗/治愈”措辞。', source: '泰国 FDA 通则', updated: '2026-10-21', hits: 0, country: 'TH', keywords: ['治疗', '治愈', '美白', '淡斑', '祛痘', '疗效'], level: 'high', suggestion: '仅描述使用感受，不作疗效承诺' },
  { id: 231, category: 'compliance', layer: 'L2', title: '越南：功效与价格审查', content: '价格与功效宣称需可验证，避免夸大；不得使用无法证明的“最低价/最便宜”。', source: '越南广告法（通用原则）', updated: '2026-10-19', hits: 0, country: 'VN', keywords: ['功效', '最低价', '全网最低', '最便宜', '治疗', '价格'], level: 'medium', suggestion: '给出可验证的价格区间与数据来源，或改为“近期优惠价”' },
  { id: 232, category: 'compliance', layer: 'L2', title: '越南：地图与领土表述', content: '涉及国家地图、边境与领土的表述须谨慎，避免政治敏感；内容保持商业中立。', source: '越南法规（通用原则）', updated: '2026-10-19', hits: 0, country: 'VN', keywords: ['地图', '领土', '边境', '政治'], level: 'high', suggestion: '移除涉及地图与领土的表述，保持纯商业内容' },
  { id: 241, category: 'compliance', layer: 'L2', title: '菲律宾：天主教与家庭语境', content: '家庭、宗教（天主教）话题宜温情正向，避免冒犯；勿用宗教做产品背书。', source: '平台与广告通则', updated: '2026-10-20', hits: 0, country: 'PH', keywords: ['天主教', '宗教', '家庭', '祈祷', '上帝'], level: 'medium', suggestion: '改用生活化温情表达，避免宗教背书' },
  { id: 242, category: 'compliance', layer: 'L2', title: '菲律宾：儿童与未成年人', content: '不得让未成年人出镜做背书或诱导消费；母婴产品聚焦父母视角。', source: '平台规则', updated: '2026-10-20', hits: 0, country: 'PH', keywords: ['儿童', '未成年人', '小孩', '学生', '背书'], level: 'high', suggestion: '改为父母/成人视角描述，移除未成年人出镜或背书' },
  { id: 251, category: 'compliance', layer: 'L2', title: '马来西亚：Halal 与族群尊重', content: '食品/美妆/个护涉及 Halal 须有认证；宗教与族群话题需谨慎尊重，避免争议。', source: '马来西亚法规（通用原则）', updated: '2026-10-22', hits: 0, country: 'MY', keywords: ['halal', '清真', '马来', '宗教', '族群', '猪肉'], level: 'high', suggestion: '取得认证再宣称 Halal，否则删除相关表述' },
  { id: 252, category: 'compliance', layer: 'L2', title: '马来西亚：语言与民族表述', content: '马来语/英语/华语并存；民族相关表述保持中立尊重，避免争议性政治内容。', source: '平台与广告通则', updated: '2026-10-22', hits: 0, country: 'MY', keywords: ['马来语', '民族', '政治', '族群'], level: 'medium', suggestion: '保持中立商业表达，移除争议性政治表述' },

  { id: 261, category: 'compliance', layer: 'L3', title: '绝对化用语', content: '最 / 第一 / 唯一 / 顶级 / 国家级 / 永久 / 100% 等无法证实的最高级表述属违禁。', source: '广告法（通用原则）', updated: '2026-10-23', hits: 0, keywords: ['最', '第一', '唯一', '顶级', '国家级', '永久', '100%', 'no.1', 'guaranteed'], level: 'high', suggestion: '改为“很 / 颇受好评 / 多次回购”等相对表述' },
  { id: 262, category: 'compliance', layer: 'L3', title: '医疗宣称', content: '治愈 / 根治 / 消炎 / 美白淡斑 / 减肥瘦身 等疗效承诺禁止，非医疗器械不得宣称疗效。', source: '平台规则', updated: '2026-10-23', hits: 0, keywords: ['治愈', '根治', '治疗', '消炎', '美白', '淡斑', '减肥', '瘦身', '见效', '疗效'], level: 'high', suggestion: '仅描述使用感受（如“用着清爽”），不作疗效承诺' },
  { id: 263, category: 'compliance', layer: 'L3', title: '诱导互动', content: '免费送 / 无条件 / 清仓 / 点击领 等需明确活动规则，不得诱导刷评刷赞。', source: '平台规则', updated: '2026-10-22', hits: 0, keywords: ['免费送', '无条件', '清仓', '点击领', '免费领', '刷单', '好评返现'], level: 'medium', suggestion: '写明活动时间、参与条件与奖品数量，或改为“参与方式见主页”' },
  { id: 264, category: 'compliance', layer: 'L3', title: '虚假促销', content: '虚构原价、无法验证的折扣、“限时”却无期限、虚假赠品等均属违规。', source: '平台规则', updated: '2026-10-22', hits: 0, keywords: ['原价', '虚假', '限时', '折扣', '赠品', '到账'], level: 'medium', suggestion: '给出真实活动规则与期限，删除无法验证的优惠表述' },
  { id: 265, category: 'compliance', layer: 'L3', title: '未成年人背书', content: '不得安排未成年人出镜背书或面向未成年人的诱导消费。', source: '平台规则', updated: '2026-10-22', hits: 0, keywords: ['儿童', '未成年人', '小孩', '学生', '背书', '儿童推荐'], level: 'high', suggestion: '改为成人视角，移除未成年人出镜或背书' },
  { id: 266, category: 'compliance', layer: 'L3', title: '受限类目', content: '烟酒、医疗器械、保健品、成人用品、金融借贷、加密货币、药品等需资质，普通卖家勿推广。', source: '平台规则', updated: '2026-10-23', hits: 0, keywords: ['烟酒', '医疗', '保健', '成人', '金融', '借贷', '加密货币', '药品', '贷款'], level: 'high', suggestion: '该品类不建议投放，或确认具备相应资质后再推广' },

  // ---------- 文化适配语料库 culture ----------
  { id: 301, category: 'culture', title: '印尼文化禁忌意象', content: '避免猪、酒精、不清真食品、暴露着装、亲密肢体接触；左撇子递物、踩门槛等亦不雅。斋月宜温情家庭向，避免喧闹促销感。', source: '文化常识', updated: '2026-10-28', hits: 0, country: 'ID', keywords: ['猪', '酒精', '清真', '暴露', '斋月', '左撇子'], level: 'high', suggestion: '改用家庭/日常/中性意象，移除宗教敏感画面' },
  { id: 302, category: 'culture', title: '印尼本地化热词与称呼', content: '多用 kece（酷）、banget（超）、murah（便宜）、mantul（棒）；“bestie/gaes”式亲切称呼拉近距离。', source: '语言常识', updated: '2026-10-28', hits: 0, country: 'ID', keywords: ['kece', 'banget', 'murah', 'mantul', 'bestie', 'gaes'], suggestion: '在口播中自然嵌入 1-2 个本地热词提升亲近感' },
  { id: 311, category: 'culture', title: '泰国皇室与佛教符号', content: '国旗、皇室、僧侣、佛像不得商用或戏谑；合十礼（wai）是礼貌符号，可正向使用。', source: '文化常识', updated: '2026-10-28', hits: 0, country: 'TH', keywords: ['皇室', '佛像', '僧侣', '国旗', 'wai', '合十'], level: 'high', suggestion: '移除皇室与宗教符号，改用生活化正向意象' },
  { id: 312, category: 'culture', title: '泰国营销时机（宋干节/新年）', content: '宋干节（4 月泼水节）、泰国新年是重要节点；内容可走清凉、欢乐、团聚主题，避免悲伤或争议。', source: '文化常识', updated: '2026-10-28', hits: 0, country: 'TH', keywords: ['宋干节', '泼水节', '新年', '清凉', '团圆'], suggestion: '结合节日做欢乐清凉主题，避免敏感政治内容' },
  { id: 321, category: 'culture', title: '越南表达与禁忌', content: '表达直爽、爱叠词感叹；避免地图/领土/政治表述。忌用不尊重国家象征的意象。', source: '文化常识', updated: '2026-10-28', hits: 0, country: 'VN', keywords: ['叠词', '感叹', '地图', '领土', '政治'], level: 'medium', suggestion: '用直爽亲切口吻，移除政治与领土表述' },
  { id: 322, category: 'culture', title: '越南节日营销（春节 Tet）', content: '农历春节（Tet）是全年最大节点，返乡、团聚、红包、焕新主题受捧；可结合“新年换新”叙事。', source: '文化常识', updated: '2026-10-28', hits: 0, country: 'VN', keywords: ['春节', 'tet', '团聚', '红包', '焕新'], suggestion: '以团聚/焕新为主题，避免夸大功效' },
  { id: 331, category: 'culture', title: '菲律宾家庭与宗教语境', content: '家庭、亲情、信仰（天主教）是温情入口；避免亵渎宗教或让儿童做诱导。budol 种草文化浓厚。', source: '文化常识', updated: '2026-10-28', hits: 0, country: 'PH', keywords: ['家庭', '亲情', '信仰', 'budol', '天主教', '儿童'], level: 'medium', suggestion: '走温情家庭向，避免宗教亵渎与儿童诱导' },
  { id: 332, category: 'culture', title: '菲律宾语言混用（英/他加禄）', content: '英语与他加禄语混用自然；多用 bestie、affordable、real talk、pakigamit（试用）等；节庆圣诞季消费旺。', source: '语言常识', updated: '2026-10-28', hits: 0, country: 'PH', keywords: ['bestie', 'affordable', 'real talk', 'pakigamit', '圣诞'], suggestion: '口播中英混用更自然，圣诞季可做礼物主题' },
  { id: 341, category: 'culture', title: '马来西亚 Halal 与多元尊重', content: '食品/美妆避免猪源与酒精；尊重马来、华、印各族习俗。斋月（马来穆斯林）亦是大促节点。', source: '文化常识', updated: '2026-10-28', hits: 0, country: 'MY', keywords: ['halal', '马来', '华', '印', '斋月', '猪', '酒精'], level: 'high', suggestion: '确保 Halal 合规，尊重多元族群习俗' },
  { id: 342, category: 'culture', title: '马来西亚本地化口语', content: '马来语/英语混用自然；berbaloi（划算）、murah（便宜）、bestnya（太棒了）常用。斋月宜家庭馈赠向。', source: '语言常识', updated: '2026-10-28', hits: 0, country: 'MY', keywords: ['berbaloi', 'murah', 'bestnya', '斋月', '划算'], suggestion: '口播嵌入本地口语，提升亲近感' },

  // ---------- 脚本结构模板库 script ----------
  { id: 401, category: 'script', title: '开箱测评型模板', scenario: '数码/美妆/家居新品，强调真实体验', content: '以第一视角开箱，突出“拆箱惊喜 + 上手实测 + 真实感受”，建立可信度。', source: '模板库', updated: '2026-10-28', hits: 0, keywords: ['开箱', '测评', '数码', '美妆', '家居', '实测'], structure: '[0-3秒] 开箱钩子：刚收到就迫不及待开箱\n[3-10秒] 外观/配件一览：第一眼印象\n[10-25秒] 上手实测：核心功能/质地真实演示\n[25-30秒] 真实结论+行动号召', example: '刚到货就拆给你看！这个…（展示）上手真的…（演示）用下来最大的感受是…喜欢的点主页戳我。' },
  { id: 402, category: 'script', title: '痛点场景型模板', scenario: '解决具体问题/日常烦恼的产品', content: '先放大痛点引发共鸣，再亮出产品作为解法，最后给场景化使用感受。', source: '模板库', updated: '2026-10-28', hits: 0, keywords: ['痛点', '场景', '烦恼', '解决', '日常'], structure: '[0-3秒] 痛点钩子：每次…最烦的就是\n[3-10秒] 亮出产品：直到用了它\n[10-25秒] 场景演示：在…场景里怎么解决\n[25-30秒] 转化引导', example: '每次出门最烦…（痛点）后来试了它（产品）在…（场景）真的省心，链接在购物车。' },
  { id: 403, category: 'script', title: '对比种草型模板', scenario: '有替代品/旧方案，突出升级优势', content: '用“以前 vs 现在”对比制造反差，强调差异化卖点，避免贬低竞品。', source: '模板库', updated: '2026-10-28', hits: 0, keywords: ['对比', '以前', '现在', '升级', '反差'], structure: '[0-3秒] 反差钩子：以前…现在\n[3-12秒] 旧方案痛点：为什么不够好\n[12-25秒] 新方案优势：具体好在哪\n[25-30秒] 行动号召', example: '以前用…总…（旧）换了它之后…（新）差别真的明显，想知道的扣1。' },
  { id: 404, category: 'script', title: '节日营销型模板', scenario: '斋月/宋干/春节/圣诞等大促节点', content: '贴合节日情绪（团聚/焕新/清凉/礼物），软性植入产品作为节日好物，避免硬广。', source: '模板库', updated: '2026-10-28', hits: 0, keywords: ['节日', '斋月', '春节', '圣诞', '宋干', '礼物', '大促'], structure: '[0-3秒] 节日钩子：快到…了\n[3-12秒] 节日情绪：团聚/焕新/清凉\n[12-25秒] 好物植入：适合节日的理由\n[25-30秒] 限时活动引导', example: '快到…啦，今年给家人准备了这个…（产品）节日用刚刚好，活动见主页。' },
  { id: 405, category: 'script', title: '教程干货型模板', scenario: '美妆/穿搭/家居技巧，含产品教学', content: '以“教你一招”切入，过程中自然带出产品用法，建立专业可信形象。', source: '模板库', updated: '2026-10-28', hits: 0, keywords: ['教程', '干货', '技巧', '教学', '美妆', '穿搭'], structure: '[0-3秒] 干货钩子：3 步搞定…\n[3-12秒] 步骤1+产品初登场\n[12-25秒] 步骤2-3+产品用法演示\n[25-30秒] 收尾+关注引导', example: '教你 3 步…（干货）关键是这一步用…（产品）学会了记得关注。' },
  { id: 406, category: 'script', title: '情感故事型模板', scenario: '母婴/家居/礼品类，走温情路线', content: '用一个生活小故事引出产品，强调情感价值（陪伴/安心/爱），弱化硬卖。', source: '模板库', updated: '2026-10-28', hits: 0, keywords: ['故事', '情感', '母婴', '家居', '礼物', '温情'], structure: '[0-3秒] 故事钩子：昨天…让我想到\n[3-15秒] 故事展开+产品出现\n[15-25秒] 情感升华：它带来的改变\n[25-30秒] 温柔行动号召', example: '昨天看到…（故事）就想起这个…（产品）用它之后家里更…（情感）想了解的私信我。' },
]

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

// 旧数据兼容：缺字段补默认，无 category 默认合规库
function migrateKb(e: KbEntry): KbEntry {
  return {
    id: e.id,
    category: e.category ?? 'compliance',
    layer: e.layer,
    title: e.title ?? '',
    content: e.content ?? '',
    source: e.source ?? '',
    updated: e.updated ?? today(),
    hits: e.hits ?? 0,
    country: e.country,
    keywords: e.keywords,
    level: e.level,
    suggestion: e.suggestion,
    scenario: e.scenario,
    structure: e.structure,
    example: e.example,
    tags: e.tags,
  }
}

// ===== 服务端同步 =====
let liveKb: KbEntry[] | null = null
const kbListeners = new Set<() => void>()
export function subscribeKb(fn: () => void): () => void {
  kbListeners.add(fn)
  return () => kbListeners.delete(fn)
}
function notifyKb() {
  kbListeners.forEach((f) => f())
}

export function setLiveKb(list: KbEntry[]): void {
  liveKb = list.map(migrateKb)
  notifyKb()
}

export function loadKb(): KbEntry[] {
  if (liveKb) return liveKb
  try {
    const raw = localStorage.getItem(KB_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as KbEntry[]
      if (Array.isArray(parsed)) return parsed.map(migrateKb)
    }
  } catch {
    /* ignore */
  }
  return JSON.parse(JSON.stringify(KB_SEED)) as KbEntry[]
}

export function saveKb(list: KbEntry[]): void {
  try {
    localStorage.setItem(KB_KEY, JSON.stringify(list))
  } catch {
    /* ignore */
  }
}

export function nextKbId(list: KbEntry[]): number {
  return list.reduce((m, e) => Math.max(m, e.id), 0) + 1
}

// 启动从服务端拉取；若服务端未初始化且本地持有口令，自动用种子写入
export async function syncKbFromServer(): Promise<void> {
  // 单文件演示模式（file://）下没有服务端，直接用内置种子，不发起必然失败的请求
  try {
    if (typeof location !== 'undefined' && location.protocol === 'file:') return
  } catch {
    /* ignore */
  }
  try {
    const res = await fetch('/__kb_store')
    if (!res.ok) return
    const data = await res.json().catch(() => null)
    if (!data || !Array.isArray(data.entries)) return
    if (data.entries.length > 0) {
      setLiveKb(data.entries)
    } else {
      const key = localStorage.getItem(KB_SETUP_KEY_LS) || KB_SETUP_KEY_DEFAULT
      try {
        const r = await fetch('/__kb_store', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Setup-Key': key },
          body: JSON.stringify({ entries: KB_SEED }),
        })
        if (r.ok) setLiveKb(JSON.parse(JSON.stringify(KB_SEED)))
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* 接口不存在 / 网络异常 → 回退本地 */
  }
}

// 运营经口令修改后写回服务端（对所有访客即时生效）
export async function saveKbToServer(list: KbEntry[], key: string): Promise<void> {
  const res = await fetch('/__kb_store', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Setup-Key': key },
    body: JSON.stringify({ entries: list }),
  })
  if (res.status === 401) throw new Error('口令错误')
  if (!res.ok) throw new Error('保存失败')
  setLiveKb(list)
}

// 命中数回写：召回时只在内存累加，这里合并多次召回到一次服务端落盘（防抖），
// 避免每次召回都打一次网络；失败为尽力而为，不影响主流程。
let hitsSyncTimer: ReturnType<typeof setTimeout> | null = null
function scheduleHitsSync(): void {
  if (hitsSyncTimer) return
  hitsSyncTimer = setTimeout(() => {
    hitsSyncTimer = null
    if (!liveKb) return
    const key = localStorage.getItem(KB_SETUP_KEY_LS) || KB_SETUP_KEY_DEFAULT
    fetch('/__kb_store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Setup-Key': key },
      body: JSON.stringify({ entries: liveKb }),
    }).catch(() => {
      /* 命中数回写为尽力而为，失败不影响主流程 */
    })
  }, 800)
}

// ---- 检索 ----
export interface RecallItem {
  entry: KbEntry
  score: number
  matched: string[]
}

/**
 * 按「国家码 + 文案关键词」召回知识库条目，可按 category 限定子库。
 * 打分：+6 国别完全匹配 / +3 关键词命中 / +2 标题命中 / -3 他国专属 L2 规则降权 / L1 保底 1 分。
 * 返回得分 > 0 的条目按分数降序，最多 limit 条；并累加命中次数（仅更新内存，不回写服务端）。
 */
export function recallKb(text: string, countryCode: string, category?: KbCategory, limit = 12): RecallItem[] {
  const t = (text || '').toLowerCase()
  const cc = (countryCode || '').trim().toUpperCase()
  const list = loadKb().filter((e) => !category || e.category === category)

  const scored: RecallItem[] = list.map((entry) => {
    let score = 0
    const matched: string[] = []

    if (cc) {
      if (entry.country && entry.country.toUpperCase() === cc) {
        score += 6
        matched.push(`国别=${cc}`)
      } else if (entry.country && entry.category === 'compliance' && entry.layer === 'L2') {
        score -= 3
      }
    }

    for (const kw of entry.keywords ?? []) {
      const k = (kw || '').toLowerCase()
      if (k && t.includes(k)) {
        score += 3
        matched.push(kw)
      }
    }

    if (entry.title && t.includes(entry.title.toLowerCase())) score += 2

    if (entry.category === 'compliance' && entry.layer === 'L1') score = Math.max(score, 1)

    return { entry, score, matched }
  })

  const top = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, limit)

  if (top.length) {
    const hitIds = new Set(top.map((t2) => t2.entry.id))
    if (liveKb) {
      liveKb = liveKb.map((e) => (hitIds.has(e.id) ? { ...e, hits: (e.hits ?? 0) + 1 } : e))
      scheduleHitsSync() // 命中数回写服务端（防抖合并，详见上方说明）
    } else {
      const next = list.map((e) => (hitIds.has(e.id) ? { ...e, hits: (e.hits ?? 0) + 1 } : e))
      saveKb(next)
    }
  }

  return top
}

// 把召回结果渲染成给模型看的文本块
export function formatKb(items: RecallItem[]): string {
  if (!items.length) return '（本次未召回任何知识库条目）'
  return items
    .map(({ entry, matched, score }) => {
      const catTag = `[${entry.category}]`
      const layerTag = entry.layer ? `[${entry.layer}]` : ''
      const cTag = entry.country ? `[${entry.country}]` : ''
      const lv = entry.level ? `｜风险${entry.level === 'high' ? '高' : '中'}` : ''
      const src = entry.source ? `｜source：${entry.source}` : ''
      const mt = matched.length ? `\n   命中线索：${matched.join('、')}` : ''
      const sug = entry.suggestion ? `\n   预置建议：${entry.suggestion}` : ''
      const ex = entry.example ? `\n   示例：${entry.example}` : ''
      return `- ${catTag}${layerTag}${cTag}${lv}${src} ${entry.title}\n   ${entry.content}${mt}${sug}${ex}\n   （相关度 ${score}）`
    })
    .join('\n')
}
