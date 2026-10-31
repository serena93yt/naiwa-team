# -*- coding: utf-8 -*-
"""
TK 运营智能体 · 微测变体生成器
体现「控制变量」微测方法论：只改一个维度（hook/卖点/CTA），其他保持不变，
生成多个近似版本，供「小流量测试 → 数据回流 → 选出最优」使用。

用法:
    python variant_generator.py --dimension hook --product "保湿身体乳,温和不刺激,补水锁水,59元"
    python variant_generator.py --dimension sellpoint --product "保湿身体乳,温和不刺激,补水锁水,59元"
    python variant_generator.py --dimension cta --product "保湿身体乳,温和不刺激,补水锁水,59元"

输出: 指定维度的 N 个变体（每个变体只改一个变量），可对照测试哪个版本流量更好。
"""
import sys
from tk_agent import parse_product, KB, get_category_content, get_category_hashtag

DIM_CN = {"hook": "开场 Hook", "sellpoint": "卖点表述", "cta": "行动号召 CTA"}


def gen_variants(product, dimension):
    """生成指定维度的多个变体，控制变量（其余维度固定）。"""
    name = product["name"]
    sp = "、".join(product["sellpoints"]) if product["sellpoints"] else "优质好物"
    price = product["price"] or "价格优惠"
    category = product["category"]

    variants = {}
    for country, meta in KB["countries"].items():
        # 每个维度的候选集合
        hooks = meta["templates"]["hook"]          # 3 个
        ctas = meta["templates"]["cta"]            # 3 个
        sp_primary, sp_secondary = get_category_content(country, category)
        sellpoints = [sp_primary, sp_secondary]    # 2 个
        tags = get_category_hashtag(country, category)

        # 固定「非目标维度」，遍历「目标维度」
        if dimension == "hook":
            fixed_sp, fixed_cta = sellpoints[0], ctas[0]
            variants[country] = []
            for h in hooks:
                variants[country].append({
                    "变量值": h,
                    "文案": f"{h} {name}，{sp}，{fixed_sp}，{price}，性价比超高！{fixed_cta}"
                })
        elif dimension == "sellpoint":
            fixed_hook, fixed_cta = hooks[0], ctas[0]
            variants[country] = []
            for s in sellpoints:
                variants[country].append({
                    "变量值": s,
                    "文案": f"{fixed_hook} {name}，{sp}，{s}，{price}，性价比超高！{fixed_cta}"
                })
        elif dimension == "cta":
            fixed_hook, fixed_sp = hooks[0], sellpoints[0]
            variants[country] = []
            for c in ctas:
                variants[country].append({
                    "变量值": c,
                    "文案": f"{fixed_hook} {name}，{sp}，{fixed_sp}，{price}，性价比超高！{c}"
                })
        else:
            print(f"未知维度: {dimension}，可选 hook/sellpoint/cta")
            sys.exit(1)
    return variants


def print_variants(variants, dimension, product):
    dim_cn = DIM_CN.get(dimension, dimension)
    print("\n" + "=" * 64)
    print(f"  🔬 微测变体生成 · 控制变量：仅改「{dim_cn}」")
    print(f"  产品: {product['name']}（其余维度固定）")
    print("=" * 64)
    for country, vs in variants.items():
        meta = KB["countries"][country]
        print(f"\n── {country}（{meta['language']}）──")
        for i, v in enumerate(vs, 1):
            print(f"  [变体{i}] {dim_cn} = 「{v['变量值']}」")
            print(f"        {v['文案']}")
    print("\n" + "=" * 64)
    print("  💡 下一步：将 N 个变体分发到目标市场小流量测试，")
    print("     回流播放/完播/转化数据，选出最优版本，进入下一轮微测。")
    print("=" * 64)


def main():
    if len(sys.argv) >= 5 and sys.argv[1] == "--dimension" and sys.argv[3] == "--product":
        dimension = sys.argv[2]
        raw = sys.argv[4]
    else:
        # 默认演示
        dimension = "hook"
        raw = "保湿身体乳,温和不刺激,补水锁水,59元"

    product = parse_product(raw)
    variants = gen_variants(product, dimension)
    print_variants(variants, dimension, product)


if __name__ == "__main__":
    main()
