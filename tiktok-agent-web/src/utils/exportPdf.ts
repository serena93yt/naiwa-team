// ===== 爆品搜索结果 → PDF 导出 =====
// 思路（保证中文不乱码的关键）：
//   1) 在离屏 DOM 里用浏览器原生渲染一份「报告版」HTML（中文字体由系统提供，绝不乱码）；
//   2) html2canvas-pro 把这段 DOM 转成高清 canvas；
//   3) 按商品卡片边界计算分页位置（避免把一个商品切成上下两页）；
//   4) jsPDF 逐页贴图拼成 A4 PDF 并触发下载。
// 之所以不走 jsPDF 原生 text()，是因为自带字体不含中文，写中文会变成乱码/空白。

// 依赖体积较大且只有导出时才用得上，改为动态加载，避免拖慢首屏。

export interface PdfMetric {
  label: string
  value: string
}

export interface PdfProductRow {
  no: number
  verdict: string
  title: string
  metaLine: string
  metrics: PdfMetric[]
  reasons: string[]
}

export interface PdfPayload {
  title: string
  generatedAt: string
  sourceLabel: string
  criteria: PdfMetric[] // 本次搜索条件摘要
  rows: PdfProductRow[]
}

// ---------- A4 版式常量（96dpi 换算） ----------
const PAGE_W_MM = 210
const PAGE_H_MM = 297
const MARGIN_MM = 10
const CONTENT_W_MM = PAGE_W_MM - MARGIN_MM * 2 // 190mm
const CONTENT_W_PX = 718 // ≈190mm @96dpi
const MAX_CANVAS_H = 14000 // 浏览器 canvas 高度存在上限，超过会出空白

function escapeHtml(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ))
}

const VERDICT_COLOR: Record<string, string> = {
  强烈推荐: '#1A7F37',
  推荐: '#1F6FEB',
  观察: '#6B7280',
}

function renderHtml(p: PdfPayload): string {
  const critRows = p.criteria.map((c) => `
      <tr><td class="k">${escapeHtml(c.label)}</td><td class="v">${escapeHtml(c.value)}</td></tr>`).join('')

  const items = p.rows.map((r) => {
    // 指标两两一组，每行 4 列（标签 | 值 | 标签 | 值）
    const cells: string[] = []
    for (let i = 0; i < r.metrics.length; i += 2) {
      const a = r.metrics[i]
      const b = r.metrics[i + 1]
      cells.push(
        `<tr><td class="k">${escapeHtml(a.label)}</td><td class="v">${escapeHtml(a.value)}</td>` +
        (b
          ? `<td class="k">${escapeHtml(b.label)}</td><td class="v">${escapeHtml(b.value)}</td>`
          : `<td class="k"></td><td class="v"></td>`) +
        `</tr>`,
      )
    }
    const color = VERDICT_COLOR[r.verdict] ?? '#6B7280'
    const reasons = r.reasons.length
      ? `<tr><td class="k" colspan="4" style="vertical-align:top;">推荐理由</td></tr>
         <tr><td colspan="4"><ul class="rs">${r.reasons.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul></td></tr>`
      : ''
    return `
      <table class="item">
        <tr>
          <td class="it-head" colspan="4">
            <span class="no">#${r.no}</span>
            <span class="verdict" style="color:${color};border-color:${color};">${escapeHtml(r.verdict)}</span>
            <span class="it-title">${escapeHtml(r.title)}</span>
          </td>
        </tr>
        <tr><td class="meta" colspan="4">${escapeHtml(r.metaLine)}</td></tr>
        ${cells.join('')}
        ${reasons}
      </table>`
  }).join('')

  return `
  <div class="rpt">
    <div class="hd">
      <div class="h1">${escapeHtml(p.title)}</div>
      <div class="sub">生成时间：${escapeHtml(p.generatedAt)}　·　数据源：${escapeHtml(p.sourceLabel)}　·　共 ${p.rows.length} 条</div>
    </div>
    <table class="crit">
      <tr><td class="crit-t" colspan="2">本次搜索条件</td></tr>
      ${critRows}
    </table>
    <div class="sec">爆品清单</div>
    ${items || '<div class="none">当前条件下无命中商品。</div>'}
    <div class="ft">本报告由 TikBoost AI 生成，数据来源 Creative Center / EchoTik 公开接口，仅供参考。</div>
  </div>`
}

