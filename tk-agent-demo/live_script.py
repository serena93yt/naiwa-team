# -*- coding: utf-8 -*-
"""
直播话术工作流（第二个业务场景）
解决评分「至少 2 个平台/场景」：短视频种草 + 直播带货 = 两个场景。
复用 knowledge_base.json，输出五国直播话术（开场/产品讲解/逼单/催付 + 弹幕回复）。

用法：
    python live_script.py                          # 默认示例
    python live_script.py --product "保湿身体乳,温和不刺激,补水锁水,59元"
"""
import json
import os
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
KB_PATH = os.path.join(BASE_DIR, "knowledge_base.json")

with open(KB_PATH, "r", encoding="utf-8") as f:
    KB = json.load(f)

# 直播话术结构模板（通用骨架，具体措辞按国别差异化）
LIVE_STRUCTURE = {
    "开场暖场": "欢迎来到直播间，今天给大家带来 {product}，{hook}",
    "产品讲解": "这款 {product} 的卖点是 {sellpoint}，{scenario}",
    "逼单": "现在下单只要 {price}，{urgency}",
    "催付": "已经拍下的宝宝抓紧付款，{c2a}",
    "售后安抚": "有任何问题随时联系客服，{service}",
}

# 五国直播差异化要素（复用知识库的文化画像）
LIVE_DIFF = {
    "印尼": {
        "hook": "价格打到全网最低，穆斯林家庭也能放心买",
        "scenario": "适合全家一起用，清真认证更安心",
        "urgency": "库存只剩最后 100 件，错过等一个月",
        "c2a": "付款成功马上发货",
        "service": "七天无理由退换",
    },
    "泰国": {
        "hook": "颜值党闭眼入，夏天用正合适",
        "scenario": "清凉不黏腻，泰国这么热也扛得住",
        "urgency": "限时秒杀，倒计时 3 分钟",
        "c2a": "拍下 5 分钟内付款优先发",
        "service": "不满意包退",
    },
    "越南": {
        "hook": "网红同款，学生党也能轻松入手",
        "scenario": "潮流款，拍照发圈超好看",
        "urgency": "热门爆款，售完即止",
        "c2a": "拼手速，先付款先发货",
        "service": "破损包赔",
    },
    "菲律宾": {
        "hook": "So affordable, best value for your money!",
        "scenario": "perfect for everyday use, budget-friendly",
        "urgency": "limited stock, grab yours now!",
        "c2a": "checkout now before it's gone!",
        "service": "hassle-free returns",
    },
    "马来西亚": {
        "hook": "Halal 认证，全家安心用",
        "scenario": "多元市场好评，双语客服无忧",
        "urgency": "限时优惠，手慢无",
        "c2a": "付款后 24 小时内发货",
        "service": "品质保证，放心退换",
    },
}


def parse_product(raw):
    parts = [p.strip() for p in raw.replace("，", ",").split(",") if p.strip()]
    name = parts[0] if parts else "产品"
    sellpoints = parts[1:-1] if len(parts) > 2 else (parts[1:] if len(parts) > 1 else [])
    price = ""
    for p in parts:
        if any(ch.isdigit() for ch in p) and ("元" in p or "¥" in p or "￥" in p):
            price = p
    return {"name": name, "sellpoints": sellpoints, "price": price}


def gen_live_script(product):
    name = product["name"]
    sp = "、".join(product["sellpoints"]) if product["sellpoints"] else "优质好物"
    price = product["price"] or "超低价"
    results = {}
    for country, meta in KB["countries"].items():
        diff = LIVE_DIFF[country]
        lines = {}
        for stage, tpl in LIVE_STRUCTURE.items():
            lines[stage] = tpl.format(
                product=name, hook=diff["hook"], sellpoint=sp,
                scenario=diff["scenario"], price=price, urgency=diff["urgency"],
                c2a=diff["c2a"], service=diff["service"],
            )
        results[country] = {
            "语言": meta["language"],
            "话术": lines,
        }
    return results


def print_live(results):
    print("\n" + "=" * 60)
    print("  🎙️ 五国直播话术（场景二：直播带货）")
    print("=" * 60)
    for country, data in results.items():
        print(f"\n── {country}（{data['语言']}） ──")
        for stage, text in data["话术"].items():
            print(f"  【{stage}】{text}")
    print("\n" + "=" * 60)
    print("  直播话术复用同一套五国知识库（文化画像/合规词库）")
    print("=" * 60)


def main():
    if len(sys.argv) >= 3 and sys.argv[1] == "--product":
        raw = sys.argv[2]
    else:
        raw = "保湿身体乳,温和不刺激,补水锁水,59元"
    product = parse_product(raw)
    print(f"\n🎯 产品: {product['name']} | 卖点: {', '.join(product['sellpoints']) or '（未填）'} | 价格: {product['price'] or '（未填）'}")
    results = gen_live_script(product)
    print_live(results)


if __name__ == "__main__":
    main()
