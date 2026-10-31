# -*- coding: utf-8 -*-
"""
TK 运营智能体 Demo · 网页卡片渲染器
复用 tk_agent.py 的两个工作流，生成自包含 HTML（浅色主题，可直接双击打开）。

用法:
    python render_html.py                 # 默认示例（保湿身体乳，全绿）
    python render_html.py --risk          # 违规示例（标红）
    python render_html.py --product "保湿面霜,温和不刺激,补水锁水,89元"
输出: index.html（同目录）
"""
import html
import sys
from tk_agent import (parse_product, gen_grass_content, gen_compliance_report,
                      KB, CAT_CN, LEVEL_CN)

FLAGS = {"印尼": "🇮🇩", "泰国": "🇹🇭", "越南": "🇻🇳", "菲律宾": "🇵🇭", "马来西亚": "🇲🇾"}

# 合规状态配色（浅色主题）
LEVEL_STYLE = {
    "green": {"bg": "#e6f7ef", "border": "#12b886", "dot": "#12b886", "badge": "#12b886", "text": "安全"},
    "yellow": {"bg": "#fff8e6", "border": "#f59f00", "dot": "#f59f00", "badge": "#f59f00", "text": "建议修改"},
    "red": {"bg": "#fdecec", "border": "#e03131", "dot": "#e03131", "badge": "#e03131", "text": "必改"},
}


def esc(s):
    return html.escape(s, quote=False)


def render_card(country, data, item, meta):
    level = item["level"]
    style = LEVEL_STYLE[level]
    flag = FLAGS.get(country, "")
    issues = item["issues"]

    # 分镜脚本
    script_lines = "".join(f'<div class="script-line">{esc(line)}</div>' for line in data["分镜脚本"])

    # hashtag
    tags = "".join(f'<span class="tag">{esc(t)}</span>' for t in data["hashtag"])

    # 风险标记
    if issues:
        issue_html = '<div class="issues">'
        for iss in issues:
            cls = "issue-red" if iss["level"] == "red" else "issue-yellow"
            cat_cn = CAT_CN.get(iss["category"], iss["category"])
            issue_html += f'<span class="issue {cls}">{iss["level"] == "red" and "🔴" or "🟡"} {cat_cn}：命中「{esc(iss["word"])}」</span>'
        issue_html += '</div>'
    else:
        issue_html = '<div class="issues"><span class="issue issue-green">✅ 无风险项</span></div>'

    return f'''
    <div class="card" style="border-top:4px solid {style['border']}">
      <div class="card-head">
        <span class="flag">{flag}</span>
        <div class="country">
          <div class="country-name">{esc(country)}</div>
          <div class="lang">{esc(meta["language"])} · {esc(meta["content_style"].split("（")[0])}</div>
        </div>
        <span class="badge" style="background:{style['badge']}">{style['text']}</span>
      </div>
      <div class="section">
        <div class="section-title">种草文案</div>
        <div class="copy">{esc(data["种草文案"])}</div>
      </div>
      <div class="section">
        <div class="section-title">15 秒分镜脚本</div>
        {script_lines}
      </div>
      <div class="section">
        <div class="section-title">本土 Hashtag</div>
        <div class="tags">{tags}</div>
      </div>
      {issue_html}
    </div>'''


def build_html(raw):
    product = parse_product(raw)
    grass = gen_grass_content(product)
    compliance = gen_compliance_report(grass, product)

    name = esc(product["name"])
    sp = "、".join(esc(s) for s in product["sellpoints"]) if product["sellpoints"] else "（未填写）"
    price = esc(product["price"] or "（未填写）")

    cards = ""
    for item in compliance:
        country = item["country"]
        meta = KB["countries"][country]
        data = grass[country]
        cards += render_card(country, data, item, meta)

    # 统计
    n_green = sum(1 for i in compliance if i["level"] == "green")
    n_yellow = sum(1 for i in compliance if i["level"] == "yellow")
    n_red = sum(1 for i in compliance if i["level"] == "red")

    return f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>TK 运营智能体 · 五国种草内容 + 合规预检</title>