const STYLE = `
  .rpt { width: ${CONTENT_W_PX}px; box-sizing: border-box; padding: 0; background: #fff; color: #111;
         font-family: "Microsoft YaHei","PingFang SC","Hiragino Sans GB","Noto Sans CJK SC",sans-serif; font-size: 13px; line-height: 1.6; }
  .hd { border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 14px; }
  .h1 { font-size: 22px; font-weight: 700; letter-spacing: 1px; }
  .sub { font-size: 12px; color: #555; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .crit { margin-bottom: 16px; border: 1px solid #D5D8DD; }
  .crit-t { background: #F2F4F7; font-weight: 700; padding: 6px 10px; border-bottom: 1px solid #D5D8DD; }
  .k { width: 15%; background: #F7F8FA; color: #555; font-size: 12px; padding: 5px 8px; border: 1px solid #E3E6EA; }
  .v { width: 35%; padding: 5px 8px; border: 1px solid #E3E6EA; word-break: break-all; }
  .sec { font-size: 15px; font-weight: 700; margin: 4px 0 10px; padding-left: 8px; border-left: 4px solid #111; }
  .item { margin-bottom: 14px; border: 1px solid #C9CED6; }
  .it-head { background: #F2F4F7; padding: 8px 10px; border-bottom: 1px solid #C9CED6; font-weight: 700; }
  .no { display: inline-block; min-width: 34px; color: #666; }
  .verdict { display: inline-block; font-size: 11px; font-weight: 700; border: 1px solid; border-radius: 4px; padding: 0 6px; margin-right: 8px; }
  .it-title { font-size: 13.5px; }
  .meta { padding: 6px 10px; color: #555; font-size: 12px; border-bottom: 1px solid #E3E6EA; background: #FCFCFD; }
  ul.rs { margin: 4px 0 2px; padding-left: 20px; }
  ul.rs li { margin-bottom: 2px; font-size: 12.5px; color: #333; }
  .none { padding: 14px; border: 1px dashed #C9CED6; color: #666; text-align: center; }
  .ft { margin-top: 18px; padding-top: 8px; border-top: 1px solid #D5D8DD; font-size: 11px; color: #888; text-align: center; }
`

// ---------- 通用：逐块离屏截图 → A4 分页贴图 → 下载 ----------
// blocksSelector：可逗号分隔的多个选择器；按 DOM 顺序逐块截图。
// 关键设计：每块单独一张 canvas（高度有限，绝不触浏览器上限），再按块拼页；
// 块不跨页切割（贴不下就换页），单块超过一页高度才对块内部切片。
// 之前"整文档一张长 canvas"的方案在内容超长（五国全量明细 ≈ 1.4 万 px）时下半页会渲染成空白。
async function domToPdf(
  hostInner: string,
  rootSelector: string,
  blocksSelector: string,
  fileName: string,
): Promise<void> {
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.style.cssText = 'position:fixed;left:-12000px;top:0;width:' + CONTENT_W_PX + 'px;z-index:-1;pointer-events:none;'
  host.innerHTML = hostInner
  document.body.appendChild(host)

  const root = host.querySelector<HTMLElement>(rootSelector)
  if (!root) { host.remove(); throw new Error('报告模板渲染失败') }

  try {
    // 动态按需加载（首次点击导出时才拉取这两个依赖）
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import('html2canvas-pro'),
      import('jspdf'),
    ])

    // 收集所有块并按文档顺序排序
    const els = Array.from(root.querySelectorAll<HTMLElement>(blocksSelector))
      .filter((el) => el.offsetHeight > 0)
      .sort((a, b) => a.offsetTop - b.offsetTop)
    if (!els.length) throw new Error('报告内容为空')

    const SCALE = 2
    const shots: HTMLCanvasElement[] = []
    for (const el of els) {
      shots.push(await html2canvas(el, {
        scale: SCALE,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
        width: el.offsetWidth,
        height: el.offsetHeight,
        windowWidth: CONTENT_W_PX,
      }))
    }

    // ---- 分页拼贴：块优先整块贴，贴不下换页；块内超一页才切片 ----
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true })
    const contentHMm = PAGE_H_MM - MARGIN_MM * 2
    let pageY = 0 // 当前页已占用高度（mm）

    const newPage = () => { pdf.addPage(); pageY = 0 }

    for (const cv of shots) {
      const pxPerMm = cv.width / CONTENT_W_MM
      let sliceStart = 0
      while (sliceStart < cv.height) {
        let remainMm = contentHMm - pageY
        if (pageY > 0 && remainMm < 12) { newPage(); remainMm = contentHMm } // 页尾剩太薄先换页
        const sliceH = Math.min(cv.height - sliceStart, Math.floor(remainMm * pxPerMm))
        if (sliceH <= 0) { newPage(); continue }
        const slice = document.createElement('canvas')
        slice.width = cv.width
        slice.height = sliceH
        const ctx = slice.getContext('2d')
        if (!ctx) throw new Error('无法创建画布上下文')
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, slice.width, slice.height)
        ctx.drawImage(cv, 0, sliceStart, cv.width, sliceH, 0, 0, cv.width, sliceH)
        pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', MARGIN_MM, MARGIN_MM + pageY, CONTENT_W_MM, sliceH / pxPerMm, undefined, 'FAST')
        pageY += sliceH / pxPerMm
        sliceStart += sliceH
      }
      pageY += 3 // 块间距
      if (pageY > contentHMm - 10) newPage()
    }

    pdf.save(fileName)
  } finally {
    host.remove()
  }
}

