# -*- coding: utf-8 -*-
"""
TK 运营智能体 P0 Demo
「一条产品信息 → 五国种草内容 + 合规预检报告」
纯本地零依赖，确定性规则 + 知识库驱动，演示稳定可复现。

用法:
    python tk_agent.py
    python tk_agent.py --demo          # 跑内置示例(美白身体乳)
    python tk_agent.py --product "美白身体乳,主打亮白,59元"
"""
import json
import os
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
KB_PATH = os.path.join(BASE_DIR, "knowledge_base.json")


def load_kb():
    with open(KB_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


KB = load_kb()

# 品类维度的卖点与 hashtag 统一从 knowledge_base.json 读取（单一数据源，消除硬编码技术债）


def get_category_content(country, category):
    """按品类取卖点模板（从知识库读），避免跨品类违和。返回 (主卖点, 次卖点)。"""
    meta = KB["countries"][country]
    cat_map = meta.get("sellpoints_by_category", {})
    points = cat_map.get(category, cat_map.get("通用", ["高性价比", "品质保证"]))
    primary = points[0] if points else "高性价比"
    secondary = points[1] if len(points) > 1 else "品质保证"
    return (primary, secondary)


def get_category_hashtag(country, category):
    """按品类取 hashtag（从知识库读）。"""
    meta = KB["countries"][country]
    cat_map = meta.get("hashtags_by_category", {})
    return cat_map.get(category, cat_map.get("通用", ["#fyp", "#viral"]))


# ---------- 工具函数 ----------

def parse_product(raw):
    """从中文产品信息解析出 品名/卖点/价格/品类。"""
    parts = [p.strip() for p in raw.replace("，", ",").split(",") if p.strip()]
    name = parts[0] if parts else "产品"
    sellpoints = parts[1:-1] if len(parts) > 2 else (parts[1:] if len(parts) > 1 else [])
    price = ""
    for p in parts:
        if any(ch.isdigit() for ch in p) and ("元" in p or "¥" in p or "￥" in p):
            price = p
    # 品类推断（用于合规针对性）
    category = "通用"
    cat_keywords = {
        "美妆": ["乳", "霜", "面膜", "精华", "粉底", "口红", "美白", "防晒", "祛痘", "洗面奶", "眼影"],
        "食品": ["零食", "饮料", "咖啡", "茶", "糖", "饼干", "坚果", "辣条"],
        "家居": ["收纳", "清洁", "厨具", "床品", "灯", "杯", "壶", "锅", "榨汁", "加湿器", "香薰"],
        "服饰": ["衣", "裤", "裙", "帽", "鞋", "包", "袜", "围巾"],
    }
    for cat, kws in cat_keywords.items():
        if any(kw in raw for kw in kws):
            category = cat
            break
    return {"name": name, "sellpoints": sellpoints, "price": price, "category": category}


# ---------- 工作流一：种草内容生成 ----------

def gen_grass_content(product):
    """为五国生成种草文案 + 分镜脚本 + hashtag。"""
    name = product["name"]
    sp = "、".join(product["sellpoints"]) if product["sellpoints"] else "优质好物"
    price = product["price"] or "价格优惠"
    results = {}
    for country, meta in KB["countries"].items():
        hook = meta["templates"]["hook"][0]
        # 按品类取卖点模板，避免"美妆卖点"套到"家居产品"
        sp_primary, sp_secondary = get_category_content(country, product["category"])
        sellpoint = sp_primary
        cta = meta["templates"]["cta"][0]
        tags = get_category_hashtag(country, product["category"])
        # 种草文案：如实带入用户原始卖点（合规扫描才能命中违禁词）
        grass = f"{hook} {name}，{sp}，{sellpoint}，{price}，性价比超高！{cta}"
        # 15秒分镜脚本
        script = [
            f"[0-3秒] 开场Hook: {hook}",
            f"[3-10秒] 产品展示: {name}——{sp}，{sellpoint}",
            f"[10-15秒] 转化: {cta} {tags[1]}",
        ]
        results[country] = {
            "语言": meta["language"],
            "种草文案": grass,
            "分镜脚本": script,
            "hashtag": tags,
        }
    return results


# ---------- 工作流二：合规预检 ----------

def check_compliance(content_text, country, meta):
    """对某国内容做合规扫描，返回风险标记列表。
    分级：宗教/政治敏感(religious/sensitive)、医疗功效/效果伪造(medical) → 红(必改)；
    广告绝对化用语(ad_ban) → 黄(建议)。"""
    rules = meta["compliance"]
    issues = []
    for cat, words in rules.items():
        for w in words:
            if w in content_text:
                # medical 属 TK AIGC「效果伪造」红线，标红
                level = "red" if cat in ("religious", "sensitive", "medical") else "yellow"
                issues.append({"level": level, "category": cat, "word": w,
                               "country": country})
    return issues


def gen_compliance_report(grass_results, product=None):
    """对五国种草内容做双轨合规预检，输出三色报告。
    轨一·内容合规：扫描生成文案 + 用户原始卖点的违禁词。
    轨二·商品合规：根据品类返回目标国的认证/禁售要求（需人工确认是否已具备）。"""
    raw_sellpoints = " ".join(product["sellpoints"]) if product else ""
    category = product["category"] if product else "通用"
    report = []
    for country, data in grass_results.items():
        meta = KB["countries"][country]
        # 轨一：内容合规扫描（生成文案 + 用户原始卖点）
        text = data["种草文案"] + " " + raw_sellpoints
        issues = check_compliance(text, country, meta)
        # 轨二：商品合规（按品类取该国的认证/禁售要求，标为「需确认」级别）
        prod_rules = meta.get("product_compliance", {})
        prod_note = prod_rules.get(category, prod_rules.get("通用", ""))
        if prod_note:
            issues.append({"level": "yellow", "category": "product",
                           "word": f"[商品合规·{category}] {prod_note}",
                           "country": country})
        level = "green"
        if any(i["level"] == "red" for i in issues):
            level = "red"
        elif any(i["level"] == "yellow" for i in issues):
            level = "yellow"
        report.append({"country": country, "level": level, "issues": issues,
                       "text": data["种草文案"]})
    return report


# ---------- 输出渲染 ----------

LEVEL_CN = {"red": "🔴 必改", "yellow": "🟡 建议", "green": "🟢 安全"}

CAT_CN = {
    "religious": "宗教文化敏感",
    "medical": "医疗功效/AIGC效果伪造",
    "ad_ban": "广告绝对化用语",
    "sensitive": "政治敏感",
    "product": "商品合规（轨二）",
}


def print_report(grass_results, compliance):
    print("\n" + "=" * 60)
    print("  📦 五国种草内容 + 合规预检报告")
    print("=" * 60)
    for item in compliance:
        country = item["country"]
        meta = KB["countries"][country]
        data = grass_results[country]
        print(f"\n── {country}（{meta['language']}） ──  {LEVEL_CN[item['level']]}")
        print(f"  种草文案: {data['种草文案']}")
        print(f"  hashtag : {' '.join(data['hashtag'])}")
        print(f"  分镜脚本:")
        for line in data["分镜脚本"]:
            print(f"    {line}")
        if item["issues"]:
            print(f"  ⚠️ 风险标记:")
            for iss in item["issues"]:
                tag = "🔴" if iss["level"] == "red" else "🟡"
                cat_cn = CAT_CN.get(iss["category"], iss["category"])
                print(f"    {tag} [{cat_cn}] 命中『{iss['word']}』")
        else:
            print(f"  ✅ 无风险项")
    print("\n" + "=" * 60)
    print("  一键发布需人工确认（关键动作把关）")
    print("=" * 60)


def main():
    # 解析输入
    if len(sys.argv) >= 3 and sys.argv[1] == "--product":
        raw = sys.argv[2]
    elif "--risk" in sys.argv:
        # 演示合规守门：故意带违禁词的输入（含"美白"效果伪造红线 + 绝对化用语）
        raw = "美白身体乳,全球最好第一美白,100%根治暗沉,59元"
    else:
        # 默认：合规产品（全绿），用于与 --risk 对比
        raw = "保湿身体乳,温和不刺激,补水锁水,59元"

    product = parse_product(raw)
    print("\n🎯 解析到的产品信息:")
    print(f"   品名: {product['name']}")
    print(f"   卖点: {'、'.join(product['sellpoints']) if product['sellpoints'] else '（未填写）'}")
    print(f"   价格: {product['price'] or '（未填写）'}")
    print(f"   品类: {product['category']}")

    # 工作流一
    grass = gen_grass_content(product)
    # 工作流二
    compliance = gen_compliance_report(grass, product)
    print_report(grass, compliance)


if __name__ == "__main__":
    main()