<style>
  * {{ margin:0; padding:0; box-sizing:border-box; }}
  body {{ font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif; background:#f5f7fa; color:#1a2733; padding:32px 20px; }}
  .wrap {{ max-width:1100px; margin:0 auto; }}
  .header {{ text-align:center; margin-bottom:28px; }}
  .header h1 {{ font-size:26px; font-weight:700; letter-spacing:.5px; }}
  .header .sub {{ color:#6b7a8a; font-size:13px; margin-top:8px; }}
  .product-bar {{ background:#fff; border-radius:14px; padding:18px 22px; margin-bottom:26px; box-shadow:0 2px 10px rgba(20,40,70,.06); display:flex; flex-wrap:wrap; gap:16px; align-items:center; }}
  .product-bar .p-item {{ display:flex; flex-direction:column; gap:3px; }}
  .product-bar .p-label {{ font-size:11px; color:#8a97a5; }}
  .product-bar .p-value {{ font-size:15px; font-weight:600; color:#1a2733; }}
  .product-bar .p-name {{ font-size:17px; font-weight:700; color:#1a73e8; }}
  .stats {{ display:flex; gap:14px; justify-content:center; margin-bottom:26px; }}
  .stat {{ background:#fff; border-radius:12px; padding:12px 22px; box-shadow:0 2px 8px rgba(20,40,70,.05); text-align:center; min-width:110px; }}
  .stat .num {{ font-size:22px; font-weight:700; }}
  .stat .lbl {{ font-size:12px; color:#8a97a5; margin-top:2px; }}
  .grid {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(320px,1fr)); gap:20px; }}
  .card {{ background:#fff; border-radius:14px; padding:18px 20px; box-shadow:0 2px 12px rgba(20,40,70,.07); display:flex; flex-direction:column; gap:14px; }}
  .card-head {{ display:flex; align-items:center; gap:10px; }}
  .flag {{ font-size:28px; }}
  .country {{ flex:1; }}
  .country-name {{ font-size:18px; font-weight:700; }}
  .lang {{ font-size:11px; color:#8a97a5; margin-top:2px; }}
  .badge {{ color:#fff; font-size:12px; font-weight:600; padding:4px 12px; border-radius:20px; }}
  .section-title {{ font-size:11px; font-weight:700; color:#8a97a5; margin-bottom:6px; text-transform:uppercase; letter-spacing:.5px; }}
  .copy {{ font-size:14px; line-height:1.65; color:#33434f; }}
  .script-line {{ font-size:13px; line-height:1.6; color:#4a5a68; padding:4px 0 4px 12px; border-left:2px solid #e3e9f0; margin-bottom:4px; }}
  .tags {{ display:flex; flex-wrap:wrap; gap:6px; }}
  .tag {{ background:#eef3fb; color:#1a73e8; font-size:12px; padding:3px 10px; border-radius:14px; }}
  .issues {{ display:flex; flex-direction:column; gap:6px; }}
  .issue {{ font-size:12.5px; padding:6px 10px; border-radius:8px; line-height:1.5; }}
  .issue-red {{ background:#fdecec; color:#c92a2a; }}
  .issue-yellow {{ background:#fff8e6; color:#b07800; }}
  .issue-green {{ background:#e6f7ef; color:#0a7a55; }}
  .footer {{ text-align:center; margin-top:30px; color:#8a97a5; font-size:12.5px; }}
  .footer .lock {{ background:#fff; display:inline-block; padding:8px 20px; border-radius:20px; box-shadow:0 2px 8px rgba(20,40,70,.05); }}
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <h1>📦 TK 运营智能体 · 五国种草内容 + 合规预检</h1>
    <div class="sub">一条产品信息 → 五国本地化内容 + 合规三色报告（AI 生成，需母语者复核）</div>
  </div>

  <div class="product-bar">
    <div class="p-item"><span class="p-label">品名</span><span class="p-name">{name}</span></div>
    <div class="p-item"><span class="p-label">卖点</span><span class="p-value">{sp}</span></div>
    <div class="p-item"><span class="p-label">价格</span><span class="p-value">{price}</span></div>
    <div class="p-item"><span class="p-label">品类</span><span class="p-value">{esc(product["category"])}</span></div>
  </div>

  <div class="stats">
    <div class="stat"><div class="num" style="color:#12b886">{n_green}</div><div class="lbl">🟢 安全</div></div>
    <div class="stat"><div class="num" style="color:#f59f00">{n_yellow}</div><div class="lbl">🟡 建议</div></div>
    <div class="stat"><div class="num" style="color:#e03131">{n_red}</div><div class="lbl">🔴 必改</div></div>
  </div>

  <div class="grid">
    {cards}
  </div>

  <div class="footer">
    <span class="lock">🔒 一键发布需人工确认（关键动作把关）</span>
  </div>
</div>
</body>
</html>'''


def main():
    if len(sys.argv) >= 3 and sys.argv[1] == "--product":
        raw = sys.argv[2]
        out = "index.html"
    elif "--risk" in sys.argv:
        raw = "美白身体乳,全球最好第一美白,100%根治暗沉,59元"
        out = "risk.html"
    else:
        raw = "保湿身体乳,温和不刺激,补水锁水,59元"
        out = "index.html"

    html_content = build_html(raw)
    with open(out, "w", encoding="utf-8") as f:
        f.write(html_content)
    print(f"✅ 已生成 {out}（产品: {raw.split(',')[0]}）")
    print("   可直接用浏览器打开查看，或用 present_files 预览。")


if __name__ == "__main__":
    main()