function stamp(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`
}

export async function exportProductsPdf(payload: PdfPayload, fileName?: string): Promise<void> {
  await domToPdf(
    `<style>${STYLE}</style>${renderHtml(payload)}`,
    '.rpt',
    '.hd, .crit, .sec, .item, .ft',
    fileName ?? `爆品清单_${stamp()}.pdf`,
  )
}

// ==========================================================
// ===== 种草内容 + 合规预检报告 → PDF 导出 =====
// ==========================================================

export interface GenReportDim {
  label: string
  value: number
  hits: number
}

export interface GenReportFlag {
  word: string
  level: 'high' | 'medium'
  rule: string
  suggestion: string
  kb?: string
}

export interface GenReportRecalled {
  layer: string
  country: string
  title: string
  source: string
  score: number
  matched: string[]
}

export interface GenReportItem {
  country: string
  countryName: string
  lang: string
  title: string
  script: string
  hashtags: string[]
  score: number
  level: 'pass' | 'warn' | 'block'
  label: string
  dims: GenReportDim[]
  flags: GenReportFlag[]
  passed: string[]
  recalled: GenReportRecalled[]
  note?: string
}

export interface GenReportPayload {
  product: string
  content: string
  platform: string
  modeLabel: string
  /** 内容形态标签：种草内容 / 直播话术，用于报告标题与文件名（默认「种草内容」） */
  kindLabel?: string
  generatedAt: string
  items: GenReportItem[]
}

const LEVEL_COLOR: Record<string, string> = {
  pass: '#1A7F37',
  warn: '#BA7517',
  block: '#A32D2D',
}

function renderGenHtml(p: GenReportPayload): string {
  const kind = p.kindLabel || '种草内容'
  // 五国一览（横评）
  const sumRows = p.items.map((it) => {
    const color = LEVEL_COLOR[it.level] ?? '#6B7280'
    return `<tr>
      <td>${escapeHtml(it.countryName)}（${escapeHtml(it.country)}）</td>
      <td class="sc" style="color:${color};">${it.score}</td>
      <td><span class="vd" style="color:${color};border-color:${color};">${escapeHtml(it.label)}</span></td>
      <td>${it.flags.length ? `${it.flags.length} 项` : '—'}</td>
      <td>${escapeHtml(it.dims.filter((d) => d.hits > 0).map((d) => d.label).join('、') || '—')}</td>
    </tr>`
  }).join('')

  const items = p.items.map((it, idx) => {
    const color = LEVEL_COLOR[it.level] ?? '#6B7280'
    const dimCells = it.dims.map((d) => `
        <tr>
          <td class="k">${escapeHtml(d.label)}</td>
          <td class="bar"><span class="fill" style="width:${Math.max(d.value, 3)}%;background:${d.value >= 50 ? '#E24B4A' : d.value >= 25 ? '#EF9F27' : d.value > 0 ? '#FAC775' : '#97C459'};"></span></td>
          <td class="hit">${d.hits ? `${d.hits} 项` : '通过'}</td>
        </tr>`).join('')

    const flagRows = it.flags.length
      ? it.flags.map((f) => `
        <tr>
          <td class="fw">${escapeHtml(f.word)}</td>
          <td><span class="lv ${f.level}">${f.level === 'high' ? '高' : '中'}</span></td>
          <td>${escapeHtml(f.rule)}</td>
          <td>${escapeHtml(f.kb || '—')}</td>
          <td>${escapeHtml(f.suggestion || '删除或改为合规表述')}</td>
        </tr>`).join('')
      : '<tr><td colspan="5" class="none">未发现违禁词与夸大宣传</td></tr>'

    const recall = it.recalled.length
      ? `<div class="sub2">合规判定依据（知识库召回 ${it.recalled.length} 条，按相关度降序）</div>
         <ul class="rs">${it.recalled.map((r) =>
           `<li>[${escapeHtml(r.layer)}${r.country ? ' · ' + escapeHtml(r.country) : ''}] ${escapeHtml(r.title)}` +
           `　来源：${escapeHtml(r.source || '—')}　相关度 ${r.score}` +
           (r.matched.length ? `　命中：${escapeHtml(r.matched.join('、'))}` : '') +
           `</li>`,
         ).join('')}</ul>`
      : ''

    const passed = it.passed.length
      ? `<div class="sub2">已通过的检查</div>
         <ul class="rs">${it.passed.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul>`
      : ''

    return `
      <div class="gitem">
        <div class="gh">
          <span class="no">#${idx + 1}</span>
          <span class="cty">${escapeHtml(it.countryName)}（${escapeHtml(it.country)}）· ${escapeHtml(it.lang)}</span>
          <span class="vd" style="color:${color};border-color:${color};">${escapeHtml(it.label)}</span>
          <span class="sc2" style="color:${color};">合规分 ${it.score}</span>
        </div>
        ${it.note ? `<div class="gnote">说明：${escapeHtml(it.note)}</div>` : ''}
        <div class="gt">${escapeHtml(it.title)}</div>
        <div class="gscript">${escapeHtml(it.script)}</div>
        <div class="gtags">${it.hashtags.map((t) => `<span class="tg">${escapeHtml(t)}</span>`).join('')}</div>
        <div class="sub2">合规维度</div>
        <table class="dims">${dimCells}</table>
        <div class="sub2">命中风险项</div>
        <table class="flags">
          <tr><th>命中词</th><th>等级</th><th>规则</th><th>知识库条目</th><th>修改建议</th></tr>
          ${flagRows}
        </table>
        ${recall}
        ${passed}
      </div>`
  }).join('')

  return `
  <div class="grpt">
    <div class="ghead">
      <div class="hd">
        <div class="h1">${escapeHtml(kind)} & 合规预检报告</div>
        <div class="sub">生成时间：${escapeHtml(p.generatedAt)}　·　投放平台：${escapeHtml(p.platform)}　·　运行模式：${escapeHtml(p.modeLabel)}　·　共 ${p.items.length} 国　·　内容形态：${escapeHtml(kind)}</div>
      </div>
      <table class="ov">
        <tr><td class="k">商品名称</td><td class="v" colspan="3">${escapeHtml(p.product)}</td></tr>
        <tr><td class="k">商品内容</td><td class="v" colspan="3">${escapeHtml(p.content || '（未填写）')}</td></tr>
        <tr><td class="k">覆盖国家</td><td class="v" colspan="3">${escapeHtml(p.items.map((i) => i.countryName).join(' / '))}</td></tr>
      </table>
      <div class="sec">五国合规一览</div>
      <table class="sum">
        <tr><th>国家</th><th>合规分</th><th>结论</th><th>命中</th><th>风险维度</th></tr>
        ${sumRows}
      </table>
    </div>
    <div class="sec">分国详情：${escapeHtml(kind)}与合规结论</div>
    ${items}
    <div class="ft">本报告由 TikBoost AI 自动生成，合规结论依据「五国合规知识库」召回条目判定，仅供参考，投放前请结合平台最新规则复核。</div>
  </div>`
}

const STYLE_GEN = `
  .grpt { width: ${CONTENT_W_PX}px; box-sizing: border-box; background: #fff; color: #111;
          font-family: "Microsoft YaHei","PingFang SC","Hiragino Sans GB","Noto Sans CJK SC",sans-serif; font-size: 13px; line-height: 1.6; }
  .ghead { margin-bottom: 12px; }
  .hd { border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 12px; }
  .h1 { font-size: 22px; font-weight: 700; letter-spacing: 1px; }
  .sub { font-size: 12px; color: #555; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .ov { border: 1px solid #D5D8DD; margin-bottom: 14px; }
  .k { width: 14%; background: #F7F8FA; color: #555; font-size: 12px; padding: 5px 8px; border: 1px solid #E3E6EA; }
  .v { padding: 5px 8px; border: 1px solid #E3E6EA; word-break: break-all; }
  .sec { font-size: 15px; font-weight: 700; margin: 8px 0 8px; padding-left: 8px; border-left: 4px solid #111; }
  .sum { border: 1px solid #C9CED6; margin-bottom: 6px; }
  .sum th { background: #F2F4F7; font-size: 12px; padding: 5px 8px; border: 1px solid #D5D8DD; text-align: left; }
  .sum td { font-size: 12.5px; padding: 5px 8px; border: 1px solid #E3E6EA; }
  .sc { font-weight: 700; font-size: 14px; }
  .vd { display: inline-block; font-size: 11px; font-weight: 700; border: 1px solid; border-radius: 4px; padding: 0 6px; }
  .gitem { margin-bottom: 16px; border: 1px solid #C9CED6; padding: 10px 12px; }
  .gh { background: #F2F4F7; margin: -10px -12px 10px; padding: 8px 12px; border-bottom: 1px solid #C9CED6; display: flex; align-items: center; gap: 8px; }
  .no { color: #666; font-size: 12px; }
  .cty { font-weight: 700; font-size: 13.5px; }
  .sc2 { margin-left: auto; font-weight: 700; font-size: 13px; }
  .gnote { font-size: 11.5px; color: #7a5b13; background: #FCF6E8; border: 1px solid #F0E3C0; border-radius: 4px; padding: 4px 8px; margin-bottom: 8px; }
  .gt { font-weight: 700; font-size: 14px; margin-bottom: 6px; word-break: break-all; }
  .gscript { white-space: pre-wrap; word-break: break-word; background: #FCFCFD; border: 1px solid #E3E6EA; border-radius: 4px; padding: 8px 10px; font-size: 13px; line-height: 1.8; }
  .gtags { margin: 6px 0 10px; }
  .tg { display: inline-block; background: #F1EFE8; color: #444; font-size: 11.5px; padding: 1px 7px; border-radius: 4px; margin-right: 5px; }
  .sub2 { font-size: 12.5px; font-weight: 700; color: #333; margin: 10px 0 4px; }
  .dims { border: 1px solid #E3E6EA; }
  .dims .k { width: 22%; }
  .bar { padding: 6px 8px; border: 1px solid #E3E6EA; }
  .fill { display: block; height: 7px; border-radius: 4px; }
  .hit { width: 14%; text-align: center; font-size: 12px; border: 1px solid #E3E6EA; color: #555; }
  .flags { border: 1px solid #E3E6EA; }
  .flags th { background: #F2F4F7; font-size: 12px; padding: 5px 8px; border: 1px solid #E3E6EA; text-align: left; }
  .flags td { font-size: 12.5px; padding: 5px 8px; border: 1px solid #E3E6EA; word-break: break-all; }
  .fw { font-weight: 700; }
  .lv { display: inline-block; font-size: 11px; font-weight: 700; border-radius: 3px; padding: 0 5px; color: #fff; }
  .lv.high { background: #A32D2D; }
  .lv.medium { background: #BA7517; }
  .flags .none { text-align: center; color: #1A7F37; padding: 8px; }
  ul.rs { margin: 4px 0 2px; padding-left: 20px; }
  ul.rs li { margin-bottom: 2px; font-size: 12px; color: #444; }
  .ft { margin-top: 18px; padding-top: 8px; border-top: 1px solid #D5D8DD; font-size: 11px; color: #888; text-align: center; }
`

export async function exportGeneratePdf(payload: GenReportPayload, fileName?: string): Promise<void> {
  await domToPdf(
    `<style>${STYLE_GEN}</style>${renderGenHtml(payload)}`,
    '.grpt',
    '.ghead, .gitem, .ft',
    fileName ?? `${payload.kindLabel || '种草内容'}与合规报告_${stamp()}.pdf`,
  )
}
